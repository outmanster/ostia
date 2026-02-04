import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/store/authStore";
import { Copy, Check, AlertCircle, Sparkles } from "lucide-react";
import { toast } from "sonner";

interface RegisterProps {
  onSwitchToLogin: () => void;
}

export function Register({ onSwitchToLogin }: RegisterProps) {
  const { register, confirmRegistration, cancelRegistration, isLoading, error, pendingAccount } =
    useAuthStore();
  const [copied, setCopied] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const handleGenerate = async () => {
    try {
      await register();
    } catch (error: any) {
      console.error("Failed to generate account:", error);
      toast.error("生成失败: " + error.message);
    }
  };

  const handleCopy = async () => {
    if (pendingAccount) {
      await navigator.clipboard.writeText(pendingAccount.nsec);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success("私钥已复制");
    }
  };

  const handleConfirm = async () => {
    if (pendingAccount) {
      try {
        await confirmRegistration(pendingAccount);
      } catch {
        // Error is handled by store
      }
    }
  };

  const handleCancel = () => {
    setConfirmed(false);
    cancelRegistration();
  };

  if (pendingAccount) {
    return (
      <div className="p-6">
        <div className="mb-6 border-b border-border pb-4">
          <h2 className="text-lg font-semibold text-primary">身份已生成</h2>
        </div>

        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-mono font-bold uppercase tracking-wider text-muted-foreground">公钥 (NPUB)</label>
            <div className="bg-muted p-2 border border-border font-mono text-xs break-all text-foreground/80">
              {pendingAccount.npub}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-mono font-bold uppercase tracking-wider text-destructive">
              私钥 (NSEC) - 请立即保存！
            </label>
            <div className="relative">
              <div className="bg-destructive/10 border border-destructive/30 p-3 font-mono text-xs break-all pr-10 text-destructive font-bold">
                {pendingAccount.nsec}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 hover:bg-destructive/10 rounded-sm"
                onClick={handleCopy}
              >
                {copied ? (
                  <Check className="h-3 w-3 text-green-600" />
                ) : (
                  <Copy className="h-3 w-3 text-destructive" />
                )}
              </Button>
            </div>
          </div>

          <div className="flex gap-3 bg-amber-500/5 p-3 text-amber-600 dark:text-amber-500 text-xs font-mono border-l-2 border-amber-500">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <p>
              警告：私钥丢失 = 永久失去账户访问权。必须离线备份。
            </p>
          </div>

          <label className="flex items-center gap-3 cursor-pointer p-2 hover:bg-muted/30 transition-colors border border-transparent hover:border-border">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="rounded-none border-foreground/30 w-4 h-4 text-primary focus:ring-1 focus:ring-primary"
            />
            <span className="text-xs font-mono uppercase">我已安全备份私钥</span>
          </label>

          {error && (
            <p className="text-xs text-destructive font-mono border border-destructive/20 p-2 bg-destructive/5">{error}</p>
          )}

          <div className="grid grid-cols-2 gap-3 pt-2">
            <Button
              variant="outline"
              className="rounded-sm font-mono text-xs uppercase"
              onClick={handleCancel}
              disabled={isLoading}
            >
              终止
            </Button>
            <Button
              className="rounded-sm bg-green-700 hover:bg-green-800 text-white font-mono text-xs uppercase"
              onClick={handleConfirm}
              disabled={!confirmed || isLoading}
            >
              {isLoading ? "配置中..." : "确认身份"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex flex-col items-start">
        <Sparkles className="h-8 w-8 text-foreground mb-3" />
        <h2 className="text-lg font-semibold">生成新身份</h2>
      </div>

      <div className="space-y-4">
        {error && (
          <p className="text-xs text-destructive font-mono border border-destructive/20 p-2">{error}</p>
        )}

        <Button
          className="w-full h-11 rounded-md text-sm font-medium bg-foreground text-background hover:bg-foreground/90"
          onClick={handleGenerate}
          disabled={isLoading}
          type="button"
        >
          {isLoading ? "生成中..." : "生成新身份"}
        </Button>

        <div className="relative py-2">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-card px-2 text-muted-foreground">或</span>
          </div>
        </div>

        <Button
          variant="outline"
          className="w-full h-11 rounded-md text-sm font-medium border-border hover:bg-muted"
          onClick={onSwitchToLogin}
        >
          导入现有密钥
        </Button>
      </div>
    </div>
  );
}
