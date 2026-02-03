import { create } from "zustand";
import { toast } from "sonner";
import type { Message } from "@/types";
import { getMessages, sendMessage, sendImage, deleteLocalMessage, clearConversation as clearConversationBackend } from "@/utils/nostr";
import { useAuthStore } from "./authStore";

interface MessageState {
  messages: Map<string, Message[]>;
  isLoading: boolean;
  error: string | null;
  // Pagination and caching
  messageCache: Map<string, { messages: Message[]; timestamp: number }>;
  contactOffsets: Map<string, number>; // Track how many messages loaded per contact
  hasMore: Map<string, boolean>; // Track if more messages available

  loadMessages: (contactNpub: string) => Promise<void>;
  loadMoreMessages: (contactNpub: string) => Promise<void>;
  hasMoreMessages: (contactNpub: string) => boolean;
  sendMessage: (receiverNpub: string, content: string) => Promise<void>;
  retrySendMessage: (tempId: string, receiverNpub: string, content: string) => Promise<void>;
  sendImage: (receiverNpub: string, imageData: Uint8Array, filename: string) => Promise<void>;
  addMessage: (message: Message) => boolean;
  deleteMessage: (contactNpub: string, messageId: string) => Promise<void>;
  clearConversation: (contactNpub: string) => Promise<void>;
  updateMessageStatus: (messageId: string, status: Message["status"], contactNpub?: string) => void;
  getConversation: (contactNpub: string) => Message[];
  clearError: () => void;
  clearCache: () => void;
}

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const PAGE_SIZE = 30; // Messages per page

// Helper function to normalize message content for image messages
function normalizeMessage(message: Message): Message {
  // Ensure messageType exists and is valid
  const messageType = message.messageType || "text";

  // For image messages, always clear content regardless of format
  if (messageType === "image") {
    return { ...message, messageType: "image", content: "" };
  }
  // For text messages, ensure messageType is set
  return { ...message, messageType: "text" };
}

export const useMessageStore = create<MessageState>()((set, get) => ({
  messages: new Map(),
  isLoading: false,
  error: null,
  messageCache: new Map(),
  contactOffsets: new Map(),
  hasMore: new Map(),

  loadMessages: async (contactNpub: string) => {
    // Check cache first
    const cached = get().messageCache.get(contactNpub);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      set((state) => {
        const newMessages = new Map(state.messages);
        newMessages.set(contactNpub, cached.messages);
        return { messages: newMessages, isLoading: false };
      });
      return;
    }

    set({ isLoading: true, error: null });
    try {
      const messages = await getMessages(contactNpub, PAGE_SIZE, 0);
      // Normalize image messages
      const normalizedMessages = messages.map(normalizeMessage);

      // Update cache
      const newCache = new Map(get().messageCache);
      newCache.set(contactNpub, { messages: normalizedMessages, timestamp: Date.now() });

      // Update offsets and hasMore
      const newOffsets = new Map(get().contactOffsets);
      newOffsets.set(contactNpub, normalizedMessages.length);

      const newHasMore = new Map(get().hasMore);
      newHasMore.set(contactNpub, normalizedMessages.length === PAGE_SIZE);

      set((state) => {
        const newMessages = new Map(state.messages);
        newMessages.set(contactNpub, normalizedMessages);
        return {
          messages: newMessages,
          isLoading: false,
          messageCache: newCache,
          contactOffsets: newOffsets,
          hasMore: newHasMore
        };
      });
    } catch (error) {
      set({ isLoading: false, error: String(error) });
    }
  },

  loadMoreMessages: async (contactNpub: string) => {
    const currentOffset = get().contactOffsets.get(contactNpub) || 0;
    const hasMore = get().hasMore.get(contactNpub);

    if (!hasMore || get().isLoading) return;

    set({ isLoading: true, error: null });
    try {
      const moreMessages = await getMessages(contactNpub, PAGE_SIZE, currentOffset);
      // Normalize image messages
      const normalizedMessages = moreMessages.map(normalizeMessage);

      // Update cache
      const cached = get().messageCache.get(contactNpub);
      // Prepend older messages to existing cache
      const allMessages = cached ? [...normalizedMessages, ...cached.messages] : normalizedMessages;

      const newCache = new Map(get().messageCache);
      newCache.set(contactNpub, { messages: allMessages, timestamp: Date.now() });

      // Update offsets
      const newOffsets = new Map(get().contactOffsets);
      newOffsets.set(contactNpub, currentOffset + normalizedMessages.length);

      // Check if more messages available
      const newHasMore = new Map(get().hasMore);
      newHasMore.set(contactNpub, normalizedMessages.length === PAGE_SIZE);

      set((state) => {
        const newMessages = new Map(state.messages);
        const existing = newMessages.get(contactNpub) || [];
        // Prepend older messages to existing messages
        const merged = [...normalizedMessages, ...existing];
        // Remove duplicates by ID
        const unique = merged.filter((msg, index, self) =>
          index === self.findIndex((m) => m.id === msg.id)
        );
        // Check if we actually added any new messages
        if (unique.length === existing.length) {
          const finalHasMore = new Map(state.hasMore);
          finalHasMore.set(contactNpub, false);
          return {
            isLoading: false,
            hasMore: finalHasMore,
          };
        }

        newMessages.set(contactNpub, unique);
        return {
          messages: newMessages,
          isLoading: false,
          messageCache: newCache,
          contactOffsets: newOffsets,
          hasMore: newHasMore
        };
      });
    } catch (error) {
      set({ isLoading: false, error: String(error) });
    }
  },

  hasMoreMessages: (contactNpub: string) => {
    return get().hasMore.get(contactNpub) ?? false;
  },

  sendMessage: async (receiverNpub: string, content: string) => {
    const tempId = `temp-${Date.now()}`;
    const tempTimestamp = Math.floor(Date.now() / 1000);
    try {
      const myNpub = useAuthStore.getState().npub;
      if (!myNpub) throw new Error("Not authenticated");

      // Optimistic update
      const optimisticMessage: Message = {
        id: tempId,
        sender: myNpub,
        receiver: receiverNpub,
        content,
        timestamp: tempTimestamp,
        status: "pending",
        messageType: "text",
      };

      get().addMessage(optimisticMessage);

      // Send to backend
      const messageId = await sendMessage(receiverNpub, content);

      // Update temp message with real ID immediately
      set((state) => {
        const newMessages = new Map(state.messages);
        const newCache = new Map(state.messageCache);
        const conversation = newMessages.get(receiverNpub) || [];
        const cached = newCache.get(receiverNpub);

        const realMsgExists = conversation.some(m => m.id === messageId);
        if (realMsgExists) {
          const updated = conversation
            .filter(m => m.id !== tempId)
            .map(m => m.id === messageId ? { ...m, status: "sent" as const } : m);
          newMessages.set(receiverNpub, updated);

          if (cached) {
            const cachedUpdated = cached.messages
              .filter(m => m.id !== tempId)
              .map(m => m.id === messageId ? { ...m, status: "sent" as const } : m);
            newCache.set(receiverNpub, { messages: cachedUpdated, timestamp: Date.now() });
          }
          return { messages: newMessages, messageCache: newCache };
        }

        const tempMsgIndex = conversation.findIndex(m => m.id === tempId);
        if (tempMsgIndex !== -1) {
          const updated = conversation.map(m =>
            m.id === tempId ? { ...m, id: messageId, status: "sent" as const } : m
          );
          newMessages.set(receiverNpub, updated);

          if (cached) {
            const cachedUpdated = cached.messages.map(m =>
              m.id === tempId ? { ...m, id: messageId, status: "sent" as const } : m
            ).filter((m, index, self) => index === self.findIndex((msg) => msg.id === m.id));
            newCache.set(receiverNpub, { messages: cachedUpdated, timestamp: Date.now() });
          }
          return { messages: newMessages, messageCache: newCache };
        }

        const duplicateCheck = conversation.find(m =>
          m.status === "sent" &&
          m.content.trim() === content.trim() &&
          m.timestamp === tempTimestamp &&
          m.sender === myNpub &&
          m.receiver === receiverNpub
        );
        if (duplicateCheck) {
          const updated = conversation.map(m =>
            m.id === duplicateCheck.id ? { ...m, status: "sent" as const } : m
          );
          newMessages.set(receiverNpub, updated);

          if (cached) {
            const cachedUpdated = cached.messages.map(m =>
              m.id === duplicateCheck.id ? { ...m, status: "sent" as const } : m
            );
            newCache.set(receiverNpub, { messages: cachedUpdated, timestamp: Date.now() });
          }
          return { messages: newMessages, messageCache: newCache };
        }

        const newMessage = {
          id: messageId,
          sender: myNpub,
          receiver: receiverNpub,
          content,
          timestamp: tempTimestamp,
          status: "sent" as const,
          messageType: "text" as const,
        };
        const updated = [...conversation, newMessage].sort((a, b) => a.timestamp - b.timestamp);
        newMessages.set(receiverNpub, updated);

        if (cached) {
          const cachedUpdated = [...cached.messages, newMessage]
            .filter((m, index, self) => index === self.findIndex((msg) => msg.id === m.id))
            .sort((a, b) => a.timestamp - b.timestamp);
          newCache.set(receiverNpub, { messages: cachedUpdated, timestamp: Date.now() });
        }

        return { messages: newMessages, messageCache: newCache };
      });

    } catch (error) {
      set((state) => {
        const newMessages = new Map(state.messages);
        const conversation = newMessages.get(receiverNpub) || [];
        const updated = conversation.map(m =>
          m.id === tempId ? { ...m, status: "failed" as const } : m
        );
        newMessages.set(receiverNpub, updated);
        return { messages: newMessages, error: String(error) };
      });

      toast.error("发送消息失败", {
        description: "请检查网络连接后重试",
        action: {
          label: "重试",
          onClick: () => get().retrySendMessage(tempId, receiverNpub, content),
        },
      });
      throw error;
    }
  },

  retrySendMessage: async (tempId: string, receiverNpub: string, content: string) => {
    try {
      const myNpub = useAuthStore.getState().npub;
      if (!myNpub) throw new Error("Not authenticated");

      const tempTimestamp = Math.floor(Date.now() / 1000);

      set((state) => {
        const newMessages = new Map(state.messages);
        const conversation = newMessages.get(receiverNpub) || [];
        const updated = conversation.map(m =>
          m.id === tempId ? { ...m, status: "pending" as const } : m
        );
        newMessages.set(receiverNpub, updated);
        return { messages: newMessages };
      });

      const messageId = await sendMessage(receiverNpub, content);

      set((state) => {
        const newMessages = new Map(state.messages);
        const newCache = new Map(state.messageCache);
        const conversation = newMessages.get(receiverNpub) || [];
        const cached = newCache.get(receiverNpub);

        const realMsgExists = conversation.some(m => m.id === messageId);
        if (realMsgExists) {
          const updated = conversation
            .filter(m => m.id !== tempId)
            .map(m => m.id === messageId ? { ...m, status: "sent" as const } : m);
          newMessages.set(receiverNpub, updated);

          if (cached) {
            const cachedUpdated = cached.messages
              .filter(m => m.id !== tempId)
              .map(m => m.id === messageId ? { ...m, status: "sent" as const } : m);
            newCache.set(receiverNpub, { messages: cachedUpdated, timestamp: Date.now() });
          }
          return { messages: newMessages, messageCache: newCache };
        }

        const tempMsgIndex = conversation.findIndex(m => m.id === tempId);
        if (tempMsgIndex !== -1) {
          const updated = conversation.map(m =>
            m.id === tempId ? { ...m, id: messageId, status: "sent" as const } : m
          );
          newMessages.set(receiverNpub, updated);

          if (cached) {
            const cachedUpdated = cached.messages.map(m =>
              m.id === tempId ? { ...m, id: messageId, status: "sent" as const } : m
            ).filter((m, index, self) => index === self.findIndex((msg) => msg.id === m.id));
            newCache.set(receiverNpub, { messages: cachedUpdated, timestamp: Date.now() });
          }
          return { messages: newMessages, messageCache: newCache };
        }

        const duplicateCheck = conversation.find(m =>
          m.status === "sent" &&
          m.content.trim() === content.trim() &&
          m.timestamp === tempTimestamp &&
          m.sender === myNpub &&
          m.receiver === receiverNpub
        );
        if (duplicateCheck) {
          const updated = conversation.map(m =>
            m.id === duplicateCheck.id ? { ...m, status: "sent" as const } : m
          );
          newMessages.set(receiverNpub, updated);

          if (cached) {
            const cachedUpdated = cached.messages.map(m =>
              m.id === duplicateCheck.id ? { ...m, status: "sent" as const } : m
            );
            newCache.set(receiverNpub, { messages: cachedUpdated, timestamp: Date.now() });
          }
          return { messages: newMessages, messageCache: newCache };
        }

        const newMessage = {
          id: messageId,
          sender: myNpub,
          receiver: receiverNpub,
          content,
          timestamp: tempTimestamp,
          status: "sent" as const,
          messageType: "text" as const,
        };
        const updated = [...conversation, newMessage].sort((a, b) => a.timestamp - b.timestamp);
        newMessages.set(receiverNpub, updated);

        if (cached) {
          const cachedUpdated = [...cached.messages, newMessage]
            .filter((m, index, self) => index === self.findIndex((msg) => msg.id === m.id))
            .sort((a, b) => a.timestamp - b.timestamp);
          newCache.set(receiverNpub, { messages: cachedUpdated, timestamp: Date.now() });
        }

        return { messages: newMessages, messageCache: newCache };
      });

    } catch (error) {
      set((state) => {
        const newMessages = new Map(state.messages);
        const conversation = newMessages.get(receiverNpub) || [];
        const updated = conversation.map(m =>
          m.id === tempId ? { ...m, status: "failed" as const } : m
        );
        newMessages.set(receiverNpub, updated);
        return { messages: newMessages, error: String(error) };
      });

      toast.error("重试失败");
    }
  },

  sendImage: async (receiverNpub: string, imageData: Uint8Array, filename: string) => {
    const tempId = `temp-${Date.now()}`;
    const tempTimestamp = Math.floor(Date.now() / 1000);

    try {
      const myNpub = useAuthStore.getState().npub;
      if (!myNpub) throw new Error("Not authenticated");

      const optimisticMessage: Message = {
        id: tempId,
        sender: myNpub,
        receiver: receiverNpub,
        content: "",
        timestamp: tempTimestamp,
        status: "pending",
        messageType: "image",
        mediaUrl: null,
      };

      get().addMessage(optimisticMessage);

      const [messageId, , mediaUrl] = await sendImage(receiverNpub, imageData, filename);

      set((state) => {
        const newMessages = new Map(state.messages);
        const newCache = new Map(state.messageCache);
        const conversation = newMessages.get(receiverNpub) || [];
        const cached = newCache.get(receiverNpub);

        const realMsgExists = conversation.some(m => m.id === messageId);
        if (realMsgExists) {
          const updated = conversation.map(m =>
            m.id === messageId ? { ...m, status: "sent" as const, mediaUrl } : m
          );
          newMessages.set(receiverNpub, updated);

          if (cached) {
            const cachedUpdated = cached.messages.map(m =>
              m.id === messageId ? { ...m, status: "sent" as const, mediaUrl } : m
            );
            newCache.set(receiverNpub, { messages: cachedUpdated, timestamp: Date.now() });
          }
          return { messages: newMessages, messageCache: newCache };
        }

        const tempMsgIndex = conversation.findIndex(m => m.id === tempId);
        if (tempMsgIndex !== -1) {
          const updated = conversation.map(m =>
            m.id === tempId ? {
              ...m,
              id: messageId,
              status: "sent" as const,
              mediaUrl
            } : m
          );
          newMessages.set(receiverNpub, updated);

          if (cached) {
            const cachedUpdated = cached.messages.map(m =>
              m.id === tempId ? {
                ...m,
                id: messageId,
                status: "sent" as const,
                mediaUrl
              } : m
            ).filter((m, index, self) => index === self.findIndex((msg) => msg.id === m.id));
            newCache.set(receiverNpub, { messages: cachedUpdated, timestamp: Date.now() });
          }
          return { messages: newMessages, messageCache: newCache };
        }

        const duplicateCheck = conversation.find(m =>
          m.status === "sent" &&
          m.messageType === "image" &&
          m.mediaUrl === mediaUrl &&
          m.timestamp === tempTimestamp &&
          m.sender === myNpub &&
          m.receiver === receiverNpub
        );
        if (duplicateCheck) {
          const updated = conversation.map(m =>
            m.id === duplicateCheck.id ? { ...m, status: "sent" as const } : m
          );
          newMessages.set(receiverNpub, updated);

          if (cached) {
            const cachedUpdated = cached.messages.map(m =>
              m.id === duplicateCheck.id ? { ...m, status: "sent" as const } : m
            );
            newCache.set(receiverNpub, { messages: cachedUpdated, timestamp: Date.now() });
          }
          return { messages: newMessages, messageCache: newCache };
        }

        const newMessage = {
          id: messageId,
          sender: myNpub,
          receiver: receiverNpub,
          content: "",
          timestamp: tempTimestamp,
          status: "sent" as const,
          messageType: "image" as const,
          mediaUrl: mediaUrl
        };
        const updated = [...conversation, newMessage].sort((a, b) => a.timestamp - b.timestamp);
        newMessages.set(receiverNpub, updated);

        if (cached) {
          const cachedUpdated = [...cached.messages, newMessage]
            .filter((m, index, self) => index === self.findIndex((msg) => msg.id === m.id))
            .sort((a, b) => a.timestamp - b.timestamp);
          newCache.set(receiverNpub, { messages: cachedUpdated, timestamp: Date.now() });
        }

        return { messages: newMessages, messageCache: newCache };
      });
    } catch (error) {
      set((state) => {
        const newMessages = new Map(state.messages);
        const conversation = newMessages.get(receiverNpub) || [];
        const updated = conversation.map(m =>
          m.id === tempId ? { ...m, status: "failed" as const } : m
        );
        newMessages.set(receiverNpub, updated);
        return { messages: newMessages, error: String(error) };
      });

      toast.error("图片发送失败", {
        description: "请检查网络连接后重试",
      });
      throw error;
    }
  },

  addMessage: (message: Message) => {
    // Normalize the message (clear content for image messages)
    const normalizedMessage = normalizeMessage(message);

    let isNew = false;
    let contactNpub = "";

    const myNpub = useAuthStore.getState().npub;
    contactNpub = normalizedMessage.sender === myNpub ? normalizedMessage.receiver : normalizedMessage.sender;

    set((state) => {
      const newMessages = new Map(state.messages);
      const existing = newMessages.get(contactNpub) || [];

      // ===== 第一层: 通过 ID 精确匹配 =====
      const existingMsg = existing.find((m) => m.id === normalizedMessage.id);
      if (existingMsg) {
        // 消息已存在,检查是否需要更新字段
        // 检查所有可能变化的字段
        const needsUpdate =
          (normalizedMessage.mediaUrl !== undefined && normalizedMessage.mediaUrl !== existingMsg.mediaUrl) ||
          (normalizedMessage.status !== undefined && normalizedMessage.status !== existingMsg.status) ||
          (normalizedMessage.content !== undefined && normalizedMessage.content !== existingMsg.content) ||
          (normalizedMessage.messageType !== undefined && normalizedMessage.messageType !== existingMsg.messageType);

        if (needsUpdate) {
          const updated = existing.map(m => {
            if (m.id !== normalizedMessage.id) return m;
            const result = { ...m };
            if (normalizedMessage.mediaUrl !== undefined) result.mediaUrl = normalizedMessage.mediaUrl;
            if (normalizedMessage.status !== undefined) result.status = normalizedMessage.status;
            if (normalizedMessage.content !== undefined) result.content = normalizedMessage.content;
            if (normalizedMessage.messageType !== undefined) result.messageType = normalizedMessage.messageType;
            return result;
          });
          newMessages.set(contactNpub, updated);

          const newCache = new Map(state.messageCache);
          const cached = newCache.get(contactNpub);
          if (cached) {
            const cachedUpdated = cached.messages.map(m => {
              if (m.id !== normalizedMessage.id) return m;
              const result = { ...m };
              if (normalizedMessage.mediaUrl !== undefined) result.mediaUrl = normalizedMessage.mediaUrl;
              if (normalizedMessage.status !== undefined) result.status = normalizedMessage.status;
              if (normalizedMessage.content !== undefined) result.content = normalizedMessage.content;
              if (normalizedMessage.messageType !== undefined) result.messageType = normalizedMessage.messageType;
              return result;
            });
            newCache.set(contactNpub, { messages: cachedUpdated, timestamp: Date.now() });
          }

          return { messages: newMessages, messageCache: newCache };
        }

        // 消息已存在且无需更新，返回现有状态
        return { messages: new Map(newMessages), messageCache: new Map(state.messageCache) };
      }

      // ===== 第二层: 图片消息通过 mediaUrl 匹配 (防重复) =====
      if (normalizedMessage.messageType === "image" && normalizedMessage.mediaUrl) {
        const existingImage = existing.find(m =>
          m.messageType === "image" &&
          m.mediaUrl &&
          m.mediaUrl === normalizedMessage.mediaUrl
        );
        if (existingImage) {
          return { messages: new Map(newMessages), messageCache: new Map(state.messageCache) };
        }
      }

      // ===== 第三层: 临时消息替换逻辑 =====
      // 查找所有临时消息（包括 pending 和 sent 状态，因为可能已经快速更新过）
      const tempMsgs = existing
        .map((m, index) => ({ m, index }))
        .filter(({ m }) => m.id.startsWith('temp-'))
        .map(({ index }) => index);

      for (const tempMsgIndex of tempMsgs) {
        const tempMsg = existing[tempMsgIndex];

        // 图片消息匹配 - 使用更宽松的条件
        if (normalizedMessage.messageType === "image" && tempMsg.messageType === "image") {
          // 如果时间戳接近（10秒内）或者有相同的 mediaUrl（一个有值一个为null）
          const timestampMatch = Math.abs(tempMsg.timestamp - normalizedMessage.timestamp) <= 10;
          const mediaUrlMatch = normalizedMessage.mediaUrl && !tempMsg.mediaUrl;

          if (timestampMatch || mediaUrlMatch) {
            const updated = [...existing];
            updated[tempMsgIndex] = normalizedMessage;
            updated.sort((a, b) => a.timestamp - b.timestamp);
            newMessages.set(contactNpub, updated);
            isNew = true;

            const newCache = new Map(state.messageCache);
            const cached = newCache.get(contactNpub);
            if (cached) {
              const cachedUpdated = cached.messages
                .filter(m => m.id !== tempMsg.id)
                .concat(normalizedMessage)
                .sort((a, b) => a.timestamp - b.timestamp);
              newCache.set(contactNpub, { messages: cachedUpdated, timestamp: Date.now() });
            }

            return { messages: newMessages, messageCache: newCache };
          }
        }
        // 文本消息匹配 - 使用更宽松的条件
        else if (
          normalizedMessage.messageType === "text" &&
          tempMsg.messageType === "text" &&
          normalizedMessage.sender === tempMsg.sender &&
          normalizedMessage.receiver === tempMsg.receiver
        ) {
          // 检查内容是否相似（去除首尾空格后比较）
          const contentMatch = normalizedMessage.content.trim() === tempMsg.content.trim();
          // 时间戳匹配范围扩大到 60 秒（处理网络延迟）
          const timestampMatch = Math.abs(tempMsg.timestamp - normalizedMessage.timestamp) <= 60;

          if (contentMatch && timestampMatch) {
            const updated = [...existing];
            updated[tempMsgIndex] = normalizedMessage;
            updated.sort((a, b) => a.timestamp - b.timestamp);
            newMessages.set(contactNpub, updated);
            isNew = true;

            const newCache = new Map(state.messageCache);
            const cached = newCache.get(contactNpub);
            if (cached) {
              const cachedUpdated = cached.messages
                .filter(m => m.id !== tempMsg.id)
                .concat(normalizedMessage)
                .sort((a, b) => a.timestamp - b.timestamp);
              newCache.set(contactNpub, { messages: cachedUpdated, timestamp: Date.now() });
            }

            return { messages: newMessages, messageCache: newCache };
          }
        }
      }

      // ===== 第四层: 新增消息 =====
      const updated = [...existing, normalizedMessage].sort((a, b) => a.timestamp - b.timestamp);
      newMessages.set(contactNpub, updated);
      isNew = true;

      const newCache = new Map(state.messageCache);
      const cached = newCache.get(contactNpub);
      if (cached) {
        const cachedUpdated = [...cached.messages, normalizedMessage]
          .filter((m, index, self) => index === self.findIndex((msg) => msg.id === m.id))
          .sort((a, b) => a.timestamp - b.timestamp);
        newCache.set(contactNpub, { messages: cachedUpdated, timestamp: Date.now() });
      }

      return { messages: newMessages, messageCache: newCache };
    });

    return isNew;
  },

  deleteMessage: async (contactNpub: string, messageId: string) => {
    try {
      await deleteLocalMessage(messageId);

      set((state) => {
        const newMessages = new Map(state.messages);
        const existing = newMessages.get(contactNpub) || [];
        const updated = existing.filter(m => m.id !== messageId);
        newMessages.set(contactNpub, updated);

        // Also update cache
        const newCache = new Map(state.messageCache);
        const cached = newCache.get(contactNpub);
        if (cached) {
          newCache.set(contactNpub, {
            ...cached,
            messages: cached.messages.filter(m => m.id !== messageId)
          });
        }

        return { messages: newMessages, messageCache: newCache };
      });
    } catch (error) {
      console.error("Failed to delete message:", error);
      toast.error("删除消息失败");
    }
  },

  clearConversation: async (contactNpub: string) => {
    try {
      await clearConversationBackend(contactNpub);

      set((state) => {
        const newMessages = new Map(state.messages);
        newMessages.delete(contactNpub);

        const newCache = new Map(state.messageCache);
        newCache.delete(contactNpub);

        const newOffsets = new Map(state.contactOffsets);
        newOffsets.delete(contactNpub);

        const newHasMore = new Map(state.hasMore);
        newHasMore.delete(contactNpub);

        return { messages: newMessages, messageCache: newCache, contactOffsets: newOffsets, hasMore: newHasMore };
      });

      // After clearing conversation, refresh chat sessions
      setTimeout(() => {
        // Load chat sessions from contact store to update the UI
        import("@/store/contactStore").then(({ useContactStore }) => {
          useContactStore.getState().loadChatSessions();
        });
      }, 100); // Small delay to ensure the conversation is cleared before reloading

      toast.success("聊天记录已清空");
    } catch (error) {
      console.error("Failed to clear conversation:", error);
      toast.error("清空聊天记录失败");
    }
  },

  updateMessageStatus: (messageId: string, status: Message["status"], contactNpub?: string) => {
    set((state) => {
      let targetContact = contactNpub;

      // If contactNpub is not provided, try to find the contact efficiently
      if (!targetContact) {
        for (const [contact, messages] of state.messages.entries()) {
          // Use find instead of some to potentially get the message if needed, but some is fine for check
          if (messages.some((m) => m.id === messageId)) {
            targetContact = contact;
            break;
          }
        }
      }

      if (!targetContact) return {};

      const currentMessages = state.messages.get(targetContact) || [];
      let changed = false;
      const updated = currentMessages.map((m) => {
        if (m.id !== messageId) return m;
        if (m.status === status) return m;
        changed = true;
        return { ...m, status };
      });

      if (!changed) return {};

      const newMessages = new Map(state.messages);
      newMessages.set(targetContact, updated);

      const newCache = new Map(state.messageCache);
      const cached = newCache.get(targetContact);
      if (cached) {
        const cachedUpdated = cached.messages.map((m) => {
          if (m.id !== messageId) return m;
          if (m.status === status) return m;
          return { ...m, status };
        });
        newCache.set(targetContact, { ...cached, messages: cachedUpdated });
      }

      return { messages: newMessages, messageCache: newCache };
    });
  },

  getConversation: (contactNpub: string) => {
    return get().messages.get(contactNpub) || [];
  },

  clearError: () => {
    set({ error: null });
  },

  clearCache: () => {
    set({
      messageCache: new Map(),
      contactOffsets: new Map(),
      hasMore: new Map(),
    });
  },
}));
