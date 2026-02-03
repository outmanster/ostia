const USER_PREFIX = "notify:user:";
const LAST_SEEN_PREFIX = "notify:last_seen:";
const SEEN_IDS_PREFIX = "notify:seen_ids:";

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function normalizeRelayUrls(relaysRaw) {
  return String(relaysRaw || "")
    .split(/[\n,]/g)
    .map((v) => v.trim())
    .filter(Boolean);
}

function normalizeRelayUrlSingle(input) {
  const v = String(input || "").trim();
  if (!v) return "";
  if (v.startsWith("wss://") || v.startsWith("ws://")) return v;
  if (v.startsWith("https://")) return `wss://${v.slice("https://".length)}`;
  if (v.startsWith("http://")) return `ws://${v.slice("http://".length)}`;
  return v;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseKinds(raw) {
  const v = String(raw || "").trim();
  if (!v) return [];
  const nums = v
    .split(/[\s,]+/g)
    .map((s) => Number(String(s || "").trim()))
    .filter((n) => Number.isFinite(n) && n >= 0 && n <= 65535);
  return Array.from(new Set(nums));
}

function hasPTag(event, pubkeyHex) {
  // 注意：对于 NIP-17 GiftWrap (Kind 1059) 消息，监听器无法看到发送者是谁（被加密在内部）。
  // 因此，监听器无法判断消息是否来自"互为联系人"。它只能判断消息是否是发给你的（通过 p tag）。
  // 客户端收到消息后解密才能知道发送者，并决定是否显示。
  // 如果客户端过滤了非联系人消息（导致未读），且没有向服务器发送 ACK（已读确认），
  // 服务器的 lastSeen 时间戳就不会更新，导致该消息一直被视为"新消息"并重复通知。
  const tags = event?.tags;
  if (!Array.isArray(tags)) return false;
  for (const t of tags) {
    if (!Array.isArray(t) || t.length < 2) continue;
    if (t[0] === "p" && String(t[1] || "").toLowerCase() === pubkeyHex) return true;
  }
  return false;
}

function isHex64(v) {
  return /^[0-9a-f]{64}$/.test(String(v || ""));
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}

function unauthorized() {
  return json({ status: "error", message: "Unauthorized" }, 401);
}

function isAuthorized(request, env) {
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : auth;
  if (env.AUTH_TOKEN && token !== env.AUTH_TOKEN) return false;
  return true;
}

async function readLastSeen(env, key) {
  if (!env.NOTIFY_KV) return 0;
  const v = await env.NOTIFY_KV.get(key);
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

async function writeLastSeen(env, key, value) {
  if (!env.NOTIFY_KV) return;
  await env.NOTIFY_KV.put(key, String(value));
}

async function readSeenIds(env, pubkeyHex) {
  if (!env.NOTIFY_KV) return [];
  const raw = await env.NOTIFY_KV.get(`${SEEN_IDS_PREFIX}${pubkeyHex}`);
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v.map((s) => String(s || "")).filter(Boolean);
  } catch {
    return [];
  }
}

async function writeSeenIds(env, pubkeyHex, ids) {
  if (!env.NOTIFY_KV) return;
  const unique = Array.from(new Set((ids || []).map((s) => String(s || "")).filter(Boolean))).slice(-400);
  await env.NOTIFY_KV.put(`${SEEN_IDS_PREFIX}${pubkeyHex}`, JSON.stringify(unique), { expirationTtl: 3 * 24 * 60 * 60 });
}

async function readUserConfig(env, pubkeyHex) {
  if (!env.NOTIFY_KV) return null;
  const raw = await env.NOTIFY_KV.get(`${USER_PREFIX}${pubkeyHex}`);
  if (!raw) return null;
  try {
    const cfg = JSON.parse(raw);
    return cfg && typeof cfg === "object" ? cfg : null;
  } catch {
    return null;
  }
}

async function writeUserConfig(env, pubkeyHex, cfg) {
  if (!env.NOTIFY_KV) throw new Error("missing KV binding");
  await env.NOTIFY_KV.put(`${USER_PREFIX}${pubkeyHex}`, JSON.stringify(cfg));
}

async function deleteUserConfig(env, pubkeyHex) {
  if (!env.NOTIFY_KV) throw new Error("missing KV binding");
  await env.NOTIFY_KV.delete(`${USER_PREFIX}${pubkeyHex}`);
}

async function ackUser(env, pubkeyHex, atSeconds) {
  if (!env.NOTIFY_KV) throw new Error("missing KV binding");
  const at = Number(atSeconds);
  const explicitAt = Number.isFinite(at) && at > 0 ? Math.floor(at) : null;
  const now = nowSeconds();
  const ts = explicitAt ?? now;
  const driftSeconds = explicitAt ? 0 : 30;
  const effectiveLastSeen = Math.max(0, ts - driftSeconds);
  await writeLastSeen(env, `${LAST_SEEN_PREFIX}${pubkeyHex}`, effectiveLastSeen);
  // await env.NOTIFY_KV.delete(`${SEEN_IDS_PREFIX}${pubkeyHex}`);
  return effectiveLastSeen;
}

async function connectAndFetchEvents(relayUrl, filter, timeoutMs, options) {
  const startedAt = Date.now();
  return await new Promise((resolve) => {
    const ws = new WebSocket(relayUrl);
    const subId = `ostia_${Math.random().toString(16).slice(2)}`;
    const events = [];
    let done = false;
    let opened = false;
    let error = null;
    let closeCode = null;
    let closeReason = null;
    let eoseSeen = false;

    const finish = () => {
      if (done) return;
      done = true;
      try {
        ws.close(1000, "done");
      } catch { }
      const tookMs = Date.now() - startedAt;
      const ok = !error && opened;
      resolve({ relayUrl, ok, opened, error, closeCode, closeReason, tookMs, events });
    };

    let timer = setTimeout(finish, timeoutMs);
    const keepOpenMs = Number(options?.keepOpenMs || 0);

    ws.addEventListener("open", () => {
      opened = true;
      try {
        ws.send(JSON.stringify(["REQ", subId, filter]));
      } catch {
        error = "send_failed";
        clearTimeout(timer);
        finish();
      }
    });

    ws.addEventListener("message", (ev) => {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }

      if (!Array.isArray(msg) || msg.length < 2) return;
      const type = msg[0];
      if (type === "EVENT") {
        const event = msg[2];
        if (event) events.push(event);
      } else if (type === "EOSE") {
        eoseSeen = true;
        if (keepOpenMs > 0) {
          clearTimeout(timer);
          timer = setTimeout(finish, keepOpenMs);
          return;
        }
        clearTimeout(timer);
        finish();
      }
    });

    ws.addEventListener("error", () => {
      error = error || "ws_error";
      clearTimeout(timer);
      finish();
    });

    ws.addEventListener("close", (ev) => {
      closeCode = Number(ev?.code);
      closeReason = String(ev?.reason || "");
      if (!done && Number.isFinite(closeCode) && closeCode !== 1000) {
        error = error || `ws_closed_${closeCode}`;
      }
      if (!done && opened && !eoseSeen && keepOpenMs > 0) {
        error = error || "closed_before_eose";
      }
      if (!done) {
        clearTimeout(timer);
        finish();
      }
    });
  });
}

async function connectAndFetchEventsWithRetry(relayUrl, filter, timeoutMs, options) {
  const retries = Math.max(0, Number(options?.retries || 0));
  const retryDelayMs = Math.max(0, Number(options?.retryDelayMs || 0));
  let attempt = 0;
  let last = null;
  const errors = [];
  for (attempt = 0; attempt <= retries; attempt++) {
    const result = await connectAndFetchEvents(relayUrl, filter, timeoutMs, options);
    last = result;
    if (result?.error) errors.push(result.error);
    if (result?.ok || (result?.opened && (result?.events?.length || 0) > 0)) {
      return { ...result, attempts: attempt + 1, errors };
    }
    if (attempt < retries && retryDelayMs > 0) {
      await sleep(retryDelayMs);
    }
  }
  if (!last) {
    return { relayUrl, ok: false, opened: false, error: "no_result", closeCode: null, closeReason: null, tookMs: null, events: [], attempts: attempt, errors };
  }
  return { ...last, attempts: attempt, errors };
}

async function sendPushByConfig(cfg, env, title, body, meta) {
  const pushEndpointUrl = String(cfg?.pushEndpointUrl || env.PUSH_ENDPOINT_URL || "").trim();
  if (!pushEndpointUrl) return { ok: false, status: 0, text: "missing pushEndpointUrl" };

  const headers = { "Content-Type": "application/json" };
  const token = String(cfg?.pushEndpointAuthToken || env.PUSH_ENDPOINT_AUTH_TOKEN || "").trim();
  if (token) headers.Authorization = `Bearer ${token}`;

  const deviceKey = String(cfg?.deviceKey || env.PUSH_DEVICE_KEY || "").trim();
  const payload = {
    title,
    body,
    meta: {
      pubkeyHex: meta?.pubkeyHex,
      count: meta?.count,
    },
    deviceKey: deviceKey || undefined,
  };

  try {
    const resp = await fetch(pushEndpointUrl, { method: "POST", headers, body: JSON.stringify(payload) });
    const text = await resp.text();
    return { ok: resp.ok, status: resp.status, text };
  } catch (e) {
    return { ok: false, status: 0, text: e instanceof Error ? e.message : String(e) };
  }
}

async function runOnceForUser(env, pubkeyHex, cfg, options) {
  if (!isHex64(pubkeyHex)) {
    return { ok: false, message: "invalid pubkeyHex", pubkeyHex };
  }

  const relays = Array.isArray(cfg?.relays) ? cfg.relays : normalizeRelayUrls(env.NOSTR_RELAYS);
  const relayUrls = relays.map((v) => normalizeRelayUrlSingle(v)).filter(Boolean);
  if (relayUrls.length === 0) {
    return { ok: false, message: "missing relays", pubkeyHex };
  }

  const lastSeenKey = `${LAST_SEEN_PREFIX}${pubkeyHex}`;
  const lastSeen = await readLastSeen(env, lastSeenKey);
  const now = nowSeconds();
  const graceSeconds = 60;
  let since = lastSeen ? Math.max(0, lastSeen - graceSeconds) : Math.max(0, now - 300);
  const sinceOverride = Number(options?.sinceOverride);
  if (Number.isFinite(sinceOverride) && sinceOverride > 0) {
    since = Math.floor(sinceOverride);
  } else {
    const lookbackSeconds = Number(options?.lookbackSeconds);
    if (Number.isFinite(lookbackSeconds) && lookbackSeconds > 0) {
      since = Math.max(0, now - Math.floor(lookbackSeconds));
    }
  }

  const configuredKinds =
    Array.isArray(cfg?.kinds) && cfg.kinds.length > 0
      ? cfg.kinds.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n >= 0 && n <= 65535)
      : parseKinds(env.NOSTR_KINDS);
  const kinds = configuredKinds.length > 0 ? Array.from(new Set(configuredKinds)) : [1059];

  const filterWithP = {
    kinds,
    "#p": [pubkeyHex],
    since,
    limit: 50,
  };
  const filterNoP = {
    kinds,
    since,
    limit: 200,
  };

  const baseTimeoutMs = Number(env.NOSTR_TIMEOUT_MS || 7000);
  const streamMs = Number(options?.streamMs || 0);
  const timeoutMs = streamMs > 0 ? Math.max(baseTimeoutMs, streamMs + 2000) : baseTimeoutMs;
  const disablePFilter = ["1", "true", "yes"].includes(String(env.NOSTR_DISABLE_P_FILTER || "").toLowerCase());
  const fallbackNoP = !["0", "false", "no"].includes(String(env.NOSTR_FALLBACK_NO_P || "1").toLowerCase());
  const retryTimes = Math.max(0, Number(env.NOSTR_RETRY || 1));
  const retryDelayMs = Math.max(0, Number(env.NOSTR_RETRY_DELAY_MS || 400));
  const allEventsById = new Map();
  const relayDiags = [];
  for (const relayUrl of relayUrls) {
    try {
      let matched = [];
      let mode = disablePFilter ? "no_p" : "with_p";

      const r1 = await connectAndFetchEventsWithRetry(relayUrl, disablePFilter ? filterNoP : filterWithP, timeoutMs, {
        keepOpenMs: streamMs > 0 ? streamMs : 0,
        retries: retryTimes,
        retryDelayMs,
      });
      matched = disablePFilter ? r1.events.filter((e) => hasPTag(e, pubkeyHex)) : r1.events;

      if (!disablePFilter && matched.length === 0 && fallbackNoP) {
        const r2 = await connectAndFetchEventsWithRetry(relayUrl, filterNoP, timeoutMs, {
          keepOpenMs: streamMs > 0 ? streamMs : 0,
          retries: retryTimes,
          retryDelayMs,
        });
        const matched2 = r2.events.filter((e) => hasPTag(e, pubkeyHex));
        if (matched2.length > 0) {
          mode = "fallback_no_p";
          matched = matched2;
        }
        if (options?.includeDiag) {
          relayDiags.push({
            relayUrl,
            ok: r1.ok && r2.ok,
            opened: r1.opened || r2.opened,
            error: r1.error || r2.error,
            closeCode: r2.closeCode ?? r1.closeCode,
            closeReason: r2.closeReason ?? r1.closeReason,
            tookMs: (r1.tookMs || 0) + (r2.tookMs || 0),
            mode,
            serverEventsCount: r1.events.length + r2.events.length,
            matchedCount: matched.length,
            attempts: Math.max(r1.attempts || 0, r2.attempts || 0),
            errors: [...(r1.errors || []), ...(r2.errors || [])],
          });
        }
      } else if (options?.includeDiag) {
        relayDiags.push({
          relayUrl,
          ok: r1.ok,
          opened: r1.opened,
          error: r1.error,
          closeCode: r1.closeCode,
          closeReason: r1.closeReason,
          tookMs: r1.tookMs,
          mode,
          serverEventsCount: r1.events.length,
          matchedCount: matched.length,
          attempts: r1.attempts,
          errors: r1.errors,
        });
      }

      for (const ev of matched) {
        const id = String(ev?.id || "");
        if (!id) continue;
        if (!allEventsById.has(id)) allEventsById.set(id, ev);
      }
    } catch (e) {
      if (options?.includeDiag) {
        relayDiags.push({
          relayUrl,
          ok: false,
          opened: false,
          error: e instanceof Error ? e.message : String(e),
          closeCode: null,
          closeReason: null,
          tookMs: null,
          mode: "error",
          serverEventsCount: 0,
          matchedCount: 0,
        });
      }
    }
  }

  const uniqueEvents = Array.from(allEventsById.values());
  const newest = uniqueEvents
    .map((e) => Number(e?.created_at || 0))
    .filter((n) => Number.isFinite(n) && n > 0)
    .reduce((a, b) => Math.max(a, b), lastSeen);

  const seenIds = await readSeenIds(env, pubkeyHex);
  const seenSet = new Set(seenIds);
  const newEvents = uniqueEvents.filter((e) => {
    const createdAt = Number(e?.created_at || 0);
    const id = String(e?.id || "");
    if (!id) return false;
    if (!Number.isFinite(createdAt) || createdAt <= 0) return false;
    if (createdAt > lastSeen) {
      if (seenSet.has(id)) return false;
      return true;
    }
    if (createdAt >= Math.max(0, lastSeen - graceSeconds) && !seenSet.has(id)) return true;
    return false;
  });

  const newCount = newEvents.length;
  if (newCount === 0) {
    const base = { ok: true, message: "no new events", count: 0, lastSeen, newest, pubkeyHex };
    if (options?.includeDiag) {
      return {
        ...base,
        diag: {
          relayUrls,
          kinds,
          since,
          timeoutMs,
          streamMs: streamMs > 0 ? streamMs : 0,
          disablePFilter,
          fallbackNoP,
          relayDiags,
        },
      };
    }
    return base;
  }

  const title = String(cfg?.pushTitle || env.PUSH_TITLE || "Ostia 新消息");
  const body = `你有 ${newCount} 条新消息`;
  const push = await sendPushByConfig(cfg, env, title, body, { pubkeyHex, count: newCount });

  if (push.ok) {
    // 修正：之前这里尝试写入 undefined 的 lastNotifiedKey 导致 crash，
    // 进而导致 seenIds 没有保存，产生重复通知。
    // 我们现在完全依赖 seenIds 进行去重，而不自动更新 lastSeen（需等待用户 ACK）。

    for (const ev of newEvents) {
      const id = String(ev?.id || "");
      if (id) seenSet.add(id);
    }
    await writeSeenIds(env, pubkeyHex, Array.from(seenSet));
  }

  const result = {
    ok: push.ok,
    message: push.ok ? "pushed" : "push_failed",
    count: newCount,
    lastSeen,
    newest,
    pubkeyHex,
    pushStatus: push.status,
    pushBody: push.text,
  };
  if (options?.includeDiag) {
    return {
      ...result,
      diag: {
        relayUrls,
        kinds,
        since,
        timeoutMs,
        streamMs: streamMs > 0 ? streamMs : 0,
        disablePFilter,
        fallbackNoP,
        relayDiags,
      },
    };
  }
  return result;
}

async function runOnceSingleUserEnv(env, options) {
  const pubkeyHex = String(env.NOSTR_PUBKEY_HEX || "").trim().toLowerCase();
  if (!isHex64(pubkeyHex)) {
    return { ok: false, message: "missing/invalid NOSTR_PUBKEY_HEX (need 64 hex chars)" };
  }

  let cfgFromKv = null;
  try {
    cfgFromKv = await readUserConfig(env, pubkeyHex);
  } catch {
    cfgFromKv = null;
  }

  const cfg = {
    relays: Array.isArray(cfgFromKv?.relays) && cfgFromKv.relays.length > 0 ? cfgFromKv.relays : normalizeRelayUrls(env.NOSTR_RELAYS),
    pushTitle: String(cfgFromKv?.pushTitle || env.PUSH_TITLE || "").trim(),
    pushEndpointUrl: String(cfgFromKv?.pushEndpointUrl || env.PUSH_ENDPOINT_URL || "").trim(),
    pushEndpointAuthToken: String(cfgFromKv?.pushEndpointAuthToken || env.PUSH_ENDPOINT_AUTH_TOKEN || "").trim(),
    deviceKey: String(cfgFromKv?.deviceKey || env.PUSH_DEVICE_KEY || "").trim(),
    kinds: Array.isArray(cfgFromKv?.kinds) ? cfgFromKv.kinds : undefined,
  };

  return await runOnceForUser(env, pubkeyHex, cfg, options);
}

async function runOnceAllUsers(env, options) {
  if (!env.NOTIFY_KV) return { ok: false, message: "missing KV binding" };

  const results = [];
  let cursor = undefined;
  for (let i = 0; i < 10; i++) {
    const page = await env.NOTIFY_KV.list({ prefix: USER_PREFIX, cursor });
    for (const k of page.keys || []) {
      const pubkeyHex = String(k.name).slice(USER_PREFIX.length);
      const cfg = await readUserConfig(env, pubkeyHex);
      if (!cfg) continue;
      const r = await runOnceForUser(env, pubkeyHex, cfg, options);
      results.push(r);
    }
    if (!page.list_complete) {
      cursor = page.cursor;
    } else {
      break;
    }
  }

  return { ok: true, count: results.length, results };
}

export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(
      (async () => {
        const single = Boolean(String(env.NOSTR_PUBKEY_HEX || "").trim());
        const result = single ? await runOnceSingleUserEnv(env, { includeDiag: false }) : await runOnceAllUsers(env, { includeDiag: false });
        if (single) {
          const r = result || {};
          console.log(
            JSON.stringify({
              tag: "listener-worker",
              mode: "single",
              ok: Boolean(r.ok),
              message: r.message,
              count: r.count,
              pushStatus: r.pushStatus,
              pubkeyHex: r.pubkeyHex,
            })
          );
        } else {
          console.log(
            JSON.stringify({
              tag: "listener-worker",
              mode: "kv",
              ok: Boolean(result?.ok),
              users: result?.count,
            })
          );
        }
      })()
    );
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    const includeDiag = ["1", "true", "yes"].includes(String(url.searchParams.get("diag") || "").toLowerCase());
    const sinceQuery = Number(url.searchParams.get("since"));
    const lookbackQuery = Number(url.searchParams.get("lookback"));
    const streamMsQuery = Number(url.searchParams.get("streamMs"));
    const now = nowSeconds();
    const sinceOverride = Number.isFinite(sinceQuery) && sinceQuery > 0 && sinceQuery <= now + 600 ? sinceQuery : undefined;
    const lookbackSeconds =
      Number.isFinite(lookbackQuery) && lookbackQuery > 0 && lookbackQuery <= 30 * 24 * 60 * 60 ? lookbackQuery : undefined;
    const envStreamMs = Number(env.NOSTR_STREAM_MS || 0);
    const streamMs =
      Number.isFinite(streamMsQuery) && streamMsQuery > 0 && streamMsQuery <= 60 * 1000
        ? streamMsQuery
        : Number.isFinite(envStreamMs) && envStreamMs > 0
          ? envStreamMs
          : undefined;

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (request.method === "GET" && url.pathname === "/health") {
      return new Response("ok", { status: 200, headers: corsHeaders() });
    }

    if (request.method === "POST" && url.pathname === "/register") {
      if (!isAuthorized(request, env)) return unauthorized();
      if (!env.NOTIFY_KV) return json({ status: "error", message: "missing KV binding" }, 500);

      let payload;
      try {
        payload = await request.json();
      } catch {
        return json({ status: "error", message: "Invalid JSON" }, 400);
      }

      const pubkeyHex = String(payload?.pubkeyHex || "").trim().toLowerCase();
      const relays = Array.isArray(payload?.relays) ? payload.relays : normalizeRelayUrls(payload?.relays);
      const relayUrls = relays.map((v) => String(v || "").trim()).filter(Boolean);
      const pushTitle = String(payload?.pushTitle || "").trim();
      const pushEndpointUrl = String(payload?.pushEndpointUrl || "").trim();
      const pushEndpointAuthToken = String(payload?.pushEndpointAuthToken || "").trim();
      const deviceKey = String(payload?.deviceKey || "").trim();

      if (!isHex64(pubkeyHex)) return json({ status: "error", message: "invalid pubkeyHex" }, 400);
      if (!pushEndpointUrl) return json({ status: "error", message: "missing pushEndpointUrl" }, 400);
      if (relayUrls.length === 0) return json({ status: "error", message: "missing relays" }, 400);

      const cfg = {
        pubkeyHex,
        relays: relayUrls,
        pushTitle: pushTitle || undefined,
        pushEndpointUrl: pushEndpointUrl || undefined,
        pushEndpointAuthToken: pushEndpointAuthToken || undefined,
        deviceKey: deviceKey || undefined,
        updatedAt: nowSeconds(),
      };

      await writeUserConfig(env, pubkeyHex, cfg);
      return json({ ok: true });
    }

    if (request.method === "POST" && url.pathname === "/unregister") {
      if (!isAuthorized(request, env)) return unauthorized();
      if (!env.NOTIFY_KV) return json({ status: "error", message: "missing KV binding" }, 500);

      let payload;
      try {
        payload = await request.json();
      } catch {
        return json({ status: "error", message: "Invalid JSON" }, 400);
      }

      const pubkeyHex = String(payload?.pubkeyHex || "").trim().toLowerCase();
      if (!isHex64(pubkeyHex)) return json({ status: "error", message: "invalid pubkeyHex" }, 400);

      await deleteUserConfig(env, pubkeyHex);
      return json({ ok: true });
    }

    if (request.method === "POST" && url.pathname === "/ack") {
      if (!isAuthorized(request, env)) return unauthorized();
      if (!env.NOTIFY_KV) return json({ status: "error", message: "missing KV binding" }, 500);

      let payload = null;
      try {
        payload = await request.json();
      } catch {
        payload = null;
      }

      const at = payload?.at;

      if (String(env.NOSTR_PUBKEY_HEX || "").trim()) {
        const pubkeyHex = String(env.NOSTR_PUBKEY_HEX || "").trim().toLowerCase();
        if (!isHex64(pubkeyHex)) return json({ ok: false, message: "invalid pubkeyHex", pubkeyHex }, 400);
        const ts = await ackUser(env, pubkeyHex, at);
        return json({ ok: true, pubkeyHex, lastSeen: ts });
      }

      const pubkeyHex = String(payload?.pubkeyHex || "").trim().toLowerCase();
      if (!isHex64(pubkeyHex)) return json({ ok: false, message: "invalid pubkeyHex", pubkeyHex }, 400);
      const cfg = await readUserConfig(env, pubkeyHex);
      if (!cfg) return json({ ok: false, message: "not registered", pubkeyHex }, 404);
      const ts = await ackUser(env, pubkeyHex, at);
      return json({ ok: true, pubkeyHex, lastSeen: ts });
    }

    if (request.method === "POST" && url.pathname === "/selftest-push") {
      if (!isAuthorized(request, env)) return unauthorized();

      let payload = null;
      try {
        payload = await request.json();
      } catch {
        payload = null;
      }

      if (String(env.NOSTR_PUBKEY_HEX || "").trim()) {
        const pubkeyHex = String(env.NOSTR_PUBKEY_HEX || "").trim().toLowerCase();
        const cfg = {
          relays: normalizeRelayUrls(env.NOSTR_RELAYS),
          pushTitle: String(env.PUSH_TITLE || "").trim(),
          pushEndpointUrl: String(env.PUSH_ENDPOINT_URL || "").trim(),
          pushEndpointAuthToken: String(env.PUSH_ENDPOINT_AUTH_TOKEN || "").trim(),
          deviceKey: String(env.PUSH_DEVICE_KEY || "").trim(),
        };
        const title = String(payload?.title || "Ostia 推送自检");
        const body = String(payload?.body || "如果你看到这条通知，说明推送链路正常。");
        const push = await sendPushByConfig(cfg, env, title, body, { pubkeyHex, count: 0 });
        return json({ ok: push.ok, pushStatus: push.status, pushBody: push.text }, push.ok ? 200 : 500);
      }

      const pubkeyHex = String(payload?.pubkeyHex || "").trim().toLowerCase();
      if (!isHex64(pubkeyHex)) return json({ ok: false, message: "invalid pubkeyHex", pubkeyHex }, 400);

      let cfg = await readUserConfig(env, pubkeyHex);

      // Allow testing with full config even if not registered
      if (!cfg) {
        if (payload?.pushEndpointUrl && payload?.deviceKey) {
          cfg = { pubkeyHex, relays: [] };
        } else {
          return json({ ok: false, message: "not registered", pubkeyHex }, 404);
        }
      }

      // Apply overrides from payload for testing
      if (payload?.pushEndpointUrl) cfg.pushEndpointUrl = String(payload.pushEndpointUrl).trim();
      if (payload?.pushEndpointAuthToken !== undefined) cfg.pushEndpointAuthToken = String(payload.pushEndpointAuthToken).trim();
      if (payload?.deviceKey) cfg.deviceKey = String(payload.deviceKey).trim();
      if (payload?.pushTitle) cfg.pushTitle = String(payload.pushTitle).trim();

      const title = String(payload?.title || cfg.pushTitle || "Ostia 推送自检");
      const body = String(payload?.body || "如果你看到这条通知，说明推送链路正常。");
      const push = await sendPushByConfig(cfg, env, title, body, { pubkeyHex, count: 0 });
      return json({ ok: push.ok, pushStatus: push.status, pushBody: push.text }, push.ok ? 200 : 500);
    }

    if (request.method === "POST" && url.pathname === "/run") {
      if (!isAuthorized(request, env)) return unauthorized();

      let payload = null;
      try {
        payload = await request.json();
      } catch {
        payload = null;
      }

      if (String(env.NOSTR_PUBKEY_HEX || "").trim()) {
        const result = await runOnceSingleUserEnv(env, { includeDiag, sinceOverride, lookbackSeconds, streamMs });
        return json(result, result.ok ? 200 : 500);
      }

      const pubkeyHex = String(payload?.pubkeyHex || "").trim().toLowerCase();
      if (pubkeyHex) {
        if (!isHex64(pubkeyHex)) return json({ ok: false, message: "invalid pubkeyHex", pubkeyHex }, 400);
        const cfg = await readUserConfig(env, pubkeyHex);
        if (!cfg) return json({ ok: false, message: "not registered", pubkeyHex }, 404);
        const result = await runOnceForUser(env, pubkeyHex, cfg, { includeDiag, sinceOverride, lookbackSeconds, streamMs });
        return json(result, result.ok ? 200 : 500);
      }

      const result = await runOnceAllUsers(env, { includeDiag, sinceOverride, lookbackSeconds, streamMs });
      return json(result, result.ok ? 200 : 500);
    }

    return new Response("Not Found", { status: 404, headers: corsHeaders() });
  },
};
