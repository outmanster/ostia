import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { useShallow } from 'zustand/react/shallow';
import { Send, Image as ImageIcon, MoreVertical, ArrowLeft, Loader2, Info } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { ContactDetailView } from "@/components/contacts/ContactDetailView";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useContactStore } from "@/store/contactStore";
import { useMessageStore } from "@/store/messageStore";
import { useNotificationStore } from "@/store/notificationStore";
import { useUIStore } from "@/store/uiStore";
import type { Contact } from "@/types";
import { VirtualMessageList } from "@/components/chat/VirtualMessageList";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useTypingStore } from "@/store/typingStore";
import { usePresenceStore } from "@/store/presenceStore";
import { sendTyping } from "@/utils/nostr";
import { pickImageFromWeb } from "@/utils/file";

function ChatHeader({ contact, onBack }: { contact: Contact; onBack?: () => void }) {
  const isMobile = useUIStore(s => s.isMobile);
  const selectContact = useContactStore(s => s.selectContact);
  const clearConversation = useMessageStore(s => s.clearConversation);
  const [showProfile, setShowProfile] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  // Use useShallow because getPresence returns a new object when stale, causing infinite loops
  const presence = usePresenceStore(useShallow(s => s.getPresence(contact.npub)));
  const isTyping = useTypingStore(s => s.isTyping(contact.npub));

  const getDisplayName = (c: Contact) => {
    return c.remark || c.displayName || c.name || c.npub.slice(0, 12) + "...";
  };

  return (
    <div
      className="h-14 border-b flex items-center justify-between px-3 bg-background/95 backdrop-blur z-10 shrink-0 box-content"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="flex items-center gap-2">
        {isMobile && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onBack || (() => selectContact(null))}
            className="-ml-2 h-8 w-8"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
        )}
        <Avatar className="h-9 w-9 border border-border">
          <AvatarImage src={contact.picture} />
          <AvatarFallback className="text-xs">
            {(contact.displayName || contact.name || contact.npub)
              .slice(0, 2)
              .toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div>
          <p className="font-semibold text-sm leading-none mb-0.5 flex items-center gap-2">
            <span>{getDisplayName(contact)}</span>
            {presence?.online && (
              <>
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500" />
                {!isTyping && <span className="text-[0.625rem] text-emerald-400">在线</span>}
              </>
            )}
            {isTyping && <span className="text-[0.625rem] text-primary">正在输入…</span>}
          </p>
          <p className="text-xs text-muted-foreground truncate max-w-[150px] sm:max-w-xs font-mono">
            {contact.npub.slice(0, 8)}...{contact.npub.slice(-8)}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1">
        {isMobile && (
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground h-8 w-8"
            onClick={() => setShowProfile(true)}
          >
            <Info className="h-4 w-4" />
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground h-8 w-8">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              className="text-destructive focus:text-destructive focus:bg-destructive/10"
              onClick={() => setShowClearConfirm(true)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              <span>清空聊天记录</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Mobile Profile Sheet */}
      {isMobile && (
        <Dialog open={showProfile} onOpenChange={setShowProfile}>
          <DialogContent className="p-0 sm:max-w-[425px] max-h-[80vh] flex flex-col overflow-hidden">
            <DialogHeader className="p-4 border-b shrink-0">
              <DialogTitle>联系人详情</DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto">
              <ContactDetailView
                onStartChat={() => setShowProfile(false)}
                className="flex-none h-auto"
              />
            </div>
          </DialogContent>
        </Dialog>
      )}
      {/* Clear History Confirmation Dialog */}
      <AlertDialog open={showClearConfirm} onOpenChange={setShowClearConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确定要清空聊天记录吗？</AlertDialogTitle>
            <AlertDialogDescription>
              此操作将删除与该联系人的所有本地聊天记录，且无法撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground focus:ring-destructive"
              onClick={() => {
                clearConversation(contact.npub);
                setShowClearConfirm(false);
              }}
            >
              清空
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function MessageInput({
  onSend,
  onSendImage,
  disabled,
}: {
  onSend: (content: string) => Promise<void>;
  onSendImage: (imageData: Uint8Array, filename: string) => Promise<void>;
  disabled?: boolean;
}) {
  const [message, setMessage] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const isMobile = useUIStore(s => s.isMobile);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const typingTimerRef = useRef<number | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || disabled || isSending) return;
    setIsSending(true);
    try {
      await onSend(message.trim());
      setMessage("");
      const contact = useContactStore.getState().selectedContact;
      if (contact) {
        sendTyping(contact.npub, false).catch(() => { });
      }
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);
    const contact = useContactStore.getState().selectedContact;
    if (!contact || disabled) return;
    sendTyping(contact.npub, true).catch(() => { });
    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current);
    }
    typingTimerRef.current = window.setTimeout(() => {
      sendTyping(contact.npub, false).catch(() => { });
      typingTimerRef.current = null;
    }, 1500);
  };

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const maxHeight = isMobile ? 120 : 160;
    el.style.height = "0px";
    const nextHeight = Math.min(el.scrollHeight, maxHeight);
    el.style.height = `${nextHeight}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [message, isMobile]);

  const handleMobilePick = async (capture?: string) => {
    if (disabled || isUploading) return;
    setIsUploading(true);
    try {
      const picked = await pickImageFromWeb(capture);
      if (picked) {
        await onSendImage(picked.data, picked.filename);
      }
    } catch (err) {
      console.error("Mobile upload failed:", err);
      toast.error("图片上传失败");
    } finally {
      setIsUploading(false);
    }
  };

  const handleImageUpload = async () => {
    if (disabled || isUploading) return;

    try {
      const selected = await open({
        title: "选择图片",
        multiple: false,
        filters: [
          {
            name: "Images",
            extensions: ["png", "jpg", "jpeg", "webp", "gif"],
          },
        ],
      });
      if (selected) {
        const path = selected as string;
        setIsUploading(true);
        const fileData = await readFile(path);
        const filename = path.split(/[\\/]/).pop() || "image.png";
        await onSendImage(fileData, filename);
      }
    } catch (err) {
      console.error("Image upload failed:", err);
      const errorMessage = typeof err === 'string'
        ? err
        : (err instanceof Error ? err.message : "未知错误");
      toast.error("图片发送失败", {
        description: errorMessage,
      });
    } finally {
      setIsUploading(false);
    }
  };

  const UploadButton = (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="rounded-full h-9 w-9 text-muted-foreground hover:text-foreground hover:bg-transparent"
      disabled={disabled || isUploading}
      onClick={isMobile ? () => handleMobilePick() : handleImageUpload}
    >
      {isUploading ? (
        <Loader2 className="h-5 w-5 animate-spin" />
      ) : (
        <ImageIcon className="h-5 w-5" />
      )}
    </Button>
  );

  return (
    <div className="p-4 bg-background">
      <form
        onSubmit={handleSubmit}
        className="flex items-end gap-2 p-2 bg-muted/30 rounded-md border border-border/50 focus-within:ring-1 focus-within:ring-primary focus-within:border-primary transition-all"
      >
        {UploadButton}

        <Textarea
          ref={textareaRef}
          value={message}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="输入消息..."
          disabled={disabled}
          rows={1}
          className="flex-1 border-none shadow-none focus-visible:ring-0 min-h-[40px] py-2 bg-transparent resize-none"
        />

        <Button
          type="submit"
          size="icon"
          disabled={disabled || !message.trim() || isSending}
          className="rounded-full h-9 w-9 shrink-0"
        >
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}

export function ChatArea({ contact, onBack }: { contact?: Contact; onBack?: () => void }) {
  const storeContact = useContactStore(s => s.selectedContact);
  const selectedContact = contact || storeContact;
  const sendMessage = useMessageStore(s => s.sendMessage);
  const sendImage = useMessageStore(s => s.sendImage);
  const isMobile = useUIStore(s => s.isMobile);
  const openSidebar = useUIStore(s => s.openSidebar);
  const [scrollToMessageNonce, setScrollToMessageNonce] = useState(0);
  const unreadAnchorRef = useRef<{ id: string; count: number } | null>(null);
  const [unreadAnchor, setUnreadAnchor] = useState<{ id: string; count: number } | null>(null);
  const [isFirstUnreadInView, setIsFirstUnreadInView] = useState(false);
  const [hasCheckedFirstUnreadVisibility, setHasCheckedFirstUnreadVisibility] = useState(false);

  // Load messages when contact is selected
  useEffect(() => {
    if (selectedContact?.npub) {
      // Use getState() to avoid dependency instability
      useMessageStore.getState().loadMessages(selectedContact.npub);
    }
  }, [selectedContact?.npub]); // DEPEND ON NPUB STRING ONLY, NOT THE OBJECT

  // Use Zustand selector with shallow comparison to prevent unnecessary re-renders
  // This is critical: without this, returning a new array [] every time causes infinite loops
  const conversationMessages = useMessageStore(
    useShallow((state) =>
      selectedContact ? (state.messages.get(selectedContact.npub) || []) : []
    )
  );

  // Track processed read receipts to prevent loops
  const lastProcessedIdsRef = useRef<string[]>([]);

  // Reset processed IDs when contact changes
  useEffect(() => {
    lastProcessedIdsRef.current = [];
  }, [selectedContact?.npub]);

  useEffect(() => {
    unreadAnchorRef.current = null;
    setUnreadAnchor(null);
    setIsFirstUnreadInView(false);
    setHasCheckedFirstUnreadVisibility(false);
  }, [selectedContact?.npub]);

  const unreadCandidates = useMemo(() => {
    if (!selectedContact) return [];
    return conversationMessages.filter(m => m.sender === selectedContact.npub && m.status !== "read");
  }, [conversationMessages, selectedContact?.npub]);

  useEffect(() => {
    if (!selectedContact) return;
    if (unreadAnchorRef.current) return;
    if (unreadCandidates.length === 0) return;
    const nextAnchor = { id: unreadCandidates[0].id, count: unreadCandidates.length };
    unreadAnchorRef.current = nextAnchor;
    setUnreadAnchor(nextAnchor);
  }, [selectedContact, unreadCandidates]);

  useEffect(() => {
    setHasCheckedFirstUnreadVisibility(false);
  }, [unreadAnchor?.id]);

  useEffect(() => {
    if (!selectedContact) return;

    // 1. Optimistic update for currently loaded messages to give instant feedback
    const unreadLoaded = conversationMessages.filter(m => m.sender === selectedContact.npub && m.status !== "read");
    if (unreadLoaded.length > 0) {
      unreadLoaded.forEach(m => {
        useMessageStore.getState().updateMessageStatus(m.id, "read", selectedContact.npub);
      });
    }

    // 2. Call backend to mark ALL messages as read (including those not loaded in memory)
    // This ensures database state is consistent and clears "ghost" unread counts
    invoke("mark_all_messages_as_read", { contactNpub: selectedContact.npub })
      .then(() => {
        // Force refresh chat sessions to ensure sidebar count is cleared
        useContactStore.getState().loadChatSessions();
      })
      .catch(console.error);

    // 3. Sync read status to notification server
    // Ack the latest message timestamp to clear server-side notifications
    if (conversationMessages.length > 0) {
      const lastMsg = conversationMessages[conversationMessages.length - 1];
      // Only ACK if it's from the contact (not me) - actually ACK logic usually just updates "last seen" time
      // But we should probably use the latest timestamp of ANY message in the chat to be safe
      if (lastMsg.timestamp > 0) {
        useNotificationStore.getState().ack(lastMsg.timestamp);
      }
    }

  }, [selectedContact?.npub, conversationMessages.length]);

  const handleSendMessage = async (content: string) => {
    if (selectedContact) {
      await sendMessage(selectedContact.npub, content);
    }
  };

  const handleSendImage = async (imageData: Uint8Array, filename: string) => {
    if (selectedContact) {
      await sendImage(selectedContact.npub, imageData, filename);
    }
  };

  const handleJumpToUnread = useCallback(() => {
    if (!unreadAnchor?.id) return;
    setScrollToMessageNonce((prev) => prev + 1);
  }, [unreadAnchor?.id]);

  const handleFirstUnreadVisibilityChange = useCallback((isVisible: boolean) => {
    setIsFirstUnreadInView(isVisible);
    setHasCheckedFirstUnreadVisibility(true);
  }, []);

  const shouldShowUnreadPrompt = useMemo(() => {
    if (!unreadAnchor?.id) return false;
    if (unreadAnchor.count <= 0) return false;
    const threshold = 2;
    if (unreadAnchor.count > threshold) return true;
    if (!hasCheckedFirstUnreadVisibility) return false;
    return !isFirstUnreadInView;
  }, [hasCheckedFirstUnreadVisibility, isFirstUnreadInView, unreadAnchor?.count, unreadAnchor?.id]);

  if (!selectedContact) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-muted/10 h-full p-6">
        <div className="text-center space-y-6 max-w-sm">
          <div className="w-24 h-24 bg-muted/50 rounded-full flex items-center justify-center mb-4 animate-in zoom-in duration-300 mx-auto">
            <span className="text-4xl">👋</span>
          </div>
          <div className="space-y-2">
            <p className="text-muted-foreground text-sm">
              选择/添加联系人开始聊天 ~
            </p>
          </div>

          {isMobile && (
            <Button
              className="w-full h-11 bg-primary text-primary-foreground font-medium rounded-md shadow-sm"
              onClick={openSidebar}
            >
              打开消息列表
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-background relative">
      <ChatHeader contact={selectedContact} onBack={onBack} />

      {/* Use virtual scrolling for better performance */}
      <div className="flex-1 overflow-hidden relative">
        <div className="absolute inset-0 z-0 opacity-20 pointer-events-none" /> {/* Optional background pattern connection */}
        {shouldShowUnreadPrompt && unreadAnchor && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10">
            <Button
              variant="secondary"
              size="sm"
              className="h-7 px-3 text-xs rounded-full shadow-sm"
              onClick={handleJumpToUnread}
            >
              未读 {unreadAnchor.count} 条，点击定位
            </Button>
          </div>
        )}
        <VirtualMessageList
          messages={conversationMessages}
          selectedContactNpub={selectedContact.npub}
          firstUnreadMessageId={unreadAnchor?.id}
          initialScrollToMessageId={unreadAnchor?.id}
          scrollToMessageId={unreadAnchor?.id}
          scrollToMessageNonce={scrollToMessageNonce}
          onFirstUnreadVisibilityChange={handleFirstUnreadVisibilityChange}
        />
      </div>

      <MessageInput
        onSend={handleSendMessage}
        onSendImage={handleSendImage}
        disabled={selectedContact?.blocked || false}
      />
    </div>
  );
}
