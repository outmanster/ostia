import { create } from "zustand";
import { persist } from "zustand/middleware";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import type { Profile, Account } from "@/types";
import {
  generateAccount,
  importPrivateKey,
  savePrivateKey,
  deleteStoredKey,
  publishRelayList,
  getMyRelays,
  publishPresence,
  resetUnlockLockout,
} from "@/utils/nostr";

interface AuthState {
  isAuthenticated: boolean;
  npub: string | null;
  nsec: string | null; // 私钥只在内存中保存
  profile: Profile | null;
  isLoading: boolean;
  error: string | null;
  pendingAccount: Account | null;

  login: (nsec: string) => Promise<void>;
  register: () => Promise<Account>;
  confirmRegistration: (account: Account) => Promise<void>;
  cancelRegistration: () => void;
  logout: () => Promise<void>;
  checkStoredKey: () => Promise<void>;
  setProfile: (profile: Profile) => void;
  fetchMyProfile: () => Promise<void>;
  updateProfile: (profile: Partial<Profile>) => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      isAuthenticated: false,
      npub: null,
      nsec: null,
      profile: null,
      isLoading: false,
      error: null,
      pendingAccount: null,

      login: async (nsec: string) => {
        set({ isLoading: true, error: null });
        try {
          const npub = await importPrivateKey(nsec);
          // 设置后端的内存私钥
          await savePrivateKey(nsec);
          try {
            await resetUnlockLockout();
          } catch (error) {
            console.warn("Failed to reset unlock lockout:", error);
          }
          set({ isAuthenticated: true, npub, nsec, isLoading: false });

          // Check NIP-65 relays and publish defaults if missing
          try {
            const relays = await getMyRelays();
            if (relays.length === 0) {
              const defaultRelays: any[] = [];
              await publishRelayList(defaultRelays);
              console.log("Published default relay list (NIP-65)");
            }
          } catch (e) {
            console.warn("Failed to check/publish relays on login:", e);
          }

          // Fetch profile after login
          await get().fetchMyProfile();
        } catch (error) {
          set({ isLoading: false, error: String(error) });
          throw error;
        }
      },

      register: async () => {
        console.log("JS: [authStore] register called");
        set({ isLoading: true, error: null, pendingAccount: null });
        try {
          console.log("JS: [authStore] calling utils/nostr.ts generateAccount()");
          const account = await generateAccount();
          console.log("JS: [authStore] generateAccount() returned successfully:", account.npub);

          console.log("JS: [authStore] updating state with pendingAccount");
          set({ pendingAccount: account, isLoading: false });
          console.log("JS: [authStore] state updated successfully");
          return account;
        } catch (error) {
          console.error("JS: [authStore] register failed:", error);
          const errorMessage = String(error) || "生成账户失败";
          set({ isLoading: false, error: errorMessage });
          throw new Error(errorMessage);
        }
      },

      confirmRegistration: async (account: Account) => {
        set({ isLoading: true, error: null });
        try {
          // 设置后端的内存私钥
          await savePrivateKey(account.nsec);

          // Publish default relays (NIP-65) for new account
          try {
            const defaultRelays: any[] = [];
            await publishRelayList(defaultRelays);
            console.log("Published default relay list for new account");
          } catch (e) {
            console.error("Failed to publish relays on registration:", e);
          }

          set({
            isAuthenticated: true,
            npub: account.npub,
            nsec: account.nsec,
            pendingAccount: null,
            isLoading: false,
          });
        } catch (error) {
          set({ isLoading: false, error: String(error) });
          throw error;
        }
      },

      cancelRegistration: () => {
        set({ pendingAccount: null, error: null });
      },

      logout: async () => {
        try {
          try {
            await publishPresence(false);
          } catch (error) {
            console.error("Failed to publish presence on logout:", error);
          }
          await deleteStoredKey();
        } catch {
          // Ignore errors when clearing key
        }

        // 清除所有状态，包括持久化存储
        set({
          isAuthenticated: false,
          npub: null,
          nsec: null,
          profile: null,
          pendingAccount: null,
          error: null,
        });

        // 清除 localStorage 中的持久化状态
        if (typeof window !== 'undefined') {
          localStorage.removeItem('ostia-auth');
        }
      },

      checkStoredKey: async () => {
        // 检查是否有加密的私钥文件，但不自动登录
        // 让UI层决定是否显示解锁界面
        set({ isLoading: false });
      },

      setProfile: (profile: Profile) => {
        set({ profile });
      },

      fetchMyProfile: async () => {
        const { npub } = get();
        if (!npub) return;
        try {
          const profile = await invoke<Profile>("fetch_profile", { npub });
          set({ profile });
        } catch (error) {
          console.error("Failed to fetch profile:", error);
        }
      },

      updateProfile: async (updates: Partial<Profile>) => {
        const { profile, npub } = get();
        if (!npub) throw new Error("未登录");

        set({ isLoading: true, error: null });
        try {
          const name = updates.name || profile?.name || "";
          await invoke("publish_identity", {
            name,
            displayName: updates.displayName || profile?.displayName || null,
            about: updates.about || profile?.about || null,
            picture: updates.picture || profile?.picture || null,
            nip05: updates.nip05 || profile?.nip05 || null,
          });

          const newProfile = { ...profile, ...updates, npub } as Profile;
          set({ profile: newProfile, isLoading: false });
        } catch (error) {
          set({ isLoading: false, error: String(error) });
          toast.error(`更新资料失败: ${error}`);
          throw error;
        }
      },

      clearError: () => {
        set({ error: null });
      },
    }),
    {
      name: "ostia-auth",
      partialize: (state) => ({
        // 不持久化 isAuthenticated，确保每次启动都需要重新验证
        npub: state.npub,
        profile: state.profile,
        // 注意：nsec 字段不会被持久化，只在内存中保存
      }),
    }
  )
);
