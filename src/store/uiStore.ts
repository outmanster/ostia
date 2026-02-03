import { create } from "zustand";
import { persist } from "zustand/middleware";

export type AccentColor = "orange" | "blue" | "green" | "violet" | "crimson";

interface UIState {
  // Mobile sidebar state
  isSidebarOpen: boolean;
  isMobile: boolean;

  // Theme settings
  accentColor: AccentColor;
  fontSize: number;

  // Dialog states
  showAddContactDialog: boolean;
  showSettingsDialog: boolean;

  // Mobile Navigation
  activeTab: "chats" | "contacts" | "settings";
  lastListTab: "chats" | "contacts";
  settingsTab: "profile" | "account" | "relays" | "appearance" | "privacy" | "storage" | "notifications" | "bookmarks";

  // Actions
  openSidebar: () => void;
  closeSidebar: () => void;
  toggleSidebar: () => void;
  setIsMobile: (isMobile: boolean) => void;
  setAccentColor: (color: AccentColor) => void;
  setFontSize: (size: number) => void;
  setShowAddContactDialog: (show: boolean) => void;
  setShowSettingsDialog: (show: boolean, tab?: "profile" | "account" | "relays" | "appearance" | "privacy" | "storage" | "notifications" | "bookmarks") => void;
  setActiveTab: (tab: "chats" | "contacts" | "settings") => void;
  setLastListTab: (tab: "chats" | "contacts") => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set, get) => ({
      isSidebarOpen: true,
      isMobile: false,
      accentColor: "blue",
      fontSize: 16,
      showAddContactDialog: false,
      showSettingsDialog: false,
      activeTab: "chats",
      lastListTab: "chats",
      settingsTab: "relays",

      openSidebar: () => set({ isSidebarOpen: true }),
      closeSidebar: () => set({ isSidebarOpen: false }),
      toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
      setIsMobile: (newIsMobile) => {
        const { isMobile: currentIsMobile } = get();
        if (newIsMobile !== currentIsMobile) {
          set({
            isMobile: newIsMobile,
            isSidebarOpen: !newIsMobile
          });
        }
      },
      setAccentColor: (accentColor) => set({ accentColor }),
      setFontSize: (fontSize) => set({ fontSize }),
      setShowAddContactDialog: (show) => set({ showAddContactDialog: show }),
      setShowSettingsDialog: (show, tab) => set({
        showSettingsDialog: show,
        settingsTab: tab || "relays"
      }),
      setActiveTab: (tab) => set({ activeTab: tab }),
      setLastListTab: (tab) => set({ lastListTab: tab }),
    }),
    {
      name: "ostia-ui-storage",
    }
  )
);
