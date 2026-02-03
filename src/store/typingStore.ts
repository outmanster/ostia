import { create } from "zustand";

interface TypingState {
  typingMap: Map<string, boolean>;
  setTyping: (npub: string, typing: boolean) => void;
  isTyping: (npub: string) => boolean;
  clear: () => void;
}

export const useTypingStore = create<TypingState>()((set, get) => ({
  typingMap: new Map(),
  setTyping: (npub, typing) => {
    set((state) => {
      const map = new Map(state.typingMap);
      map.set(npub, typing);
      return { typingMap: map };
    });
  },
  isTyping: (npub) => {
    return get().typingMap.get(npub) || false;
  },
  clear: () => set({ typingMap: new Map() }),
}));
