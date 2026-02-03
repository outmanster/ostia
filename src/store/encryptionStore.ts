import { create } from "zustand";
import { toast } from "sonner";
import { invoke } from "@tauri-apps/api/core";

interface EncryptedMessage {
  ciphertext: string;
  nonce: string;
  pubkey: string;
  timestamp: number;
}

interface EncryptionState {
  sessions: string[];
  isLoading: boolean;
  error: string | null;
  encryptionHistory: Map<string, { plaintext: string; encrypted: EncryptedMessage }[]>;

  encryptMessage: (plaintext: string, theirPubkey: string) => Promise<EncryptedMessage>;
  decryptMessage: (ciphertext: string, nonce: string, pubkey: string, timestamp: number) => Promise<string>;
  deleteSession: (theirPubkey: string) => Promise<void>;
  getSessions: () => Promise<void>;
  exportSessionKey: (theirPubkey: string) => Promise<string>;
  importSessionKey: (theirPubkey: string, keyHex: string) => Promise<void>;
  clearError: () => void;
}

export const useEncryptionStore = create<EncryptionState>()((set, _get) => ({
  sessions: [],
  isLoading: false,
  error: null,
  encryptionHistory: new Map(),

  encryptMessage: async (plaintext: string, theirPubkey: string) => {
    set({ isLoading: true, error: null });
    try {
      const [ciphertext, nonce, pubkey] = await invoke<[string, string, string]>("encrypt_message", {
        plaintext,
        theirPubkey,
      });

      const encrypted: EncryptedMessage = { ciphertext, nonce, pubkey, timestamp: Date.now() };

      // Store in history
      set((state) => {
        const newHistory = new Map(state.encryptionHistory);
        const history = newHistory.get(theirPubkey) || [];
        history.push({ plaintext, encrypted });
        newHistory.set(theirPubkey, history);
        return { encryptionHistory: newHistory };
      });

      return encrypted;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({ error: message });
      toast.error(`加密失败: ${message}`);
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  decryptMessage: async (ciphertext: string, nonce: string, pubkey: string, timestamp: number) => {
    set({ isLoading: true, error: null });
    try {
      const plaintext = await invoke<string>("decrypt_message", {
        ciphertext,
        nonce,
        pubkey,
        timestamp,
      });

      return plaintext;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({ error: message });
      toast.error(`解密失败: ${message}`);
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  deleteSession: async (theirPubkey: string) => {
    set({ isLoading: true, error: null });
    try {
      await invoke("delete_encryption_session", { theirPubkey });

      set((state) => {
        const newSessions = state.sessions.filter((s) => s !== theirPubkey);
        const newHistory = new Map(state.encryptionHistory);
        newHistory.delete(theirPubkey);
        return { sessions: newSessions, encryptionHistory: newHistory };
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({ error: message });
      toast.error(`删除会话失败: ${message}`);
    } finally {
      set({ isLoading: false });
    }
  },

  getSessions: async () => {
    set({ isLoading: true, error: null });
    try {
      const sessions = await invoke<string[]>("get_encryption_sessions");
      set({ sessions });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({ error: message });
      toast.error(`获取会话失败: ${message}`);
    } finally {
      set({ isLoading: false });
    }
  },

  exportSessionKey: async (theirPubkey: string) => {
    set({ isLoading: true, error: null });
    try {
      const keyHex = await invoke<string>("export_session_key", { theirPubkey });
      return keyHex;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({ error: message });
      toast.error(`导出密钥失败: ${message}`);
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  importSessionKey: async (theirPubkey: string, keyHex: string) => {
    set({ isLoading: true, error: null });
    try {
      await invoke("import_session_key", { theirPubkey, keyHex });

      set((state) => {
        if (!state.sessions.includes(theirPubkey)) {
          return { sessions: [...state.sessions, theirPubkey] };
        }
        return {};
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({ error: message });
      toast.error(`导入密钥失败: ${message}`);
    } finally {
      set({ isLoading: false });
    }
  },

  clearError: () => set({ error: null }),
}));
