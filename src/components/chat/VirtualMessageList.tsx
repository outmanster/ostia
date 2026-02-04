import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type * as React from "react";
import { useMessageStore } from "@/store/messageStore";
import { useAuthStore } from "@/store/authStore";
import { useContactStore } from "@/store/contactStore";
import type { Message } from "@/types";
import { ImageMessage } from "./ImageMessage";
import { Trash2, Loader2, Check, CheckCheck } from "lucide-react";

interface VirtualMessageListProps {
  messages: Message[];
  selectedContactNpub: string;
  firstUnreadMessageId?: string | null;
  initialScrollToMessageId?: string | null;
  scrollToMessageId?: string | null;
  scrollToMessageNonce?: number;
  onFirstUnreadVisibilityChange?: (isVisible: boolean) => void;
}

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useUIStore } from "@/store/uiStore";
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
import { toast } from "sonner";

const MessageRow = ({
  message,
  isOwn,
  isMobile,
  formatTime,
  onDelete,
  onOpenActions,
  contact,
  myProfile,
}: {
  message: Message;
  isOwn: boolean;
  isMobile: boolean;
  formatTime: (ts: number) => string;
  onDelete: (id: string) => void;
  onOpenActions: (message: Message) => void;
  contact?: any;
  myProfile?: any;
}) => {
  const isImage = message.messageType === "image";
  const avatarUrl = isOwn ? myProfile?.picture : contact?.picture;
  const displayName = isOwn ? (myProfile?.displayName || "Me") : (contact?.remark || contact?.displayName || contact?.name || "User");
  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressStartRef = useRef<{ x: number; y: number } | null>(null);
  const didLongPressRef = useRef(false);

  // Initials for fallback
  const initials = displayName ? displayName.slice(0, 2).toUpperCase() : "?";

  const clearPressTimer = () => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!isMobile) return;

    didLongPressRef.current = false;
    pressStartRef.current = { x: e.clientX, y: e.clientY };

    clearPressTimer();
    pressTimerRef.current = setTimeout(() => {
      didLongPressRef.current = true;
      onOpenActions(message);
      if (navigator.vibrate) navigator.vibrate(50);
    }, 500);
  };

  const handlePointerUp = () => {
    clearPressTimer();
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isMobile) return;
    if (!pressTimerRef.current || !pressStartRef.current) return;
    const dx = Math.abs(e.clientX - pressStartRef.current.x);
    const dy = Math.abs(e.clientY - pressStartRef.current.y);
    if (dx > 10 || dy > 10) {
      clearPressTimer();
    }
  };

  const isUnread = !isOwn && message.status !== "read";

  return (
    <div
      className={`flex items-end gap-2 mb-2 group select-none ${isOwn ? "flex-row-reverse" : "flex-row"} ${isUnread ? "unread-message border-l-2 border-primary/70 pl-2" : ""}`}
      data-message-id={message.id}
    >
      {/* Avatar */}
      <Avatar className="h-7 w-7 shrink-0 shadow-sm border border-background/20 cursor-pointer hover:opacity-90 transition-opacity pb-0">
        <AvatarImage src={avatarUrl} className="object-cover" />
        <AvatarFallback className="text-[10px] font-bold bg-muted text-muted-foreground">
          {initials}
        </AvatarFallback>
      </Avatar>

      <div className={`flex flex-col max-w-[75%] ${isOwn ? "items-end" : "items-start"}`}>
        {!isOwn && (
          <span className="text-xs text-muted-foreground/80 mb-0.5">
            {displayName}
          </span>
        )}

        {/* Content Bubble */}
        {isImage ? (
          <div
            className="relative select-none"
            style={{ WebkitTouchCallout: "none" }}
            onContextMenu={(e) => {
              e.preventDefault();
            }}
          >
            {message.mediaUrl ? (
              <div className="rounded-xl overflow-hidden">
                <ImageMessage
                  mediaUrl={message.mediaUrl}
                  timestamp={message.timestamp}
                  lazyLoad={false}
                />
              </div>
            ) : (
              <div className="inline-block p-3 bg-muted/30 rounded-xl text-sm text-muted-foreground border border-dashed border-border/50">
                <span className="animate-pulse">📷 图片传输中...</span>
              </div>
            )}
          </div>
        ) : (
          <div
            className={`relative px-2.5 py-1.5 shadow-sm text-sm leading-relaxed break-all whitespace-pre-wrap select-none
              ${isOwn
                ? "bg-gradient-to-br from-primary to-primary/90 text-primary-foreground rounded-2xl rounded-br-sm"
                : "bg-secondary dark:bg-muted/30 text-secondary-foreground dark:text-foreground rounded-2xl rounded-bl-sm hover:bg-secondary/80 transition-colors"
              }`}
            style={{ WebkitTouchCallout: "none" }}
            onContextMenu={(e) => {
              e.preventDefault();
            }}
          >
            {message.content}
          </div>
        )}

        {/* Timestamp & Status */}
        <div
          className={`text-xs mt-0.5 flex items-center gap-1.5 opacity-60 font-medium transition-opacity group-hover:opacity-90 py-1 ${isOwn ? "justify-end" : "justify-start"
            }`}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          onPointerMove={handlePointerMove}
        >
          <div
            className={`text-xs mt-1 flex items-center gap-1.5 opacity-60 font-medium transition-opacity group-hover:opacity-90 ${isOwn ? "justify-end" : "justify-start"
              }`}
          >
            {/* Delete button (Left of time for Own messages) */}
            {isOwn && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(message.id);
                }}
                className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-destructive transition-all"
                title="删除"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            )}

            <span>{formatTime(message.timestamp)}</span>

            {isOwn && (
              <span className={`flex items-center ${message.status === "failed" ? "text-destructive" : "text-primary/70"}`}>
                {message.status === "pending" && <span className="text-xs">···</span>}
                {message.status === "sent" && <Check className="h-3 w-3" />}
                {message.status === "delivered" && <CheckCheck className="h-3 w-3" />}
                {message.status === "read" && <CheckCheck className="h-3 w-3 text-blue-500 dark:text-blue-400" />}
                {message.status === "failed" && <span className="text-xs font-bold">!</span>}
              </span>
            )}

            {/* Delete button (Right of time for Received messages) */}
            {!isOwn && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(message.id);
                }}
                className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-destructive transition-all"
                title="删除"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export function VirtualMessageList({
  messages,
  selectedContactNpub,
  firstUnreadMessageId,
  initialScrollToMessageId,
  scrollToMessageId,
  scrollToMessageNonce,
  onFirstUnreadVisibilityChange,
}: VirtualMessageListProps) {
  const loadMoreMessages = useMessageStore(s => s.loadMoreMessages);
  const hasMoreMessages = useMessageStore(s => s.hasMoreMessages);
  const isLoading = useMessageStore(s => s.isLoading);
  const deleteMessage = useMessageStore(s => s.deleteMessage);
  const npub = useAuthStore(s => s.npub);
  const isMobile = useUIStore(s => s.isMobile);
  const scrollRef = useRef<HTMLDivElement>(null);
  // const [isAtBottom, setIsAtBottom] = useState(true);
  const [isActionDialogOpen, setIsActionDialogOpen] = useState(false);
  const [actionMessage, setActionMessage] = useState<Message | null>(null);

  const hasDoneInitialScrollRef = useRef(false);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFirstUnreadVisibleRef = useRef<boolean | null>(null);

  const scrollToMessage = useCallback((messageId: string) => {
    requestAnimationFrame(() => {
      const container = scrollRef.current;
      if (!container) return;
      const target = container.querySelector(`[data-message-id="${messageId}"]`) as HTMLElement | null;
      if (!target) return;
      target.scrollIntoView({ block: "center" });
      const flashClasses = [
        "ring-2",
        "ring-primary/40",
        "ring-offset-2",
        "ring-offset-background",
        "rounded-xl",
      ];
      flashClasses.forEach((c) => target.classList.add(c));
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
      flashTimerRef.current = setTimeout(() => {
        flashClasses.forEach((c) => target.classList.remove(c));
      }, 700);
    });
  }, []);

  useEffect(() => {
    return () => {
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    };
  }, []);

  const computeIsMessageVisible = useCallback((messageId?: string | null) => {
    if (!messageId) return false;
    const container = scrollRef.current;
    if (!container) return false;
    const target = container.querySelector(`[data-message-id="${messageId}"]`) as HTMLElement | null;
    if (!target) return false;
    const containerRect = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    return targetRect.bottom > containerRect.top && targetRect.top < containerRect.bottom;
  }, []);

  const notifyFirstUnreadVisibilityIfChanged = useCallback(() => {
    if (!onFirstUnreadVisibilityChange) return;
    const isVisible = computeIsMessageVisible(firstUnreadMessageId);
    if (lastFirstUnreadVisibleRef.current === isVisible) return;
    lastFirstUnreadVisibleRef.current = isVisible;
    onFirstUnreadVisibilityChange(isVisible);
  }, [computeIsMessageVisible, firstUnreadMessageId, onFirstUnreadVisibilityChange]);


  // Handle auto-scroll to bottom
  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      if (!scrollRef.current) return;
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    });
  }, []);

  const lastMessageIdRef = useRef<string | null>(null);
  const initialTargetId = useMemo(() => {
    if (initialScrollToMessageId) return initialScrollToMessageId;
    const firstUnread = messages.find(m => m.sender !== npub && m.status !== "read");
    return firstUnread?.id ?? null;
  }, [initialScrollToMessageId, messages, npub]);

  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    const lastMessageId = lastMessage?.id;
    
    // Only scroll to bottom if the LAST message has changed (new message received/sent)
    // or if it's the first load (lastMessageIdRef.current is null)
    if (lastMessageId !== lastMessageIdRef.current) {
      if (initialTargetId && !hasDoneInitialScrollRef.current) {
        scrollToMessage(initialTargetId);
        hasDoneInitialScrollRef.current = true;
      } else {
        scrollToBottom();
      }
      lastMessageIdRef.current = lastMessageId || null;
    }
  }, [messages, initialTargetId, scrollToBottom, scrollToMessage]);

  useEffect(() => {
    if (!scrollToMessageId || !scrollToMessageNonce) return;
    scrollToMessage(scrollToMessageId);
  }, [scrollToMessageId, scrollToMessageNonce, scrollToMessage]);

  useEffect(() => {
    notifyFirstUnreadVisibilityIfChanged();
  }, [messages.length, firstUnreadMessageId, notifyFirstUnreadVisibilityIfChanged]);

  // Handle scroll events for "load more" and "is at bottom" tracking
  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;

    // Check if at bottom
    // const atBottom = scrollHeight - scrollTop - clientHeight < 50;
    // setIsAtBottom(atBottom);

    // Load more when at top
    if (scrollTop > scrollHeight - clientHeight - 50 && hasMoreMessages(selectedContactNpub) && !isLoading) {
      const oldHeight = scrollHeight;
      const oldScrollTop = scrollTop;
      loadMoreMessages(selectedContactNpub).then(() => {
        // Adjust scroll position after loading to avoid jumping
        if (scrollRef.current) {
          const newHeight = scrollRef.current.scrollHeight;
          scrollRef.current.scrollTop = oldScrollTop + (newHeight - oldHeight);
        }
        notifyFirstUnreadVisibilityIfChanged();
      });
    }
    notifyFirstUnreadVisibilityIfChanged();
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getDateKey = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  };

  const getDateLabel = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfYesterday = new Date(startOfToday);
    startOfYesterday.setDate(startOfToday.getDate() - 1);
    const startOfDayBefore = new Date(startOfToday);
    startOfDayBefore.setDate(startOfToday.getDate() - 2);
    if (date >= startOfToday) {
      return "今天";
    }
    if (date >= startOfYesterday) {
      return "昨天";
    }
    if (date >= startOfDayBefore) {
      return "前天";
    }
    return date.toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  };

  const openActions = (message: Message) => {
    setActionMessage(message);
    setIsActionDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!actionMessage) return;
    try {
      await deleteMessage(selectedContactNpub, actionMessage.id);
      toast.success("已删除");
    } finally {
      setIsActionDialogOpen(false);
    }
  };

  if (messages.length === 0 && !isLoading) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-8 bg-background/50 backdrop-blur-sm text-center">
        <div className="space-y-2">
          <p className="text-xs opacity-60">暂无消息，打个招呼吧 ～</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto px-4 py-6 transition-colors flex flex-col-reverse"
      style={{ height: '100%' }}
    >
      {/* Message List - wrapped in normal flex-col, parent is flex-col-reverse for auto-bottom */}
      <div className="flex flex-col">
        {/* Loading indicator */}
        {isLoading && (
          <div className="flex justify-center mb-6">
            <div className="flex items-center gap-2 bg-muted/50 px-3 py-1.5 rounded-full border border-border/50 animate-in fade-in zoom-in duration-300">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
              <span className="text-xs text-muted-foreground font-medium">正在拉取历史记录...</span>
            </div>
          </div>
        )}

        {messages.map((message, index) => {
          const previousMessage = messages[index - 1];
          const showDateSeparator = !previousMessage || getDateKey(previousMessage.timestamp) !== getDateKey(message.timestamp);
          return (
          <div key={message.id}>
            {showDateSeparator && (
              <div className="flex items-center justify-center my-3">
                <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-muted text-muted-foreground border border-border/60">
                  {getDateLabel(message.timestamp)}
                </span>
              </div>
            )}
            {firstUnreadMessageId === message.id && (
              <div className="flex items-center justify-center my-3">
                <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-muted text-muted-foreground border border-border/60">
                  未读消息
                </span>
              </div>
            )}
            <MessageRow
              message={message}
              isOwn={message.sender === npub}
              isMobile={isMobile}
              formatTime={formatTime}
              onDelete={(id) => deleteMessage(selectedContactNpub, id)}
              onOpenActions={openActions}
              contact={useContactStore.getState().contacts.find(c => c.npub === selectedContactNpub)}
              myProfile={useAuthStore.getState().profile}
            />
          </div>
        )})}
      </div>

      <AlertDialog open={isMobile && isActionDialogOpen} onOpenChange={setIsActionDialogOpen}>
        <AlertDialogContent className="rounded-2xl w-[85vw] max-w-xs border-0 shadow-xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-center">删除消息</AlertDialogTitle>
            <AlertDialogDescription className="text-center">
              确定要删除这条消息吗？此操作无法撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="w-full sm:space-x-0 gap-3 mt-4 flex flex-col">
            <AlertDialogAction 
              onClick={handleDelete} 
              className="w-full bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-xl h-11"
            >
              删除
            </AlertDialogAction>
            <AlertDialogCancel className="w-full rounded-xl h-11 border-0 bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground mt-0">
              取消
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
