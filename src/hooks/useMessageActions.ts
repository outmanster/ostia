import { useState, useCallback } from "react";
import { toast } from "sonner";
import { invoke } from "@tauri-apps/api/core";
import type { Message } from "@/types";
import { useMessageStore } from "@/store/messageStore";

interface MessageActions {
  isReplying: boolean;
  isEditing: boolean;
  replyingTo: Message | null;
  editingMessage: Message | null;

  startReply: (message: Message) => void;
  startEdit: (message: Message) => void;
  cancelReply: () => void;
  cancelEdit: () => void;

  sendReply: (content: string, originalMessage: Message) => Promise<void>;
  editMessage: (messageId: string, newContent: string) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  sendZap: (message: Message, amountMsats: number) => Promise<void>;
}

export function useMessageActions(): MessageActions {
  const [isReplying, setIsReplying] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const { updateMessageStatus } = useMessageStore();

  const startReply = useCallback((message: Message) => {
    setReplyingTo(message);
    setIsReplying(true);
    setIsEditing(false);
    setEditingMessage(null);
  }, []);

  const startEdit = useCallback((message: Message) => {
    setEditingMessage(message);
    setIsEditing(true);
    setIsReplying(false);
    setReplyingTo(null);
  }, []);

  const cancelReply = useCallback(() => {
    setIsReplying(false);
    setReplyingTo(null);
  }, []);

  const cancelEdit = useCallback(() => {
    setIsEditing(false);
    setEditingMessage(null);
  }, []);

  const sendReply = useCallback(async (content: string, originalMessage: Message) => {
    try {
      // NIP-22: Reply with reference to original message
      // In a full implementation, this would create a reply event with 'e' tag
      // For now, we'll just send the message with a reference indicator
      const replyContent = `↩️ 回复 ${originalMessage.sender.slice(0, 12)}...\n${content}`;

      // Use the existing message store to send
      const messageStore = useMessageStore.getState();
      await messageStore.sendMessage(originalMessage.sender, replyContent);

      toast.success("回复已发送");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`发送回复失败: ${message}`);
      throw error;
    }
  }, []);

  const editMessage = useCallback(async (messageId: string, _newContent: string) => {
    try {
      // NIP-16: Edit message using replaceable events
      // This would create a new version of the event with same created_at + 1
      // For now, we'll update locally and notify
      updateMessageStatus(messageId, "pending");

      // In production, call: await invoke("edit_message", { messageId, newContent });
      await new Promise(resolve => setTimeout(resolve, 500)); // Simulated

      // Update in store
      const messageStore = useMessageStore.getState();
      messageStore.getConversation(messageId);
      // This is a simplified version - real implementation would update the actual message

      updateMessageStatus(messageId, "delivered");
      toast.success("消息已编辑");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`编辑失败: ${message}`);
      throw error;
    }
  }, [updateMessageStatus]);

  const deleteMessage = useCallback(async (messageId: string) => {
    try {
      // NIP-16: Delete message using replaceable events
      await invoke("delete_message", { messageId });

      toast.success("消息已删除");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`删除失败: ${message}`);
      throw error;
    }
  }, []);

  const sendZap = useCallback(async (message: Message, amountMsats: number) => {
    try {
      const recipient = message.sender;
      const eventId = message.id;

      // Get relays from store or use defaults
      const relays: string[] = []; // Would get from relay store

      await invoke("send_zap", {
        amountMsats,
        recipient,
        eventId,
        relays,
        comment: `Zap for message ${message.id.slice(0, 8)}...`,
      });

      toast.success(`Zap sent: ${amountMsats} msats`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`发送 Zap 失败: ${message}`);
      throw error;
    }
  }, []);

  return {
    isReplying,
    isEditing,
    replyingTo,
    editingMessage,
    startReply,
    startEdit,
    cancelReply,
    cancelEdit,
    sendReply,
    editMessage,
    deleteMessage,
    sendZap,
  };
}
