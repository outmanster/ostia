export interface Account {
  npub: string;
  nsec: string;
}

export interface Profile {
  npub: string;
  name?: string;
  displayName?: string;
  about?: string;
  picture?: string;
  nip05?: string;
}

export interface Contact {
  npub: string;
  name?: string;
  displayName?: string;
  picture?: string;
  blocked: boolean;
  remark?: string;
}

export interface Message {
  id: string;
  sender: string;
  receiver: string;
  content: string;
  timestamp: number;
  status: MessageStatus;
  messageType?: "text" | "image";
  mediaUrl?: string | null;
}

export type MessageStatus = "pending" | "sent" | "delivered" | "read" | "failed";

export interface Conversation {
  contact: Contact;
  lastMessage?: Message;
  unreadCount: number;
}

export interface ChatSession {
  contact: Contact;
  last_message: string;
  last_timestamp: number;
  unread_count: number;
  lastMessageType?: string;
}

export interface RelayInfo {
  url: string;
  status: "connected" | "connecting" | "disconnected" | "failed";
}

export interface RelayListEntry {
  url: string;
  read: boolean;
  write: boolean;
}

// Extend Window interface for image caching
declare global {
  interface Window {
    imageCache?: Record<string, string>;
  }
}
