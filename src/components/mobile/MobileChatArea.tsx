import React, { useState, useRef, useEffect, useCallback } from "react";
import { useShallow } from "zustand/react/shallow";
import { useMessageStore } from "@/store/messageStore";
import { useAuthStore } from "@/store/authStore";
import { useContactStore } from "@/store/contactStore";
import { useTypingStore } from "@/store/typingStore";
import { usePresenceStore } from "@/store/presenceStore";
import { useKeyboardVisible } from "@/hooks/useMobileDetection";
import { Send, Image, ArrowLeft, MoreVertical, MessageSquare, Copy, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { ImageMessage } from "@/components/chat/ImageMessage";
import { open } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";

interface MobileChatAreaProps {
  onBack?: () => void;
}

export function MobileChatArea({ onBack }: MobileChatAreaProps) {
  const { isKeyboardVisible, keyboardHeight } = useKeyboardVisible();
  const { npub } = useAuthStore();
  const { selectedContact } = useContactStore();
  const {
    messages,
    sendMessage,
    sendImage,
    isLoading,
    loadMoreMessages,
    hasMore,
  } = useMessageStore();

  const presence = usePresenceStore(useShallow(s => selectedContact ? s.getPresence(selectedContact.npub) : undefined));
  const isTyping = useTypingStore(s => selectedContact ? s.isTyping(selectedContact.npub) : false);

  const [inputValue, setInputValue] = useState("");
  const [isSending, setIsSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Filter messages for current contact
  const contactMessages = selectedContact
    ? Array.from(messages.get(selectedContact.npub) || []).filter((m) =>
      m.sender === selectedContact.npub || m.receiver === selectedContact.npub
    )
    : [];

  // Track if we should auto-scroll (user at bottom)
  const shouldAutoScroll = useRef(true);
  // Ref for the bottom anchor element
  const bottomRef = useRef<HTMLDivElement>(null);

  // Handle auto-scroll to bottom using scrollIntoView on anchor element
  const scrollToBottom = useCallback(() => {
    // Use requestAnimationFrame to ensure DOM has been updated
    requestAnimationFrame(() => {
      if (bottomRef.current) {
        bottomRef.current.scrollIntoView({ behavior: 'instant', block: 'end' });
      }
    });
  }, []);

  // Scroll to bottom when entering chat or contact changes
  useEffect(() => {
    shouldAutoScroll.current = true;
    scrollToBottom();

    // Multiple delayed scrolls to handle layout changes from image loading
    const timers = [100, 300, 500, 1000].map(delay =>
      setTimeout(scrollToBottom, delay)
    );

    return () => timers.forEach(t => clearTimeout(t));
  }, [selectedContact?.npub, scrollToBottom]);

  // Auto-scroll when new messages arrive
  useEffect(() => {
    if (shouldAutoScroll.current) {
      scrollToBottom();
      // Extra scroll after potential image load
      const timer = setTimeout(scrollToBottom, 300);
      return () => clearTimeout(timer);
    }
  }, [contactMessages.length, scrollToBottom]);

  // Use ResizeObserver to detect content height changes (e.g., image loading)
  useEffect(() => {
    if (!scrollRef.current) return;

    const scrollEl = scrollRef.current;
    let lastHeight = scrollEl.scrollHeight;

    const observer = new ResizeObserver(() => {
      const newHeight = scrollEl.scrollHeight;
      // If content height changed and we should auto-scroll, scroll to bottom
      if (newHeight !== lastHeight && shouldAutoScroll.current) {
        console.log('[MobileChatArea] ResizeObserver triggered, scrolling to bottom');
        scrollToBottom();
      }
      lastHeight = newHeight;
    });

    // Observe the scroll container itself
    observer.observe(scrollEl);

    // Also observe children if they exist
    scrollEl.querySelectorAll('img').forEach(img => {
      img.addEventListener('load', () => {
        console.log('[MobileChatArea] Image loaded, scrolling to bottom');
        scrollToBottom();
      });
    });

    return () => observer.disconnect();
  }, [scrollToBottom, selectedContact?.npub, contactMessages.length]);

  const handleSend = async () => {
    if (!inputValue.trim() || !selectedContact || isSending) return;

    setIsSending(true);
    try {
      await sendMessage(selectedContact.npub, inputValue.trim());
      setInputValue("");
    } catch (error) {
      toast.error("发送失败");
    } finally {
      setIsSending(false);
    }
  };

  const pickImage = async () => {
    try {
      const selected = await open({
        title: "选择图片",
        multiple: false,
        filters: [{
          name: "Images",
          extensions: ["png", "jpg", "jpeg", "webp", "gif"]
        }]
      });

      if (!selected) return null;

      const path = selected as string;
      const fileData = await readFile(path);
      const filename = path.split(/[\\/]/).pop() || "image.png";
      return { data: fileData, filename };
    } catch (error) {
      console.error("Pick image failed:", error);
      return null;
    }
  };

  const sendPickedImage = async (picker: () => Promise<{ data: Uint8Array; filename: string } | null>) => {
    if (!selectedContact || isSending) return;
    try {
      setIsSending(true);
      const picked = await picker();
      if (picked) {
        toast.info("正在发送图片...");
        await sendImage(selectedContact.npub, picked.data, picked.filename);
      }
    } catch (error) {
      console.error("Image selection error:", error);
      if (error !== "cancelled") {
        toast.error("选择图片失败");
      }
    } finally {
      setIsSending(false);
    }
  };

  const handleSendImage = () => {
    if (!selectedContact || isSending) return;
    sendPickedImage(() => pickImage());
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const [messageParam, setMessageParam] = useState<any | null>(null); // Message to act on
  const [isActionDialogOpen, setIsActionDialogOpen] = useState(false);
  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressStartRef = useRef<{ x: number, y: number } | null>(null);

  const handleCopy = () => {
    if (messageParam?.content) {
      navigator.clipboard.writeText(messageParam.content);
      toast.success("已复制");
    }
    setIsActionDialogOpen(false);
  };

  const handleDelete = () => {
    if (messageParam && selectedContact) {
      useMessageStore.getState().deleteMessage(selectedContact.npub, messageParam.id);
      toast.success("已删除");
    }
    setIsActionDialogOpen(false);
  };

  const handlePointerDown = (e: React.PointerEvent, msg: any) => {
    // Record start position to allow small movement (jitter)
    pressStartRef.current = { x: e.clientX, y: e.clientY };

    pressTimerRef.current = setTimeout(() => {
      setMessageParam(msg);
      setIsActionDialogOpen(true);
      // Vibrating feedback if available (Navigator.vibrate)
      if (navigator.vibrate) navigator.vibrate(50);
    }, 500);
  };

  const handlePointerUp = () => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (pressTimerRef.current && pressStartRef.current) {
      // If moved more than 10px, cancel long press
      const dx = Math.abs(e.clientX - pressStartRef.current.x);
      const dy = Math.abs(e.clientY - pressStartRef.current.y);
      if (dx > 10 || dy > 10) {
        clearTimeout(pressTimerRef.current);
        pressTimerRef.current = null;
      }
    }
  };


  const formatMessageTime = (timestamp: number) => {
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

  const renderMessage = (msg: any) => {
    const isOwn = msg.sender === npub;
    const isImage = msg.messageType === "image" || msg.mediaUrl;

    return (
      <div className={`flex mb-3 ${isOwn ? "justify-end" : "justify-start"}`}>
        {!isOwn && selectedContact && (
          <Avatar className="h-8 w-8 mr-2 self-end">
            <AvatarImage src={selectedContact.picture || ""} />
            <AvatarFallback>
              {(selectedContact.name || "U").slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        )}

        <div
          onPointerDown={(e) => handlePointerDown(e, msg)}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          onPointerMove={handlePointerMove}
          onContextMenu={(e) => {
            e.preventDefault(); // Block native menu to show ours
          }}

          className={`max-w-[75vw] px-3 py-2 rounded-lg transition-transform active:scale-95 touch-none ${isOwn
            ? "bg-primary text-primary-foreground rounded-br-none"
            : "bg-muted rounded-bl-none"
            }`}
        >
          {isImage ? (
            <ImageMessage
              mediaUrl={msg.mediaUrl || ""}
              timestamp={msg.timestamp}
              lazyLoad={true}
            />
          ) : (
            <p className="text-sm whitespace-pre-wrap break-words select-text">
              {/* select-text allows selection if user manages to trigger it without long press hijack, 
                      but onContextMenu prevents default, so selection might be tricky. 
                      However, we provide Copy button in menu. */}
              {msg.content}
            </p>
          )}
          <div
            className={`text-xs mt-1 opacity-70 ${isOwn ? "text-primary-foreground/80" : "text-muted-foreground"
              }`}
          >
            {formatMessageTime(msg.timestamp)}
          </div>
        </div>
      </div>
    );
  };

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const maxHeight = 120;
    el.style.height = "0px";
    const nextHeight = Math.min(el.scrollHeight, maxHeight);
    el.style.height = `${nextHeight}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [inputValue]);

  if (!selectedContact) {
    return (
      <div className="h-full flex flex-col items-start justify-center p-6 text-left">
        <div className="bg-muted rounded-full p-4 mb-4">
          <MessageSquare className="h-8 w-8 text-muted-foreground" />
        </div>
        <h2 className="text-lg font-semibold mb-2">选择一个联系人</h2>
        <p className="text-sm text-muted-foreground">
          从左侧菜单选择联系人开始聊天
        </p>
      </div>
    );
  }

  return (
    <div
      className="h-full flex flex-col bg-background"
      style={{
        paddingBottom: isKeyboardVisible ? keyboardHeight : 0,
        transition: "padding-bottom 0.2s ease",
      }}
    >
      {/* Chat Header */}
      <div className="flex items-center gap-3 p-3 border-b bg-card">
        <Button variant="ghost" size="icon" onClick={onBack} className="h-10 w-10 -ml-1">
          <ArrowLeft className="h-8 w-8" strokeWidth={3} />
        </Button>
        <Avatar className="h-9 w-9">
          <AvatarImage src={selectedContact.picture || ""} />
          <AvatarFallback>
            {(selectedContact.name || "U").slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate flex items-center gap-2">
            <span>{selectedContact.name || "Unknown"}</span>
            {presence?.online && (
              <>
                <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
                {!isTyping && <span className="text-xs text-emerald-400">在线</span>}
              </>
            )}
            {isTyping && <span className="text-xs text-primary">正在输入…</span>}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {selectedContact.npub.slice(0, 8)}...{selectedContact.npub.slice(-4)}
          </p>
        </div>
        <Button variant="ghost" size="icon">
          <MoreVertical className="h-5 w-5" />
        </Button>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-hidden">
        {contactMessages.length === 0 ? (
          <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
            {isLoading ? "加载中..." : "还没有消息，开始聊天吧！"}
          </div>
        ) : (
          <div
            className="h-full overflow-y-auto"
            ref={scrollRef}
          >
            {hasMore && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full my-2"
                onClick={() => loadMoreMessages(selectedContact.npub)}
              >
                加载更多
              </Button>
            )}
            <div className="p-3">
            {contactMessages.map((msg, index) => {
              const previousMessage = contactMessages[index - 1];
              const showDateSeparator = !previousMessage || getDateKey(previousMessage.timestamp) !== getDateKey(msg.timestamp);
              return (
                <div key={msg.id}>
                  {showDateSeparator && (
                    <div className="flex items-center justify-center my-3">
                      <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-muted text-muted-foreground border border-border/60">
                        {getDateLabel(msg.timestamp)}
                      </span>
                    </div>
                  )}
                  {renderMessage(msg)}
                </div>
              );
            })}
              {/* Bottom anchor for scroll positioning */}
              <div ref={bottomRef} />
            </div>
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="border-t bg-card p-2">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleSendImage}
            disabled={isSending}
          >
            <Image className="h-5 w-5" />
          </Button>
          <Textarea
            ref={textareaRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入消息..."
            className="flex-1 min-h-[40px] resize-none border-none shadow-none focus-visible:ring-0 bg-transparent"
            rows={1}
            disabled={isSending}
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!inputValue.trim() || isSending}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>


      <Dialog open={isActionDialogOpen} onOpenChange={setIsActionDialogOpen}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>消息选项</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <Button variant="outline" onClick={handleCopy} className="justify-start gap-3">
              <Copy className="h-4 w-4" />
              复制文本
            </Button>
            <Button variant="destructive" onClick={handleDelete} className="justify-start gap-3">
              <Trash2 className="h-4 w-4" />
              删除消息
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </div >
  );
}
