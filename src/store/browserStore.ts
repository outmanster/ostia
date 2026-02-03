import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface Bookmark {
  id: string;
  url: string;
  title: string;
  icon?: string;
  color: string;
}

interface BrowserState {
  bookmarks: Bookmark[];
  isLoading: boolean;
  activeBrowserUrl: string | null;

  // Actions
  addBookmark: (url: string) => Promise<void>;
  removeBookmark: (id: string) => void;
  updateBookmark: (id: string, data: Partial<Bookmark>) => void;
  clearAll: () => void;
  setActiveBrowserUrl: (url: string | null) => void;
}

// 从 URL 域名生成稳定的颜色
function generateColorFromUrl(url: string): string {
  const colors = [
    "#ef4444", // red
    "#f97316", // orange
    "#eab308", // yellow
    "#22c55e", // green
    "#14b8a6", // teal
    "#3b82f6", // blue
    "#8b5cf6", // violet
    "#ec4899", // pink
    "#6366f1", // indigo
    "#06b6d4", // cyan
  ];

  try {
    const hostname = new URL(url).hostname;
    let hash = 0;
    for (let i = 0; i < hostname.length; i++) {
      hash = hostname.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  } catch {
    return colors[0];
  }
}

// 从 URL 获取元数据（标题、图标）
async function fetchUrlMetadata(url: string): Promise<{ title: string; icon?: string }> {
  try {
    const hostname = new URL(url).hostname;
    // 尝试获取 favicon
    const iconUrl = `https://www.google.com/s2/favicons?domain=${hostname}&sz=128`;

    // 生成标题：使用域名的主要部分
    const parts = hostname.replace(/^www\./, "").split(".");
    const title = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);

    return { title, icon: iconUrl };
  } catch {
    return { title: "未知网站" };
  }
}

export const useBrowserStore = create<BrowserState>()(
  persist(
    (set, get) => ({
      bookmarks: [],
      isLoading: false,
      activeBrowserUrl: null,

      addBookmark: async (url: string) => {
        set({ isLoading: true });

        // 确保 URL 有协议
        let normalizedUrl = url.trim();
        if (!normalizedUrl.startsWith("http://") && !normalizedUrl.startsWith("https://")) {
          normalizedUrl = "https://" + normalizedUrl;
        }

        // 检查是否已存在
        const existing = get().bookmarks.find(b => b.url === normalizedUrl);
        if (existing) {
          set({ isLoading: false });
          return;
        }

        const metadata = await fetchUrlMetadata(normalizedUrl);
        const color = generateColorFromUrl(normalizedUrl);

        const newBookmark: Bookmark = {
          id: crypto.randomUUID(),
          url: normalizedUrl,
          title: metadata.title,
          icon: metadata.icon,
          color,
        };

        set(state => ({
          bookmarks: [...state.bookmarks, newBookmark],
          isLoading: false,
        }));
      },

      removeBookmark: (id: string) => {
        set(state => ({
          bookmarks: state.bookmarks.filter(b => b.id !== id),
        }));
      },

      updateBookmark: (id: string, data: Partial<Bookmark>) => {
        set(state => ({
          bookmarks: state.bookmarks.map(b =>
            b.id === id ? { ...b, ...data } : b
          ),
        }));
      },

      clearAll: () => {
        set({ bookmarks: [] });
      },

      setActiveBrowserUrl: (url: string | null) => {
        set({ activeBrowserUrl: url });
      },
    }),
    {
      name: "ostia-browser-storage",
      // 不持久化 activeBrowserUrl
      partialize: (state) => ({ bookmarks: state.bookmarks }),
    }
  )
);
