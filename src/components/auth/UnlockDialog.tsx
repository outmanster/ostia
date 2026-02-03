import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Lock, ArrowRight } from "lucide-react";
import { getUnlockLockoutState, loadDecryptedPrivateKey, recordUnlockFailure, resetUnlockLockout, type UnlockLockoutState } from "@/utils/nostr";
import { useAuthStore } from "@/store/authStore";
import { useUIStore } from "@/store/uiStore";

interface UnlockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSwitchToLogin: () => void;
}

export function UnlockDialog({ open, onOpenChange, onSwitchToLogin }: UnlockDialogProps) {
  const { login } = useAuthStore();
  const [masterPassword, setMasterPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { isMobile } = useUIStore();
  const [lockoutState, setLockoutState] = useState<UnlockLockoutState | null>(null);
  const isLocked = lockoutState?.locked ?? false;

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    if (isLocked) {
      setError("今日密码尝试已达上限，请使用私钥登录");
      setIsLoading(false);
      return;
    }

    if (!masterPassword.trim()) {
      setError("请输入密码");
      setIsLoading(false);
      return;
    }

    try {
      const nsec = await loadDecryptedPrivateKey(masterPassword.trim());
      await login(nsec);
      
      // Best effort to reset lockout state, don't block login if this fails
      try {
        await resetUnlockLockout();
        const refreshed = await getUnlockLockoutState();
        setLockoutState(refreshed);
      } catch (e) {
        console.error("Failed to reset lockout state:", e);
      }
      
      onOpenChange(false);
    } catch (error) {
      try {
        const updated = await recordUnlockFailure();
        setLockoutState(updated);
        if (updated.locked) {
          setError("今日密码尝试已达上限，请使用私钥登录");
        } else {
          setError(String(error));
        }
      } catch {
        setLockoutState({ date: "", attempts: 0, locked: true });
        setError("今日密码尝试已达上限，请使用私钥登录");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMasterPassword(e.target.value);
    setError(null);
  };

  useEffect(() => {
    if (!open) return;
    let active = true;
    const loadState = async () => {
      try {
        const nextState = await getUnlockLockoutState();
        if (!active) return;
        setLockoutState(nextState);
        if (nextState.locked) {
          setError("今日密码尝试已达上限，请使用私钥登录");
        }
      } catch {
        if (!active) return;
        // Don't reset automatically on error, as it creates a security vulnerability
        // where corrupted/unreadable files reset the lockout counter.
        // Instead, fail secure -> Locked.
        setLockoutState({ date: "", attempts: 0, locked: true });
        setError("无法读取解锁状态，系统已锁定");
      }
    };
    loadState();
    return () => {
      active = false;
    };
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader className={isMobile ? "text-left" : ""}>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Lock className="h-4 w-4" />
            解锁账户
          </DialogTitle>
          <DialogDescription className="text-xs">
            输入您设置的密码来解锁账户
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleUnlock} className="space-y-3">
          <div className="space-y-1">
            <div className="relative group">
              <div className="absolute inset-0 bg-primary/5 opacity-0 group-focus-within:opacity-100 transition-opacity pointer-events-none" />
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                id="masterPassword"
                type="password"
                placeholder="输入密码"
                value={masterPassword}
                onChange={handleInputChange}
                className="pl-9 pr-4 text-xs tracking-widest bg-background border-border h-9 rounded-sm focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary transition-all"
                autoComplete="current-password"
                disabled={isLocked}
              />
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-[10px] text-destructive font-mono bg-destructive/5 border border-destructive/20 p-2">
              <ArrowRight className="h-3 w-3" />
              {error}
            </div>
          )}

          <Button
            type="submit"
            className="w-full h-9 rounded-sm text-xs font-mono uppercase tracking-widest bg-primary hover:bg-primary/90 text-primary-foreground shadow-none border border-transparent hover:border-foreground/10"
            disabled={isLoading || isLocked}
          >
            {isLoading ? "正在解锁..." : "解锁账户"}
          </Button>

          <div className="relative py-1.5">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-dashed border-border" />
            </div>
            <div className="relative flex justify-center text-[10px] uppercase font-mono">
              <span className="bg-card px-2 text-muted-foreground">或</span>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full h-9 rounded-sm font-mono text-xs uppercase tracking-wide border-border hover:bg-muted"
            onClick={() => {
              onOpenChange(false);
              onSwitchToLogin();
            }}
          >
            使用私钥登录
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
