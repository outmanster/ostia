import { useState } from "react";
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
import { Trash2, ArrowRight } from "lucide-react";
import { deleteMasterPassword } from "@/utils/nostr";

interface DeletePasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function DeletePasswordDialog({ open, onOpenChange, onSuccess }: DeletePasswordDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDeletePassword = async () => {
    setError(null);
    setIsLoading(true);

    try {
      await deleteMasterPassword();
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      setError(String(error));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-[360px] w-[calc(100%-32px)] rounded-xl p-4 gap-4">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-destructive text-sm">
            <Trash2 className="h-4 w-4" />
            删除密码
          </AlertDialogTitle>
          <AlertDialogDescription className="text-xs">
            删除密码保护后，下次启动应用时需要重新输入完整私钥。
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3">
          {error && (
            <div className="flex items-center gap-2 text-xs text-destructive font-mono bg-destructive/5 border border-destructive/20 p-2 rounded-lg">
              <ArrowRight className="h-3 w-3" />
              {error}
            </div>
          )}

          <div className="bg-amber-50 border border-amber-200 p-2.5 rounded-lg text-xs text-amber-800">
            <p className="font-semibold mb-1">注意：</p>
            <ul className="space-y-0.5 text-xs">
              <li>• 删除密码后，下次启动应用时需要重新输入完整私钥</li>
              <li>• 此操作不可撤销</li>
            </ul>
          </div>

          <AlertDialogFooter className="flex gap-2 sm:gap-2">
            <AlertDialogCancel
              disabled={isLoading}
              className="flex-1 h-9 rounded-lg font-mono text-xs uppercase tracking-wide border-border hover:bg-muted mt-0"
            >
              取消
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDeletePassword();
              }}
              className="flex-1 h-9 rounded-lg text-xs font-mono uppercase tracking-widest bg-destructive hover:bg-destructive/90 text-destructive-foreground shadow-none border border-transparent hover:border-foreground/10"
              disabled={isLoading}
            >
              {isLoading ? "正在删除..." : "确认删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
