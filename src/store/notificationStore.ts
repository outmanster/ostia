import { create } from "zustand";
import { persist } from "zustand/middleware";
import { toast } from "sonner";
import { npubToHex } from "@/utils/nostr";
import { useAuthStore } from "@/store/authStore";
import { useRelayStore } from "@/store/relayStore";

export type PushType = "webhook" | "bark" | "discord" | "slack" | "feishu" | "wecom" | "dingtalk";

const pushTypes: PushType[] = ["webhook", "bark", "discord", "slack", "feishu", "wecom", "dingtalk"];

function isPushType(v: unknown): v is PushType {
  return typeof v === "string" && (pushTypes as string[]).includes(v);
}

export interface PushConfig {
  enabled: boolean;
  listenerServerUrl: string;
  listenerServerAuthToken: string;
  pushType: PushType;
  pushEndpointUrl: string;
  pushEndpointAuthToken: string;
  deviceKey: string;
  pushTitle: string;
}

interface NotificationState {
  push: PushConfig;
  isSaving: boolean;
  error: string | null;
  setPush: (patch: Partial<PushConfig>) => void;
  registerPush: () => Promise<void>;
  unregisterPush: () => Promise<void>;
  selftestPush: () => Promise<void>;
  ack: (at?: number) => Promise<void>;
}

function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

function isValidHttpUrl(input: string): boolean {
  const v = input.trim();
  if (!v) return false;
  try {
    const u = new URL(v);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

async function callWorker<T>(
  listenerServerUrl: string,
  path: string,
  listenerServerAuthToken: string,
  body?: unknown
): Promise<T> {
  const base = normalizeBaseUrl(listenerServerUrl);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (listenerServerAuthToken.trim()) {
    headers.Authorization = `Bearer ${listenerServerAuthToken.trim()}`;
  }

  let resp: Response;
  try {
    resp = await fetch(`${base}${path}`, {
      method: "POST",
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    if (e instanceof TypeError) {
      throw new Error(`网络连接失败: 无法访问监听服务器 ${base}`);
    }
    throw e;
  }

  const text = await resp.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!resp.ok) {
    const message = json?.message || json?.error || text || `HTTP ${resp.status}`;
    throw new Error(String(message));
  }

  return (json as T) ?? ({} as T);
}

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set, get) => ({
      push: {
        enabled: false,
        listenerServerUrl: "",
        listenerServerAuthToken: "",
        pushType: "webhook",
        pushEndpointUrl: "",
        pushEndpointAuthToken: "",
        deviceKey: "",
        pushTitle: "Ostia",
      },
      isSaving: false,
      error: null,

      setPush: (patch) =>
        set((state) => ({
          push: { ...state.push, ...patch },
        })),

      registerPush: async () => {
        const { push } = get();
        const npub = useAuthStore.getState().npub;
        if (!npub) {
          toast.error("未登录，无法配置推送");
          return;
        }
        const listenerServerUrl = push.listenerServerUrl.trim();
        if (!listenerServerUrl) {
          toast.error("请填写监听服务器地址");
          return;
        }
        if (!isValidHttpUrl(listenerServerUrl)) {
          toast.error("监听服务器地址格式不正确");
          return;
        }
        const pushEndpointUrl = push.pushEndpointUrl.trim();
        if (!pushEndpointUrl) {
          toast.error("请填写推送网关地址");
          return;
        }
        if (!isValidHttpUrl(pushEndpointUrl)) {
          toast.error("推送网关地址格式不正确");
          return;
        }
        const deviceKey = push.deviceKey.trim();
        if (push.pushType !== "webhook" && !deviceKey) {
          toast.error("该推送类型需要填写 Key 或 Webhook 地址");
          return;
        }

        set({ isSaving: true, error: null });
        try {
          const pubkeyHex = await npubToHex(npub);

          const relayStore = useRelayStore.getState();
          const urls =
            relayStore.config.customRelays.length > 0
              ? relayStore.config.customRelays
              : relayStore.myRelays.map((r) => r.url);
          const relays = urls.map((u) => u.trim()).filter(Boolean);

          if (relays.length === 0) {
            toast.error("未找到可用中继器，请先在中继器管理里添加");
            return;
          }

          await callWorker(
            listenerServerUrl,
            "/register",
            push.listenerServerAuthToken,
            {
              pubkeyHex,
              relays,
              pushTitle: push.pushTitle.trim(),
              pushEndpointUrl: pushEndpointUrl || undefined,
              pushEndpointAuthToken: push.pushEndpointAuthToken.trim() || undefined,
              deviceKey: deviceKey || undefined,
            }
          );

          try {
            await callWorker(listenerServerUrl, "/ack", push.listenerServerAuthToken, { pubkeyHex });
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            if (msg.includes("Not Found") || msg.includes("404")) {
              throw new Error("监听服务器不支持 /ack，请更新部署监听器后重试");
            }
            throw new Error(`推送启用成功，但同步已读起点失败: ${msg}`);
          }

          set((state) => ({ push: { ...state.push, enabled: true } }));
          toast.success("已启用推送");
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          set({ error: msg });
          toast.error(`启用推送失败: ${msg}`);
        } finally {
          set({ isSaving: false });
        }
      },

      unregisterPush: async () => {
        const { push } = get();
        const npub = useAuthStore.getState().npub;
        if (!npub) {
          toast.error("未登录，无法取消推送");
          return;
        }
        const listenerServerUrl = push.listenerServerUrl.trim();
        if (!listenerServerUrl) {
          toast.error("请填写监听服务器地址");
          return;
        }

        set({ isSaving: true, error: null });
        try {
          const pubkeyHex = await npubToHex(npub);
          await callWorker(listenerServerUrl, "/unregister", push.listenerServerAuthToken, { pubkeyHex });
          set((state) => ({ push: { ...state.push, enabled: false } }));
          toast.success("已关闭推送");
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          set({ error: msg });
          toast.error(`关闭推送失败: ${msg}`);
        } finally {
          set({ isSaving: false });
        }
      },
      selftestPush: async () => {
        const { push } = get();
        const npub = useAuthStore.getState().npub;
        if (!npub) {
          toast.error("未登录，无法进行推送自检");
          return;
        }

        const listenerServerUrl = push.listenerServerUrl.trim();
        if (!listenerServerUrl) {
          toast.error("请填写监听服务器地址");
          return;
        }
        if (!isValidHttpUrl(listenerServerUrl)) {
          toast.error("监听服务器地址格式不正确");
          return;
        }

        set({ isSaving: true, error: null });
        try {
          const pubkeyHex = await npubToHex(npub);
          const title = push.pushTitle.trim() || "Ostia 推送自检";
          const body = "如果你看到这条通知，说明推送链路正常。";
          
          const result = await callWorker<{ ok?: boolean; pushStatus?: number; pushBody?: string }>(
            listenerServerUrl,
            "/selftest-push",
            push.listenerServerAuthToken,
            { 
              pubkeyHex,
              title, 
              body,
              // Carry current config for testing
              deviceKey: push.deviceKey.trim() || undefined,
              pushEndpointUrl: push.pushEndpointUrl.trim() || undefined,
              pushEndpointAuthToken: push.pushEndpointAuthToken.trim() || undefined
            }
          );
          if (result?.ok === false) {
            throw new Error(result?.pushBody || "推送失败");
          }
          toast.success("推送自检已发送");
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          set({ error: msg });
          toast.error(`推送自检失败: ${msg}`);
        } finally {
          set({ isSaving: false });
        }
      },
      ack: async (at?: number) => {
        const { push } = get();
        if (!push.enabled || !push.listenerServerUrl) return;

        const npub = useAuthStore.getState().npub;
        if (!npub) return;

        try {
          const pubkeyHex = await npubToHex(npub);
          await callWorker(push.listenerServerUrl, "/ack", push.listenerServerAuthToken, { pubkeyHex, at });
        } catch (e) {
          console.error("Ack failed", e);
        }
      },
    }),
    {
      name: "ostia-notification",
      version: 3,
      migrate: (persistedState: any) => {
        const state = persistedState as Partial<NotificationState> | null;
        const legacyBark = (state as any)?.bark as any;
        const legacyPush = (state as any)?.push as any;

        if (legacyPush && typeof legacyPush === "object") {
          const legacyPushType = (legacyPush as any).pushType;
          const nextPush = {
            enabled: Boolean(legacyPush.enabled),
            listenerServerUrl: String(legacyPush.listenerServerUrl || ""),
            listenerServerAuthToken: String(legacyPush.listenerServerAuthToken || ""),
            pushType: (isPushType(legacyPushType) ? legacyPushType : legacyPushType === "bark" ? "bark" : "webhook") as PushType,
            pushEndpointUrl: String(legacyPush.pushEndpointUrl || ""),
            pushEndpointAuthToken: String(legacyPush.pushEndpointAuthToken || ""),
            deviceKey: String(legacyPush.deviceKey || ""),
            pushTitle: String(legacyPush.pushTitle || "Ostia 新消息"),
          };
          return { ...(state as any), push: nextPush } as any;
        }

        if (legacyBark && typeof legacyBark === "object") {
          return {
            ...state,
            push: {
              enabled: Boolean(legacyBark.enabled),
              listenerServerUrl: String(legacyBark.workerUrl || ""),
              listenerServerAuthToken: String(legacyBark.workerAuthToken || ""),
              pushType: "bark",
              pushEndpointUrl: String(legacyBark.pushEndpointUrl || ""),
              pushEndpointAuthToken: String(legacyBark.pushEndpointAuthToken || ""),
              deviceKey: String(legacyBark.deviceKey || ""),
              pushTitle: String(legacyBark.pushTitle || "Ostia 新消息"),
            },
          } as any;
        }

        return {
          ...(state as any),
          push: {
            enabled: false,
            listenerServerUrl: "",
            listenerServerAuthToken: "",
            pushType: "webhook",
            pushEndpointUrl: "",
            pushEndpointAuthToken: "",
            deviceKey: "",
            pushTitle: "Ostia",
          },
        } as any;
      },
    }
  )
);
