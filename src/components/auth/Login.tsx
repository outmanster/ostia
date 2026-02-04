import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuthStore } from "@/store/authStore";
import { KeyRound, Eye, EyeOff, ArrowRight } from "lucide-react";
import { isValidNsec } from "@/utils/format";

interface LoginProps {
  onSwitchToRegister: () => void;
}

export function Login({ onSwitchToRegister }: LoginProps) {
  const { login, isLoading, error, clearError } = useAuthStore();
  const [nsec, setNsec] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    if (!nsec.trim()) {
      setValidationError("请输入私钥");
      return;
    }

    if (!isValidNsec(nsec.trim())) {
      setValidationError("无效的私钥格式");
      return;
    }

    try {
      await login(nsec.trim());
    } catch {
      // Error is handled by store
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNsec(e.target.value);
    setValidationError(null);
    if (error) clearError();
  };

  const displayError = validationError || error;

  return (
    <div className="p-4">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="space-y-1">
          <div className="relative group">
            <div className="absolute inset-0 bg-primary/5 opacity-0 group-focus-within:opacity-100 transition-opacity pointer-events-none" />
            <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              id="nsec"
              type={showKey ? "text" : "password"}
              placeholder="请输入 nsec 开头的私钥"
              value={nsec}
              onChange={handleInputChange}
              className={`pl-9 pr-10 text-xs bg-background border-border h-9 rounded-sm focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary transition-all ${showKey ? "font-mono" : "tracking-widest"}`}
              autoComplete="off"
              spellCheck={false}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 hover:bg-transparent text-muted-foreground hover:text-foreground"
              onClick={() => setShowKey(!showKey)}
            >
              {showKey ? (
                <EyeOff className="h-3.5 w-3.5" />
              ) : (
                <Eye className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        </div>

        {displayError && (
          <div className="flex items-center gap-2 text-[0.625rem] text-destructive font-mono bg-destructive/5 border border-destructive/20 p-2">
            <ArrowRight className="h-3 w-3" />
            {displayError}
          </div>
        )}

        <Button type="submit" className="w-full h-9 rounded-md text-xs font-medium bg-primary hover:bg-primary/90 text-primary-foreground" disabled={isLoading}>
          {isLoading ? "正在验证..." : "登录"}
        </Button>

        <div className="relative py-1.5">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-card px-2 text-muted-foreground">或</span>
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          className="w-full h-9 rounded-md text-xs font-medium border-border hover:bg-muted"
          onClick={onSwitchToRegister}
        >
          生成新身份
        </Button>
      </form>
    </div>
  );
}
