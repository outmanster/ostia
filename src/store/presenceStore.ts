import { create } from "zustand";

interface PresenceInfo {
  online: boolean;
  lastSeen: number | null;
}

interface PresenceState {
  map: Map<string, PresenceInfo>;
  setPresence: (npub: string, info: PresenceInfo) => void;
  getPresence: (npub: string) => PresenceInfo | undefined;
  clear: () => void;
}

const STALE_PRESENCE_MS = 120000;

const normalizeLastSeen = (lastSeen: number | null) => {
  if (lastSeen === null) return null;
  if (Number.isNaN(lastSeen)) return null;
  return lastSeen > 1e12 ? lastSeen : lastSeen * 1000;
};

export const usePresenceStore = create<PresenceState>()((set, get) => ({
  map: new Map(),
  setPresence: (npub, info) => {
    set((state) => {
      const map = new Map(state.map);
      const normalizedLastSeen = normalizeLastSeen(info.lastSeen);

      // Check if the presence is stale immediately upon receipt
      // This prevents "flickering" where we show online then immediately switch to offline
      let isOnline = info.online;
      if (normalizedLastSeen && Date.now() - normalizedLastSeen > STALE_PRESENCE_MS) {
        isOnline = false;
      }

      map.set(npub, {
        online: isOnline,
        lastSeen: normalizedLastSeen,
      });
      return { map };
    });
  },
  getPresence: (npub) => {
    const info = get().map.get(npub);
    if (!info) return undefined;
    if (!info.online) return info;
    if (!info.lastSeen) return { ...info, online: false };
    const isStale = Date.now() - info.lastSeen > STALE_PRESENCE_MS;
    return isStale ? { ...info, online: false } : info;
  },
  clear: () => set({ map: new Map() }),
}));

if (typeof window !== "undefined") {
  window.setInterval(() => {
    const state = usePresenceStore.getState();
    const map = new Map(state.map);
    let changed = false;
    const now = Date.now();
    map.forEach((info, npub) => {
      if (!info.online) return;
      if (!info.lastSeen || now - info.lastSeen > STALE_PRESENCE_MS) {
        map.set(npub, { ...info, online: false });
        changed = true;
      }
    });
    if (changed) {
      usePresenceStore.setState({ map });
    }
  }, 30000);
}
