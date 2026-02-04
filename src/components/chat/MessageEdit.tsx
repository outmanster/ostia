import { useState, useEffect } from "react";
import { Edit3, X, Save, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { Message } from "@/types";
import { toast } from "sonner";

interface MessageEditProps {
  message: Message;
  onEdit: (messageId: string, newContent: string) => Promise<void>;
  onCancel: () => void;
  onDelete: (messageId: string) => Promise<void>;
}

export function MessageEdit({ message, onEdit, onCancel, onDelete }: MessageEditProps) {
  const [editContent, setEditContent] = useState(message.content);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    setEditContent(message.content);
  }, [message]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editContent.trim() || isSubmitting || editContent === message.content) return;

    setIsSubmitting(true);
    try {
      await onEdit(message.id, editContent.trim());
      toast.success("消息已编辑");
      onCancel();
    } catch (error) {
      toast.error("编辑失败");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (showDeleteConfirm) {
      setIsSubmitting(true);
      try {
        await onDelete(message.id);
        toast.success("消息已删除");
        onCancel();
      } catch (error) {
        toast.error("删除失败");
      } finally {
        setIsSubmitting(false);
        setShowDeleteConfirm(false);
      }
    } else {
      setShowDeleteConfirm(true);
      toast.warning("再次点击确认删除", {
        description: "此操作无法撤销",
      });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSave(e);
    }
    if (e.key === "Escape") {
      onCancel();
    }
  };

  const hasChanges = editContent.trim() !== message.content.trim();
  const isDisabled = isSubmitting || !editContent.trim() || !hasChanges;

  if (showDeleteConfirm) {
    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/20 p-4">
        <div className="w-full max-w-md bg-background rounded-lg shadow-xl border animate-in fade-in zoom-in-95 duration-200">
          <div className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <XCircle className="h-5 w-5 text-destructive" />
              <span className="font-semibold">确认删除消息</span>
            </div>
            <p className="text-sm text-foreground/80 mb-6">
              确定要删除这条消息吗？此操作无法撤销。
            </p>
            <div className="flex gap-2 justify-end">
              <Button
                variant="ghost"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isSubmitting}
              >
                取消
              </Button>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={isSubmitting}
              >
                {isSubmitting ? "删除中..." : "确认删除"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/20 p-2 sm:items-center">
      <div className="w-full max-w-lg bg-background rounded-lg shadow-xl border animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-1.5 border-b">
          <div className="flex items-center gap-2">
            <Edit3 className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-medium text-xs">编辑消息</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onCancel}
            disabled={isSubmitting}
            className="h-6 w-6"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Edit form */}
        <form onSubmit={handleSave} className="p-3 space-y-2">
          <Textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="编辑消息..."
            disabled={isSubmitting}
            className="min-h-[60px] resize-y text-xs"
            autoFocus
            onFocus={(e) => {
              const val = e.target.value;
              e.target.value = "";
              e.target.value = val;
            }}
          />

          {/* Info text */}
          <div className="text-xs text-muted-foreground flex justify-end">
            Ctrl+Enter 保存，Esc 取消
          </div>

          {/* Buttons */}
          <div className="flex justify-between gap-2 pt-1">
            <div className="flex gap-2">
              <Button
                type="button"
                variant="destructive"
                onClick={handleDelete}
                disabled={isSubmitting}
                size="sm"
                className="text-xs"
              >
                删除
              </Button>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={onCancel}
                disabled={isSubmitting}
                size="sm"
                className="text-xs"
              >
                取消
              </Button>
              <Button
                type="submit"
                disabled={isDisabled}
                size="sm"
                className="text-xs"
              >
                <Save className="h-3.5 w-3.5 mr-1.5" />
                保存
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

interface EditIndicatorProps {
  editedAt?: number;
}

export function EditIndicator({ editedAt }: EditIndicatorProps) {
  if (!editedAt) return null;

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <span className="text-xs text-muted-foreground ml-2">
      (已编辑 {formatTime(editedAt)})
    </span>
  );
}
