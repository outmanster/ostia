import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Lock, ArrowRight, Shield, Eye, EyeOff } from "lucide-react";
import { saveEncryptedPrivateKey } from "@/utils/nostr";
import { useAuthStore } from "@/store/authStore";
import { useUIStore } from "@/store/uiStore";

interface SetMasterPasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (passwordSet: boolean) => void; // passwordSet: true表示设置了密码，false表示跳过
}

export function SetPasswordDialog({ open, onOpenChange, onSuccess }: SetMasterPasswordDialogProps) {
  const { nsec } = useAuthStore();
  const [masterPassword, setMasterPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { isMobile } = useUIStore(); // Get isMobile from store

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!masterPassword.trim()) {
      setError("请输入密码");
      return;
    }

    if (masterPassword.length < 4) {
      setError("密码至少需要4个字符");
      return;
    }

    if (masterPassword !== confirmPassword) {
      setError("两次输入的密码不匹配");
      return;
    }

    if (!nsec) {
      setError("没有找到私钥");
      return;
    }

    setIsLoading(true);

    try {
      await saveEncryptedPrivateKey(nsec, masterPassword.trim());
      onSuccess(true); // 密码设置成功
      onOpenChange(false);
    } catch (error) {
      setError(String(error));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSkip = () => {
    onSuccess(false); // 跳过设置密码
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader className={isMobile ? "text-left" : ""}>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Shield className="h-4 w-4" />
            设置密码
          </DialogTitle>
          <DialogDescription className="text-xs">
            设置一个简短的密码来保护您的私钥。以后只需要输入密码就能快速登录。
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSetPassword} className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium">密码</label>
            <div className="relative group">
              <div className="absolute inset-0 bg-primary/5 opacity-0 group-focus-within:opacity-100 transition-opacity pointer-events-none" />
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                id="masterPassword"
                type={showPassword ? "text" : "password"}
                placeholder="输入密码 (至少4个字符)"
                value={masterPassword}
                onChange={(e) => setMasterPassword(e.target.value)}
                className="pl-9 pr-10 text-xs tracking-widest bg-background border-border h-9 rounded-sm focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary transition-all"
                autoComplete="new-password"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 hover:bg-transparent text-muted-foreground hover:text-foreground"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? (
                  <EyeOff className="h-3.5 w-3.5" />
                ) : (
                  <Eye className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium">确认密码</label>
            <div className="relative group">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                id="confirmPassword"
                type="password"
                placeholder="再次输入密码"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="pl-9 text-xs tracking-widest bg-background border-border h-9 rounded-sm focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary transition-all"
                autoComplete="new-password"
              />
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-[10px] text-destructive font-mono bg-destructive/5 border border-destructive/20 p-2">
              <ArrowRight className="h-3 w-3" />
              {error}
            </div>
          )}

          <div className="bg-muted/50 p-2.5 rounded text-[10px] text-muted-foreground">
            <p className="font-medium mb-1">💡 提示：</p>
            <ul className="space-y-0.5 text-[10px]">
              <li>• 建议使用4-8位数字或简单短语</li>
              <li>• 不要使用与私钥相同的密码</li>
            </ul>
          </div>

          <div className="flex gap-2">
            <Button
              type="submit"
              className="flex-1 h-9 rounded-sm text-xs font-mono uppercase tracking-widest bg-primary hover:bg-primary/90 text-primary-foreground shadow-none border border-transparent hover:border-foreground/10"
              disabled={isLoading}
            >
              {isLoading ? "正在设置..." : "设置密码"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleSkip}
              className="flex-1 h-9 rounded-sm font-mono text-xs uppercase tracking-wide border-border hover:bg-muted"
              disabled={isLoading}
            >
              跳过
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}