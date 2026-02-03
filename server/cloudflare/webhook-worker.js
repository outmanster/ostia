export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return new Response("ok", { status: 200 });
    }

    if (request.method !== "POST") {
      return new Response("Not Found", { status: 404 });
    }

    const match = /^\/push(?:\/([a-z0-9_-]+))?$/.exec(url.pathname);
    if (!match) {
      return new Response("Not Found", { status: 404 });
    }
    const providerRaw = String(match[1] || "").trim().toLowerCase();
    const provider = providerRaw || "bark";

    const auth = request.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : auth;
    if (env.AUTH_TOKEN && token !== env.AUTH_TOKEN) {
      return new Response(JSON.stringify({ status: "error", message: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return new Response(JSON.stringify({ status: "error", message: "Invalid JSON" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const deviceKey = String(payload.deviceKey || "").trim();
    const title = String(payload.title || "").trim();
    const body = String(payload.body || "").trim();
    if (!title || !body) {
      return new Response(JSON.stringify({ status: "error", message: "Missing title/body" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (!deviceKey) {
      return new Response(JSON.stringify({ status: "error", message: "Missing deviceKey/title/body" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (provider === "bark") {
      const baseUrl = (env.BARK_BASE_URL || "https://api.day.app").replace(/\/+$/, "");
      const barkUrl = new URL(
        `${baseUrl}/${encodeURIComponent(deviceKey)}/${encodeURIComponent(title)}/${encodeURIComponent(body)}`
      );

      const defaultIcon = "https://ostia.opensaas.cc/logo_padded.png";
      const optionalParams = [
        ["url", payload.url],
        ["group", payload.group],
        ["sound", payload.sound],
        ["badge", payload.badge],
        ["icon", payload.icon || defaultIcon],
        ["level", payload.level],
      ];

      for (const [key, value] of optionalParams) {
        if (value !== undefined && value !== null && String(value).trim() !== "") {
          barkUrl.searchParams.set(key, String(value));
        }
      }

      const barkResponse = await fetch(barkUrl.toString(), { method: "GET" });
      const text = await barkResponse.text();

      return new Response(text, {
        status: barkResponse.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (provider === "discord") {
      const discordContent = `**${title}**\n${body}`;
      const resp = await fetch(deviceKey, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: discordContent }),
      });
      const text = await resp.text();
      return new Response(text, { status: resp.status, headers: { "Content-Type": "application/json" } });
    }

    if (provider === "slack") {
      const slackContent = `*${title}*\n${body}`;
      const resp = await fetch(deviceKey, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: slackContent }),
      });
      const text = await resp.text();
      return new Response(text, { status: resp.status, headers: { "Content-Type": "application/json" } });
    }

    if (provider === "feishu") {
      const resp = await fetch(deviceKey, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          msg_type: "interactive",
          card: {
            header: {
              title: { tag: "plain_text", content: title },
              template: "blue"
            },
            elements: [
              {
                tag: "div",
                text: { tag: "lark_md", content: body }
              },
              {
                tag: "img_combination",
                combinations: [
                  {
                    tag: "img",
                    img_key: "", // Not used when using url
                    url: "https://ostia.opensaas.cc/logo_padded.png",
                    mode: "fit_horizontal"
                  }
                ]
              }
            ]
          }
        }),
      });
      const text = await resp.text();
      return new Response(text, { status: resp.status, headers: { "Content-Type": "application/json" } });
    }

    if (provider === "wecom") {
      const endpoint = `https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=${encodeURIComponent(deviceKey)}`;
      const markdownContent = `### ${title}\n\n${body}`;
      const resp = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          msgtype: "markdown",
          markdown: { content: markdownContent }
        }),
      });
      const text = await resp.text();
      return new Response(text, { status: resp.status, headers: { "Content-Type": "application/json" } });
    }

    if (provider === "dingtalk") {
      const endpoint = deviceKey.startsWith("http://") || deviceKey.startsWith("https://")
        ? deviceKey
        : `https://oapi.dingtalk.com/robot/send?access_token=${encodeURIComponent(deviceKey)}`;

      const markdownContent = `### ${title}\n\n${body}`;

      const resp = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          msgtype: "markdown",
          markdown: {
            title: title,
            text: markdownContent
          }
        }),
      });
      const text = await resp.text();
      return new Response(text, { status: resp.status, headers: { "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ status: "error", message: `Unknown provider: ${provider}` }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  },
};
