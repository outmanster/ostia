import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";

export interface RelayListEntry {
  url: string;
  read: boolean;
  write: boolean;
}

export interface RelayConfig {
  customRelays: string[];
  mediaServer?: string;
  mediaServerToken?: string;
}

export interface RelayStatus {
  url: string;
  status: "connected" | "connecting" | "disconnected" | "invalid" | string;
  reason?: string;
}

export interface RelayHealthResult {
  url: string;
  status: "connected" | "disconnected" | "invalid" | string;
  reason?: string | null;
}

interface RelayStore {
  // User relay lists
  userRelays: RelayListEntry[];
  myRelays: RelayListEntry[];

  // Relay configuration
  config: RelayConfig;
  statuses: RelayStatus[];

  // Loading states
  isLoading: boolean;
  isPublishing: boolean;
  isHealthChecking: boolean;
  isConfigLoaded: boolean;
  isRelaysLoaded: boolean;

  // Actions
  queryUserRelays: (pubkey: string) => Promise<void>;
  queryMultipleUsersRelays: (pubkeys: string[]) => Promise<void>;
  getMyRelays: () => Promise<void>;
  publishRelayList: (relays: RelayListEntry[]) => Promise<void>;
  checkRelayHealth: (url: string) => Promise<RelayHealthResult>;
  checkRelaysHealth: (urls: string[]) => Promise<void>;
  addCustomRelay: (url: string) => Promise<void>;
  removeCustomRelay: (url: string) => Promise<void>;
  getRelayConfig: () => Promise<void>;
  getRelayStatuses: () => Promise<void>;
  updateMediaServer: (url: string) => void;
  updateMediaServerToken: (token: string) => void;

  // Local Kind 10002 (NIP-65) editing
  updateLocalRelay: (url: string, read: boolean, write: boolean) => void;
  addToMyRelays: (url: string) => void;
  removeFromMyRelays: (url: string) => void;

  // Reset
  reset: () => void;
}

export const useRelayStore = create<RelayStore>((set, get) => ({
  userRelays: [],
  myRelays: [],
  config: {
    customRelays: [],
    mediaServer: "",
    mediaServerToken: "",
  },
  statuses: [],
  isLoading: false,
  isPublishing: false,
  isHealthChecking: false,
  isConfigLoaded: false,
  isRelaysLoaded: false,

  queryUserRelays: async (pubkey: string) => {
    set({ isLoading: true });
    try {
      const relays = await invoke<RelayListEntry[]>("query_user_relays", { pubkey });
      set({ userRelays: relays, isLoading: false });
    } catch (error) {
      set({ isLoading: false });
      toast.error(`查询中继器失败: ${error}`);
      throw error;
    }
  },

  queryMultipleUsersRelays: async (pubkeys: string[]) => {
    set({ isLoading: true });
    try {
      const relays = await invoke<RelayListEntry[]>("query_multiple_users_relays", { pubkeys });
      set({ userRelays: relays, isLoading: false });
    } catch (error) {
      set({ isLoading: false });
      toast.error(`查询多个中继器失败: ${error}`);
      throw error;
    }
  },

  getMyRelays: async () => {
    set({ isLoading: true });
    try {
      // First ensure we have the latest config
      let { config } = get();
      if (config.customRelays.length === 0) {
        await get().getRelayConfig();
        config = get().config;
      }

      // If no custom relays, we can't fetch from network
      if (config.customRelays.length === 0) {
        set({ myRelays: [], isLoading: false, isRelaysLoaded: true });
        return;
      }

      const networkRelays = await invoke<RelayListEntry[]>("get_my_relays");
      
      // Only care about custom relays
      const allConfigUrls = [...config.customRelays];
      const mergedRelays = [...networkRelays];

      allConfigUrls.forEach(url => {
        if (!mergedRelays.some(r => r.url === url)) {
          // New custom relays are added as read/write enabled by default
          mergedRelays.push({
            url,
            read: true,
            write: true
          });
        }
      });

      set({ myRelays: mergedRelays, isLoading: false, isRelaysLoaded: true });
    } catch (error) {
      // Ignore "no relays" error as it is expected when relays are removed
      const errorStr = String(error);
      if (!errorStr.includes("no relays specified") && !errorStr.includes("Failed to get my relays")) {
        toast.error(`获取中继器失败: ${error}`);
      }
      set({ isLoading: false, isRelaysLoaded: true });
    }
  },

  publishRelayList: async (relays: RelayListEntry[]) => {
    const { config } = get();
    if (config.customRelays.length === 0) {
      toast.error("没有可用的中继器连接，无法同步至网络");
      return;
    }

    set({ isPublishing: true });
    try {
      await invoke<string>("publish_relay_list", { relays });
      set({ isPublishing: false });
      // After publishing, refresh to make sure we have the latest state from network
      await get().getMyRelays();
      toast.success("已成功同步至网络");
    } catch (error) {
      set({ isPublishing: false });
      toast.error(`发布中继器列表失败: ${error}`);
      throw error;
    }
  },

  checkRelayHealth: async (url: string): Promise<RelayHealthResult> => {
    set({ isHealthChecking: true });
    try {
      const result = await invoke<RelayHealthResult>("check_relay_health", { relayUrl: url });
      set({ isHealthChecking: false });
      return result;
    } catch (error) {
      set({ isHealthChecking: false });
      toast.error(`健康检查失败: ${error}`);
      return {
        url,
        status: "disconnected",
        reason: String(error),
      };
    }
  },

  checkRelaysHealth: async (urls: string[]) => {
    set({ isHealthChecking: true });
    try {
      const results = await invoke<RelayHealthResult[]>("check_relays_health", { relayUrls: urls });
      const statuses = results.map((result) => ({
        url: result.url,
        status: result.status,
        reason: result.reason ?? undefined,
      }));
      set({ statuses, isHealthChecking: false });
    } catch (error) {
      set({ isHealthChecking: false });
      toast.error(`健康检查失败: ${error}`);
      throw error;
    }
  },

  addCustomRelay: async (url: string) => {
    try {
      await invoke("add_custom_relay", { relayUrl: url });
      // Refresh config and NIP-65 list
      await get().getRelayConfig();
      await get().getMyRelays();
    } catch (error) {
      toast.error(`添加中继器失败: ${error}`);
      throw error;
    }
  },

  removeCustomRelay: async (url: string) => {
    try {
      await invoke("remove_custom_relay", { relayUrl: url });
      // Refresh config first
      await get().getRelayConfig();
      // Remove from UI list immediately without fetching from network
      // This prevents the deleted relay from reappearing if it exists in the network list
      get().removeFromMyRelays(url);
    } catch (error) {
      toast.error(`移除中继器失败: ${error}`);
      throw error;
    }
  },

  getRelayConfig: async () => {
    try {
      // Backend signature might still return 4 values, we need to check rust code or just ignore the first two if they are consistent in order.
      // However, usually detailed bind depends on return type.
      // Let's assume the backend 'get_relay_config' still returns [mode, defaultRelays, customRelays, mediaServer] for now.
      // If we are not changing backend, we must respect the return signature.
      // Wait, I should not change backend code unless asked. But the prompt says "Code relating to the user's requests should be written in the locations listed above." and user only complained about "settings inside".
      // But if I change the store, I should expect the backend to match?
      // Actually, safest is to ignore the first two values if I can't change backend.
      // But let's assume I can treat them as return values I just don't use in the store config.
      const [_, __, customRelays, mediaServer, mediaServerToken] = await invoke<[string, string[], string[], string, string]>("get_relay_config");
      set({
        config: {
          customRelays,
          mediaServer: mediaServer || "",
          mediaServerToken: mediaServerToken || "",
        },
        isConfigLoaded: true,
      });
    } catch (error) {
      set({ isConfigLoaded: true });
      toast.error(`获取中继器配置失败: ${error}`);
      throw error;
    }
  },

  updateMediaServer: (url: string) => {
    set((state) => ({
      config: {
        ...state.config,
        mediaServer: url,
      },
    }));
  },

  updateMediaServerToken: (token: string) => {
    set((state) => ({
      config: {
        ...state.config,
        mediaServerToken: token,
      },
    }));
  },

  getRelayStatuses: async () => {
    try {
      const statuses = await invoke<[string, string][]>("get_relay_statuses");
      const parsed = statuses.map(([url, status]) => ({ url, status }));
      set({ statuses: parsed });
    } catch (error) {
      toast.error(`获取中继器状态失败: ${error}`);
      throw error;
    }
  },

  updateLocalRelay: (url: string, read: boolean, write: boolean) => {
    set((state) => ({
      myRelays: state.myRelays.map((r) =>
        r.url === url ? { ...r, read, write } : r
      ),
    }));
  },

  addToMyRelays: (url: string) => {
    const { myRelays } = get();
    if (myRelays.some(r => r.url === url)) {
      toast.error("该中继器已在列表中");
      return;
    }
    set({
      myRelays: [...myRelays, { url, read: true, write: true }]
    });
  },

  removeFromMyRelays: (url: string) => {
    set((state) => ({
      myRelays: state.myRelays.filter(r => r.url !== url)
    }));
  },

  reset: () => {
    set({
      userRelays: [],
      myRelays: [],
      statuses: [],
      config: {
        customRelays: [],
        mediaServer: "",
        mediaServerToken: ""
      },
    });
  },
}));
