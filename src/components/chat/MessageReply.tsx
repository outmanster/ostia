import { useState } from "react";
import { Reply, X, Send, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuthStore } from "@/store/authStore";
import type { Message } from "@/types";
import { toast } from "sonner";

interface MessageReplyProps {
  message: Message;
  onReply: (replyContent: string, originalMessage: Message) => Promise<void>;
  onCancel: () => void;
}

export function MessageReply({ message, onReply, onCancel }: MessageReplyProps) {
  const [replyContent, setReplyContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { npub } = useAuthStore();

  const isOwn = message.sender === npub;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyContent.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await onReply(replyContent.trim(), message);
      setReplyContent("");
      onCancel();
    } catch (error) {
      toast.error("发送回复失败");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
    if (e.key === "Escape") {
      onCancel();
    }
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getPreviewText = (text: string, maxLength = 50) => {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + "...";
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/20 p-4">
      <div className="w-full max-w-2xl bg-background rounded-lg shadow-xl border animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <Reply className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">回复消息</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Original message preview */}
        <div className="p-4 bg-muted/50 border-b">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium text-muted-foreground">
              {isOwn ? "你" : message.sender.slice(0, 12) + "..."}
            </span>
            <span className="text-xs text-muted-foreground">
              {formatTime(message.timestamp)}
            </span>
          </div>
          <div className="text-sm text-foreground/90 break-words">
            {message.messageType === "image" ? (
              <span className="text-muted-foreground">[图片消息]</span>
            ) : (
              getPreviewText(message.content)
            )}
          </div>
        </div>

        {/* Reply input */}
        <form onSubmit={handleSubmit} className="p-4">
          <div className="flex items-center gap-2">
            <Input
              value={replyContent}
              onChange={(e) => setReplyContent(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入回复内容..."
              disabled={isSubmitting}
              className="flex-1"
              autoFocus
            />
            <Button
              type="submit"
              size="icon"
              disabled={!replyContent.trim() || isSubmitting}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex justify-between mt-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onCancel}
              disabled={isSubmitting}
            >
              取消
            </Button>
            <span className="text-xs text-muted-foreground self-center">
              按 Enter 发送，Esc 取消
            </span>
          </div>
        </form>
      </div>
    </div>
  );
}

interface MessageReplyIndicatorProps {
  repliedToId?: string;
  allMessages: Message[];
  onJumpToMessage: (messageId: string) => void;
}

export function MessageReplyIndicator({
  repliedToId,
  allMessages,
  onJumpToMessage,
}: MessageReplyIndicatorProps) {
  if (!repliedToId) return null;

  const originalMessage = allMessages.find((m) => m.id === repliedToId);
  if (!originalMessage) return null;

  const isOwn = originalMessage.sender === useAuthStore.getState().npub;

  return (
    <div
      className="flex items-center gap-2 mb-2 p-2 rounded bg-muted/50 cursor-pointer hover:bg-muted transition-colors"
      onClick={() => onJumpToMessage(repliedToId)}
    >
      <Reply className="h-3 w-3 text-muted-foreground" />
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-muted-foreground">
          {isOwn ? "回复你" : `回复 ${originalMessage.sender.slice(0, 12)}...`}
        </div>
        <div className="text-xs text-foreground/70 truncate">
          {originalMessage.messageType === "image" ? "[图片]" : originalMessage.content}
        </div>
      </div>
      <ChevronDown className="h-3 w-3 text-muted-foreground" />
    </div>
  );
}
