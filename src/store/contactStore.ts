import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type { Contact, ChatSession } from "@/types";

interface ContactState {
  contacts: Contact[];
  chatSessions: ChatSession[];
  selectedContact: Contact | null;
  isLoading: boolean;
  error: string | null;

  loadContacts: () => Promise<void>;
  loadChatSessions: () => Promise<void>;
  addContact: (npub: string, remark?: string) => Promise<void>;
  removeContact: (npub: string) => Promise<void>;
  selectContact: (contact: Contact | null) => void;
  blockContact: (npub: string, blocked: boolean) => Promise<void>;
  updateRemark: (npub: string, remark: string | null) => Promise<void>;
  resolveNickname: (npub: string) => Promise<string | null>;
  clearError: () => void;
}

export const useContactStore = create<ContactState>()((set, get) => ({
  contacts: [],
  chatSessions: [],
  selectedContact: null,
  isLoading: false,
  error: null,

  loadContacts: async () => {
    set({ isLoading: true, error: null });
    try {
      const contacts = await invoke<Contact[]>("get_contacts");
      const currentSelected = get().selectedContact;
      const updatedSelected = currentSelected
        ? contacts.find((c) => c.npub === currentSelected.npub) || null
        : null;
      set({ contacts, selectedContact: updatedSelected, isLoading: false });
    } catch (error) {
      set({ isLoading: false, error: String(error) });
    }
  },

  loadChatSessions: async () => {
    // We don't necessarily want to show global loading for background sessions update
    try {
      const sessions = await invoke<ChatSession[]>("get_chat_sessions");
      set({ chatSessions: sessions });
    } catch (error) {
      console.error("Failed to load chat sessions:", error);
    }
  },

  addContact: async (npub: string, remark?: string) => {
    set({ isLoading: true, error: null });
    try {
      const contact = await invoke<Contact>("add_contact", { npub, remark });
      set((state) => ({
        contacts: state.contacts.some((c) => c.npub === contact.npub)
          ? state.contacts.map((c) => (c.npub === contact.npub ? { ...c, ...contact } : c))
          : [...state.contacts, contact],
        selectedContact:
          state.selectedContact?.npub === contact.npub
            ? { ...state.selectedContact, ...contact }
            : state.selectedContact,
        isLoading: false,
      }));
    } catch (error) {
      set({ isLoading: false, error: String(error) });
      throw error;
    }
  },

  removeContact: async (npub: string) => {
    set({ isLoading: true, error: null });
    try {
      await invoke("remove_contact", { npub });
      const { selectedContact } = get();
      set((state) => ({
        contacts: state.contacts.filter((c) => c.npub !== npub),
        selectedContact:
          selectedContact?.npub === npub ? null : selectedContact,
        isLoading: false,
      }));
    } catch (error) {
      set({ isLoading: false, error: String(error) });
      throw error;
    }
  },

  selectContact: (contact: Contact | null) => {
    set({ selectedContact: contact });
  },

  blockContact: async (npub: string, blocked: boolean) => {
    set({ isLoading: true, error: null });
    try {
      await invoke("block_contact", { npub, blocked });
      set((state) => ({
        contacts: state.contacts.map((c) =>
          c.npub === npub ? { ...c, blocked } : c
        ),
        selectedContact:
          state.selectedContact?.npub === npub
            ? { ...state.selectedContact, blocked }
            : state.selectedContact,
        isLoading: false,
      }));
    } catch (error) {
      set({ isLoading: false, error: String(error) });
      throw error;
    }
  },

  updateRemark: async (npub: string, remark: string | null) => {
    set({ isLoading: true, error: null });
    try {
      await invoke("update_contact_remark", { npub, remark });
      set((state) => ({
        contacts: state.contacts.map((c) =>
          c.npub === npub ? { ...c, remark: remark || undefined } : c
        ),
        selectedContact:
          state.selectedContact?.npub === npub
            ? { ...state.selectedContact, remark: remark || undefined }
            : state.selectedContact,
        isLoading: false,
      }));
    } catch (error) {
      set({ isLoading: false, error: String(error) });
      throw error;
    }
  },

  resolveNickname: async (npub: string) => {
    try {
      const nickname = await invoke<string | null>("resolve_nickname", {
        npub,
      });
      await get().loadContacts();
      return nickname;
    } catch {
      return null;
    }
  },

  clearError: () => {
    set({ error: null });
  },
}));
