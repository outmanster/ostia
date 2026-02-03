import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";

export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

interface RelayStatus {
  url: string;
  status: ConnectionStatus;
}

interface ConnectionState {
  status: ConnectionStatus;
  relays: RelayStatus[];
  lastSync: number | null;
  isSyncing: boolean;
  error: string | null;

  setStatus: (status: ConnectionStatus) => void;
  setRelays: (relays: RelayStatus[]) => void;
  syncMessages: () => Promise<void>;
  checkConnection: () => Promise<void>;
}

export const useConnectionStore = create<ConnectionState>()((set, get) => ({
  status: "disconnected",
  relays: [],
  lastSync: null,
  isSyncing: false,
  error: null,

  setStatus: (status: ConnectionStatus) => {
    const prevStatus = get().status;
    set({ status });

    // Show toast notifications for status changes
    if (prevStatus !== status) {
      if (status === "error") {
        // Removed specific error message as per instruction, keeping general error toast
        toast.error("连接中继器失败");
      }
    }
  },

  setRelays: (relays: RelayStatus[]) => {
    set({ relays });

    // Update overall status based on relay statuses
    const connectedCount = relays.filter(r => r.status === "connected").length;
    if (connectedCount > 0) {
      set({ status: "connected" });
    } else if (relays.some(r => r.status === "connecting")) {
      set({ status: "connecting" });
    } else {
      set({ status: "disconnected" });
    }
  },

  syncMessages: async () => {
    if (get().isSyncing) return;

    set({ isSyncing: true, error: null });
    try {
      await invoke<number>("sync_messages");
      set({
        lastSync: Date.now(),
        isSyncing: false
      });
      // Removed success notification as per instruction
    } catch (error) {
      set({
        isSyncing: false,
        error: String(error)
      });
      toast.error("同步消息失败");
    }
  },

  checkConnection: async () => {
    set({ status: "connecting" });
    try {
      // For now, we'll just set it as connected after initialization
      // In the future, this should check actual relay connections
      set({ status: "connected" });
      // Removed success notification as per instruction
    } catch {
      set({ status: "error" });
    }
  },
}));
