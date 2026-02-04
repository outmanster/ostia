import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Lock, ArrowRight, Eye, EyeOff } from "lucide-react";
import { loadDecryptedPrivateKey, saveEncryptedPrivateKey } from "@/utils/nostr";
import { useAuthStore } from "@/store/authStore";

interface ChangePasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ChangePasswordDialog({ open, onOpenChange }: ChangePasswordDialogProps) {
  const { nsec } = useAuthStore();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!currentPassword.trim()) {
      setError("请输入当前密码");
      return;
    }

    if (!newPassword.trim()) {
      setError("请输入新密码");
      return;
    }

    if (newPassword.length < 4) {
      setError("新密码至少需要4个字符");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("两次输入的新密码不匹配");
      return;
    }

    if (!nsec) {
      setError("无法获取私钥");
      return;
    }

    setIsLoading(true);

    try {
      // 首先验证当前密码是否正确
      await loadDecryptedPrivateKey(currentPassword.trim());

      // 如果验证成功，保存新密码
      await saveEncryptedPrivateKey(nsec, newPassword.trim());

      // 清空表单
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");

      onOpenChange(false);
      // 这里可以添加成功提示
    } catch (error) {
      if (String(error).includes("密码不正确") || String(error).includes("Incorrect")) {
        setError("当前密码不正确");
      } else {
        setError(String(error));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setError(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Lock className="h-4 w-4" />
            更改密码
          </DialogTitle>
          <DialogDescription className="text-xs">
            更改用于解锁应用的密码。
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleChangePassword} className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium">当前密码</label>
            <div className="relative group">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                id="currentPassword"
                type={showPasswords ? "text" : "password"}
                placeholder="输入当前密码"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="pl-9 pr-10 text-xs tracking-widest bg-background border-border h-9 rounded-sm focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary transition-all"
                autoComplete="current-password"
                autoFocus
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 hover:bg-transparent text-muted-foreground hover:text-foreground"
                onClick={() => setShowPasswords(!showPasswords)}
              >
                {showPasswords ? (
                  <EyeOff className="h-3.5 w-3.5" />
                ) : (
                  <Eye className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium">新密码</label>
            <div className="relative group">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                id="newPassword"
                type={showPasswords ? "text" : "password"}
                placeholder="输入新密码 (至少4个字符)"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="pl-9 text-xs tracking-widest bg-background border-border h-9 rounded-sm focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary transition-all"
                autoComplete="new-password"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium">确认新密码</label>
            <div className="relative group">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                id="confirmPassword"
                type={showPasswords ? "text" : "password"}
                placeholder="再次输入新密码"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="pl-9 text-xs tracking-widest bg-background border-border h-9 rounded-sm focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary transition-all"
                autoComplete="new-password"
              />
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-xs text-destructive font-mono bg-destructive/5 border border-destructive/20 p-2">
              <ArrowRight className="h-3 w-3" />
              {error}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <Button
              type="submit"
              className="flex-1 h-9 rounded-sm text-xs font-mono uppercase tracking-widest bg-primary hover:bg-primary/90 text-primary-foreground shadow-none border border-transparent hover:border-foreground/10"
              disabled={isLoading}
            >
              {isLoading ? "更改中..." : "更改密码"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              className="flex-1 h-9 rounded-sm font-mono text-xs uppercase tracking-wide border-border hover:bg-muted"
              disabled={isLoading}
            >
              取消
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
