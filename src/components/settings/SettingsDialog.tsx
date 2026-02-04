import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  Copy,
  Eye,
  EyeOff,
  Shield,
  Key,
  Server,
  Lock,
  Loader2,
  UserCircle,
  Sun,
  Moon,
  Monitor,
  Palette,
  Check,
  ChevronLeft,
  Database,
  QrCode,
  Type,
  Bell,
  Globe,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useUIStore, AccentColor } from "@/store/uiStore";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuthStore } from "@/store/authStore";
import { RelayManager } from "@/components/settings/RelayManager";
import { Slider } from "@/components/ui/slider";
import { ProfileEditor } from "@/components/settings/ProfileEditor";
import { StorageManager } from "@/components/settings/StorageManager";
import { ChangePasswordDialog } from "@/components/settings/ChangePasswordDialog";
import { DeletePasswordDialog } from "@/components/settings/DeletePasswordDialog";
import { SetPasswordDialog } from "@/components/auth/SetMasterPasswordDialog";
import { QRCodeView } from "@/components/ui/QRCodeView";
import { BookmarkGrid } from "@/components/browser/BookmarkGrid";
import { hasMasterPassword } from "@/utils/nostr";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useNotificationStore } from "@/store/notificationStore";
import { useMobileDetection } from "@/hooks/useMobileDetection";

interface AdaptiveContainerProps {
  isMobile: boolean;
  children: React.ReactNode;
  className?: string;
  desktopClassName?: string;
}

const AdaptiveContainer = ({ isMobile, children, className = "", desktopClassName = "px-1" }: AdaptiveContainerProps) => {
  if (isMobile) {
    return <div className={`px-4 pb-4 pt-4 ${className}`}>{children}</div>;
  }
  return (
    <ScrollArea className="h-full">
      <div className={`${desktopClassName} ${className}`}>{children}</div>
    </ScrollArea>
  );
};

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSwipeStart?: () => void;
  onSwipeMove?: (progress: number) => void;
  onSwipeEnd?: (closing: boolean) => void;
}

export function SettingsDialog({ open, onOpenChange, onSwipeStart, onSwipeMove, onSwipeEnd }: SettingsDialogProps) {
  const { setTheme, theme } = useTheme();
  const { accentColor, setAccentColor, settingsTab, isMobile, fontSize, setFontSize } = useUIStore();
  const { npub, nsec } = useAuthStore();
  const { push, setPush, registerPush, unregisterPush, selftestPush, isSaving } = useNotificationStore();
  const { isIOS } = useMobileDetection();

  // Animation state for mobile enter/exit
  const [animationState, setAnimationState] = useState<'idle' | 'entering' | 'leaving'>('idle');

  // Refs for gesture handling
  const elementRef = useRef<HTMLDivElement | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const isSwipingRef = useRef(false);
  const currentOffsetRef = useRef(0);
  const closeTimerRef = useRef<number | null>(null);

  // Handlers ref to keep listeners stable
  const handlersRef = useRef<{
    start: (e: TouchEvent) => void;
    move: (e: TouchEvent) => void;
    end: () => void;
  }>({ start: () => { }, move: () => { }, end: () => { } });

  useEffect(() => {
    document.documentElement.setAttribute("data-accent", accentColor);
  }, [accentColor]);

  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [showChangePasswordDialog, setShowChangePasswordDialog] = useState(false);
  const [showDeletePasswordDialog, setShowDeletePasswordDialog] = useState(false);
  const [showSetPasswordDialog, setShowSetPasswordDialog] = useState(false);
  const [showListenerServerToken, setShowListenerServerToken] = useState(false);
  const [showPushEndpointToken, setShowPushEndpointToken] = useState(false);
  const [showDeviceKey, setShowDeviceKey] = useState(false);
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [showDevFeatures, setShowDevFeatures] = useState(false);
  const clickCountRef = useRef(0);
  const lastClickTimeRef = useRef(0);

  useEffect(() => {
    const checkDevMode = () => {
      const devMode = localStorage.getItem("dev_mode_enabled") === "true";
      setShowDevFeatures(devMode);
    };
    checkDevMode();
    window.addEventListener("dev_mode_changed", checkDevMode);
    return () => window.removeEventListener("dev_mode_changed", checkDevMode);
  }, [open]);

  const handleVersionClick = () => {
    const now = Date.now();
    if (now - lastClickTimeRef.current > 500) {
      clickCountRef.current = 0;
    }
    lastClickTimeRef.current = now;
    clickCountRef.current++;

    if (!showDevFeatures && clickCountRef.current >= 10) {
      setShowDevFeatures(true);
      localStorage.setItem("dev_mode_enabled", "true");
      window.dispatchEvent(new Event("dev_mode_changed"));
      toast.success("开发者模式已启用：推送通知设置已显示");
      clickCountRef.current = 0;
    } else if (showDevFeatures && clickCountRef.current >= 5) {
      setShowDevFeatures(false);
      localStorage.setItem("dev_mode_enabled", "false");
      window.dispatchEvent(new Event("dev_mode_changed"));
      toast.info("开发者模式已关闭");
      clickCountRef.current = 0;
    }
  };

  useEffect(() => {
    if (!open) {
      setShowPrivateKey(false);
    }
  }, [open]);

  useEffect(() => {
    let isMounted = true;
    const loadVersion = async () => {
      try {
        const { getVersion } = await import("@tauri-apps/api/app");
        const version = await getVersion();
        if (isMounted) {
          setAppVersion(version);
        }
      } catch {
        if (isMounted) {
          setAppVersion(null);
        }
      }
    };
    loadVersion();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (open) {
      const checkPasswordStatus = async () => {
        try {
          const hasPwd = await hasMasterPassword();
          setHasPassword(hasPwd);
        } catch (error) {
          console.error("Failed to check password status:", error);
          setHasPassword(false);
        }
      };
      checkPasswordStatus();
    }
  }, [open]);

  useEffect(() => {
    if (!isMobile) return;
    if (open) {
      setAnimationState('entering');
      const timer = setTimeout(() => setAnimationState('idle'), 300);
      return () => clearTimeout(timer);
    }
    setAnimationState('leaving');
    const timer = setTimeout(() => setAnimationState('idle'), 300);
    return () => clearTimeout(timer);
  }, [open, isMobile]);

  const handleMobileBack = () => {
    if (!isMobile) {
      onOpenChange(false);
      return;
    }
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    const element = elementRef.current;
    if (element) {
      element.style.animation = '';
      element.style.transition = '';
      element.style.transform = '';
    }
    onSwipeStart?.();
    setAnimationState('leaving');
    onSwipeEnd?.(true);
    closeTimerRef.current = window.setTimeout(() => {
      onOpenChange(false);
      closeTimerRef.current = null;
    }, 300);
  };

  // Update handlers on every render
  useEffect(() => {
    handlersRef.current.start = (e: TouchEvent) => {
      if (!isMobile) return;
      const x = e.touches[0].clientX;
      const y = e.touches[0].clientY;
      const target = e.target as HTMLElement | null;
      if (target?.closest?.('[data-swipe-exclude="true"]')) {
        touchStartRef.current = null;
        isSwipingRef.current = false;
        currentOffsetRef.current = 0;
        return;
      }

      touchStartRef.current = { x, y };
      isSwipingRef.current = false;
      currentOffsetRef.current = 0;

      const element = elementRef.current;
      if (element) {
        element.style.transition = 'none';
        element.style.animation = 'none';
      }

      onSwipeStart?.();
    };

    handlersRef.current.move = (e: TouchEvent) => {
      if (!touchStartRef.current || !isMobile) return;

      const currentX = e.touches[0].clientX;
      const currentY = e.touches[0].clientY;
      const diffX = currentX - touchStartRef.current.x;
      const diffY = currentY - touchStartRef.current.y;
      const absX = Math.abs(diffX);
      const absY = Math.abs(diffY);

      if (!isSwipingRef.current) {
        // Vertical scroll dominance check
        if (absY > absX && absY > 5) {
          touchStartRef.current = null;
          return;
        }

        // Horizontal swipe detection
        if (diffX > 5 && absX > absY) {
          isSwipingRef.current = true;
          const element = elementRef.current;
          if (element) {
            element.style.transition = 'none';
            element.style.animation = 'none';
          }
        }
      }

      if (isSwipingRef.current) {
        if (e.cancelable) {
          e.preventDefault();
          e.stopPropagation();
        }

        const offset = Math.max(0, diffX);
        currentOffsetRef.current = offset;

        const element = elementRef.current;
        const containerWidth = element?.offsetWidth || window.innerWidth;
        if (element) {
          element.style.transform = `translate3d(${offset}px, 0, 0)`;
        }

        const progress = containerWidth ? Math.min(1, offset / containerWidth) : 0;
        onSwipeMove?.(progress);
      }
    };

    handlersRef.current.end = () => {
      if (!touchStartRef.current || !isMobile) return;

      if (!isSwipingRef.current) {
        touchStartRef.current = null;
        return;
      }

      const diffX = currentOffsetRef.current;
      const element = elementRef.current;
      const screenWidth = element?.offsetWidth || window.innerWidth;

      // Restore transitions
      if (element) {
        element.style.transition = 'transform 250ms cubic-bezier(0.2, 0.8, 0.2, 1)';
      }

      // Threshold: 35%
      if (diffX > screenWidth * 0.35) {
        // Finish Swipe (Exit)
        if (element) {
          element.style.transform = `translate3d(${screenWidth}px, 0, 0)`;
        }

        onSwipeEnd?.(true);

        // Trigger close after animation
        setTimeout(() => {
          isSwipingRef.current = false;
          onOpenChange(false); // Close dialog
          setAnimationState('idle');

          if (element) {
            element.style.transition = '';
            element.style.transform = '';
          }
        }, 250);
      } else {
        // Cancel Swipe (Snap back)
        if (element) {
          element.style.transform = 'translate3d(0, 0, 0)';
        }

        onSwipeEnd?.(false);

        setTimeout(() => {
          isSwipingRef.current = false;
          if (element) {
            element.style.transition = '';
          }
        }, 250);
      }

      touchStartRef.current = null;
    };
  });

  // Attach/Detach listeners logic
  const onTouchStart = (e: TouchEvent) => handlersRef.current.start(e);
  const onTouchMove = (e: TouchEvent) => handlersRef.current.move(e);
  const onTouchEnd = () => handlersRef.current.end();

  const setContentRef = (node: HTMLDivElement | null) => {
    if (elementRef.current) {
      const oldEl = elementRef.current;
      oldEl.removeEventListener('touchstart', onTouchStart, { capture: true });
      oldEl.removeEventListener('touchmove', onTouchMove, { capture: true });
      oldEl.removeEventListener('touchend', onTouchEnd, { capture: true });
      oldEl.removeEventListener('touchcancel', onTouchEnd, { capture: true });
    }

    elementRef.current = node;

    if (node && isMobile) {
      node.addEventListener('touchstart', onTouchStart, { passive: true, capture: true });
      node.addEventListener('touchmove', onTouchMove, { passive: false, capture: true });
      node.addEventListener('touchend', onTouchEnd, { capture: true });
      node.addEventListener('touchcancel', onTouchEnd, { capture: true });

      node.style.willChange = 'transform';
      node.style.touchAction = 'pan-y';
    }
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label}已复制到剪贴板`);
    } catch {
      toast.error("复制失败");
    }
  };

  const copyListenerServerToken = async () => {
    if (!push.listenerServerAuthToken) {
      toast.error("暂无令牌可复制");
      return;
    }
    await copyToClipboard(push.listenerServerAuthToken, "监听服务器令牌");
  };

  const copyPushEndpointToken = async () => {
    if (!push.pushEndpointAuthToken) {
      toast.error("暂无令牌可复制");
      return;
    }
    await copyToClipboard(push.pushEndpointAuthToken, "推送网关令牌");
  };

  const copyDeviceKey = async () => {
    if (!push.deviceKey) {
      toast.error("暂无 Key 可复制");
      return;
    }
    const label =
      push.pushType === "bark"
        ? "Bark 设备 Key"
        : push.pushType === "discord"
          ? "Discord Webhook 地址"
          : push.pushType === "slack"
            ? "Slack Webhook 地址"
            : push.pushType === "feishu"
              ? "飞书 Webhook 地址"
              : push.pushType === "wecom"
                ? "企业微信机器人 Key"
                : push.pushType === "dingtalk"
                  ? "钉钉 Webhook 地址/Token"
                  : "目标 Key";
    await copyToClipboard(push.deviceKey, label);
  };

  const exportPrivateKey = async () => {
    if (nsec) {
      await copyToClipboard(nsec, "私钥");
    } else {
      toast.error("无法获取私钥: 用户未登录或私钥不存在");
    }
  };

  const toggleShowPrivateKey = () => {
    if (!showPrivateKey) {
      if (nsec) {
        setShowPrivateKey(true);
      } else {
        toast.error("无法获取私钥: 用户未登录或私钥不存在");
      }
    } else {
      setShowPrivateKey(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        ref={setContentRef}
        className={`${isMobile
          ? `w-screen h-screen max-w-none max-h-none rounded-none border-none p-0 gap-0 top-0 left-0 translate-x-0 translate-y-0 ${animationState === 'entering' ? 'animate-slide-in' : ''} ${animationState === 'leaving' ? 'animate-slide-out' : ''}`
          : "sm:max-w-[560px] max-h-[85vh] rounded-lg border p-5"
          } flex flex-col overflow-hidden bg-background`}
        showCloseButton={!isMobile}
        showOverlay={!isMobile}
      >
        {isMobile && (
          <div
            className="absolute left-0 top-0 bottom-0 w-6 z-50 pointer-events-auto"
            style={{ touchAction: 'none' }}
          />
        )}
        <DialogHeader
          className={`flex-shrink-0 ${isMobile ? "flex-row items-center gap-2 space-y-0 px-4 pb-2 border-b bg-background/60 backdrop-blur-md sticky top-0 z-10" : "mb-3"}`}
          style={isMobile ? { paddingTop: "max(1.25rem, env(safe-area-inset-top))" } : undefined}
        >
          {isMobile && (
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 -ml-2"
              onClick={handleMobileBack}
            >
              <ChevronLeft className="h-8 w-8" strokeWidth={3} />
            </Button>
          )}
          <div className="flex-1 text-left">
            <DialogTitle className={isMobile ? "text-lg" : "text-lg"}>
              {isMobile ? (
                {
                  profile: "个人资料",
                  account: "账户与安全",
                  relays: "中继器",
                  notifications: "推送通知",
                  appearance: "外观设计",
                  privacy: "隐私保护",
                  storage: "存储管理",
                  bookmarks: "网络书签",
                }[settingsTab] || "设置"
              ) : (
                "设置"
              )}
            </DialogTitle>
            {!isMobile && <DialogDescription className="text-xs mt-1">管理您的账户和应用设置</DialogDescription>}
          </div>
        </DialogHeader>

        <Tabs
          value={settingsTab}
          onValueChange={(val: string) => useUIStore.setState({ settingsTab: val as any })}
          className="flex-1 flex flex-col overflow-hidden w-full"
        >
          {!isMobile && (
            <TabsList className={`grid w-full flex-shrink-0 h-9 ${showDevFeatures ? "grid-cols-8" : "grid-cols-6"}`}>
              <TabsTrigger value="relays" className="gap-1 text-xs h-7 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm">
                <Server className="h-3.5 w-3.5" />
                中继器
              </TabsTrigger>
              <TabsTrigger value="profile" className="gap-1 text-xs h-7 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm">
                <UserCircle className="h-3.5 w-3.5" />
                资料
              </TabsTrigger>
              <TabsTrigger value="account" className="gap-1 text-xs h-7 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm">
                <Key className="h-3.5 w-3.5" />
                账户
              </TabsTrigger>
              <TabsTrigger value="storage" className="gap-1 text-xs h-7 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm">
                <Database className="h-3.5 w-3.5" />
                存储
              </TabsTrigger>
              {showDevFeatures && (
                <TabsTrigger value="notifications" className="gap-1 text-xs h-7 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm">
                  <Bell className="h-3.5 w-3.5" />
                  推送
                </TabsTrigger>
              )}
              {showDevFeatures && (
                <TabsTrigger value="bookmarks" className="gap-1 text-xs h-7 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm">
                  <Globe className="h-3.5 w-3.5" />
                  书签
                </TabsTrigger>
              )}
              <TabsTrigger value="appearance" className="gap-1 text-xs h-7 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm">
                <Palette className="h-3.5 w-3.5" />
                外观
              </TabsTrigger>
              <TabsTrigger value="privacy" className="gap-1 text-xs h-7 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm">
                <Shield className="h-3.5 w-3.5" />
                隐私
              </TabsTrigger>
            </TabsList>
          )}

          <div
            className={`flex-1 overflow-y-auto min-h-0 ${isMobile ? "bg-background" : "px-1 mt-4"}`}
            style={isMobile ? { paddingBottom: "max(1rem, env(safe-area-inset-bottom))" } : undefined}
          >
            <TabsContent value="profile" className="h-full m-0">
              <AdaptiveContainer isMobile={isMobile}>
                <ProfileEditor />
              </AdaptiveContainer>
            </TabsContent>

            <TabsContent value="account" className="m-0 h-full">
              <AdaptiveContainer isMobile={isMobile} className="space-y-3" desktopClassName="px-1 pb-4">
                <div className="p-3 bg-muted/30 rounded-xl border border-border/50 space-y-3">
                  <div className="space-y-1">
                    <span className="text-xs font-semibold flex items-center gap-2">
                      <Key className="h-3 w-3 text-primary" />
                      身份凭证
                    </span>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      您的身份公钥与私钥。公钥用于让他人找到您，私钥用于签名身份。
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">公钥 (npub)</label>
                      </div>
                      <div className="flex items-center gap-2">
                        <p className="flex-1 text-xs text-muted-foreground font-mono break-all bg-background/50 border border-border/30 p-2 rounded-sm min-h-[36px] flex items-center">
                          {npub}
                        </p>
                        <div className="flex items-center gap-1">
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7">
                                <QrCode className="h-3.5 w-3.5" />
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-xs">
                              <DialogHeader>
                                <DialogTitle>我的二维码</DialogTitle>
                                <DialogDescription>展示您的公钥二维码</DialogDescription>
                              </DialogHeader>
                              <QRCodeView value={npub || ""} label="您的公钥 (npub)" />
                            </DialogContent>
                          </Dialog>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => copyToClipboard(npub || "", "公钥")}
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">私钥 (nsec)</label>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 min-w-0 max-w-full overflow-hidden text-xs text-muted-foreground font-mono bg-background/50 border border-border/30 p-2 rounded-sm flex items-center min-h-[36px]">
                          {showPrivateKey && nsec ? (
                            <span className="block w-full break-all whitespace-pre-wrap">{nsec}</span>
                          ) : (
                            <span className="block w-full truncate whitespace-nowrap opacity-50">••••••••••••••••••••••••••••••••</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={toggleShowPrivateKey}
                          >
                            {showPrivateKey ? (
                              <EyeOff className="h-3.5 w-3.5" />
                            ) : (
                              <Eye className="h-3.5 w-3.5" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={exportPrivateKey}
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                      <p className="text-xs text-amber-600 bg-amber-500/10 p-1.5 rounded border border-amber-500/20 flex items-start gap-1.5">
                        <span className="shrink-0">⚠️</span>
                        <span>请妥善保管您的私钥。丢失私钥意味着永久丢失账户访问权限。</span>
                      </p>
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-muted/30 rounded-xl border border-border/50 space-y-3">
                  <div className="space-y-1">
                    <span className="text-xs font-semibold flex items-center gap-2">
                      <Lock className="h-3 w-3 text-primary" />
                      应用锁与保护
                    </span>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      设置应用密码以保护您的本地数据，防止未经授权的访问。
                    </p>
                  </div>

                  <div className="space-y-2">
                    {hasPassword === null ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      </div>
                    ) : hasPassword ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between p-2.5 bg-background/50 border border-border/30 rounded-sm">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-xs font-medium">状态</span>
                            <span className="text-xs text-green-600 dark:text-green-400 font-mono flex items-center gap-1">
                              <Check className="h-3 w-3" /> 已开启密码保护
                            </span>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setShowChangePasswordDialog(true)}
                              className="h-7 text-xs font-mono px-3"
                            >
                              更改密码
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setShowDeletePasswordDialog(true)}
                              className="h-7 text-xs font-mono px-3 text-destructive hover:text-destructive"
                            >
                              删除
                            </Button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-start justify-center py-4 px-3 gap-2 bg-background/50 border border-dashed border-border/50 rounded-lg">
                        <Lock className="h-6 w-6 text-muted-foreground/30" />
                        <div className="space-y-0.5">
                          <p className="text-xs font-medium">未设置密码保护</p>
                          <p className="text-xs text-muted-foreground">设置密码后，下次启动应用时需输入密码解锁。</p>
                        </div>
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => setShowSetPasswordDialog(true)}
                          className="h-7 text-xs px-4"
                        >
                          立即设置
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </AdaptiveContainer>
            </TabsContent>

            <TabsContent value="relays" className="h-full m-0">
              <AdaptiveContainer isMobile={isMobile} desktopClassName="pr-1">
                <RelayManager open={open} onOpenChange={onOpenChange} />
              </AdaptiveContainer>
            </TabsContent>

            <TabsContent value="storage" className="h-full m-0">
              <AdaptiveContainer isMobile={isMobile} desktopClassName="pr-1">
                <StorageManager />
              </AdaptiveContainer>
            </TabsContent>

            {showDevFeatures && (
              <TabsContent value="notifications" className="h-full m-0">
                <AdaptiveContainer isMobile={isMobile} className="space-y-3" desktopClassName="px-1 pb-4">
                  <div className="p-3 bg-muted/30 rounded-xl border border-border/50 space-y-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <span className="text-xs font-semibold flex items-center gap-2">
                          <Bell className="h-3 w-3 text-primary" />
                          离线推送
                        </span>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          通过“监听服务器”定时检查，在 App 关闭/休眠时也能推送提醒。
                        </p>
                      </div>
                      <Switch
                        checked={push.enabled}
                        disabled={isSaving}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            registerPush();
                          } else {
                            unregisterPush();
                          }
                        }}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-medium">监听服务器地址</label>
                      <Input
                        value={push.listenerServerUrl}
                        onChange={(e) => setPush({ listenerServerUrl: e.target.value })}
                        placeholder="https://<你的监听服务器域名>"
                        className="font-mono text-xs h-8"
                        disabled={isSaving}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-medium">监听服务器令牌（可选）</label>
                      <div className="flex items-center gap-2">
                        {showListenerServerToken ? (
                          <Input
                            value={push.listenerServerAuthToken}
                            type="text"
                            onChange={(e) => setPush({ listenerServerAuthToken: e.target.value })}
                            placeholder="AUTH_TOKEN"
                            className="text-xs font-mono bg-background/50 border-border/30 h-8 min-h-[32px]"
                            disabled={isSaving}
                          />
                        ) : (
                          <div className="flex-1 min-w-0 max-w-full overflow-hidden text-xs text-muted-foreground font-mono bg-background/50 border border-border/30 p-2 rounded-sm flex items-center min-h-[32px]">
                            {push.listenerServerAuthToken ? (
                              <span className="block w-full truncate whitespace-nowrap opacity-50">••••••••••••••••••••••••••••••••</span>
                            ) : (
                              <span className="block w-full truncate whitespace-nowrap opacity-50">AUTH_TOKEN</span>
                            )}
                          </div>
                        )}
                        <div className="w-[60px] flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => setShowListenerServerToken(!showListenerServerToken)}
                            disabled={isSaving}
                          >
                            {showListenerServerToken ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={copyListenerServerToken}
                            disabled={isSaving}
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/20 px-3 py-2">
                      <span className="text-xs text-muted-foreground">推送诊断</span>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={isSaving}
                        onClick={() => selftestPush()}
                        className="h-7 text-xs px-3"
                      >
                        推送自检
                      </Button>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-medium">推送类型</label>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant={push.pushType === "webhook" ? "default" : "outline"}
                          disabled={isSaving}
                          onClick={() => setPush({ pushType: "webhook" })}
                          className="h-7 text-xs px-3"
                        >
                          自定义 Webhook
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={push.pushType === "discord" ? "default" : "outline"}
                          disabled={isSaving}
                          onClick={() => setPush({ pushType: "discord" })}
                          className="h-7 text-xs px-3"
                        >
                          Discord
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={push.pushType === "slack" ? "default" : "outline"}
                          disabled={isSaving}
                          onClick={() => setPush({ pushType: "slack" })}
                          className="h-7 text-xs px-3"
                        >
                          Slack
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={push.pushType === "feishu" ? "default" : "outline"}
                          disabled={isSaving}
                          onClick={() => setPush({ pushType: "feishu" })}
                          className="h-7 text-xs px-3"
                        >
                          飞书
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={push.pushType === "wecom" ? "default" : "outline"}
                          disabled={isSaving}
                          onClick={() => setPush({ pushType: "wecom" })}
                          className="h-7 text-xs px-3"
                        >
                          企业微信
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={push.pushType === "dingtalk" ? "default" : "outline"}
                          disabled={isSaving}
                          onClick={() => setPush({ pushType: "dingtalk" })}
                          className="h-7 text-xs px-3"
                        >
                          钉钉
                        </Button>
                        {isIOS && (
                          <Button
                            type="button"
                            size="sm"
                            variant={push.pushType === "bark" ? "default" : "outline"}
                            disabled={isSaving}
                            onClick={() => setPush({ pushType: "bark" })}
                            className="h-7 text-xs px-3"
                          >
                            Bark
                          </Button>
                        )}
                      </div>
                      {isIOS && <p className="text-xs text-muted-foreground">Bark 仅支持 iOS</p>}
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-medium">推送网关地址</label>
                      <Input
                        value={push.pushEndpointUrl}
                        onChange={(e) => setPush({ pushEndpointUrl: e.target.value })}
                        placeholder={
                          push.pushType === "webhook"
                            ? "https://<你的推送网关域名>/push"
                            : `https://<你的推送网关域名>/push/${push.pushType}`
                        }
                        className="font-mono text-xs h-8"
                        disabled={isSaving}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-medium">推送网关令牌（可选）</label>
                      <div className="flex items-center gap-2">
                        {showPushEndpointToken ? (
                          <Input
                            value={push.pushEndpointAuthToken}
                            type="text"
                            onChange={(e) => setPush({ pushEndpointAuthToken: e.target.value })}
                            placeholder="AUTH_TOKEN"
                            className="text-xs font-mono bg-background/50 border-border/30 h-8 min-h-[32px]"
                            disabled={isSaving}
                          />
                        ) : (
                          <div className="flex-1 min-w-0 max-w-full overflow-hidden text-xs text-muted-foreground font-mono bg-background/50 border border-border/30 p-2 rounded-sm flex items-center min-h-[32px]">
                            {push.pushEndpointAuthToken ? (
                              <span className="block w-full truncate whitespace-nowrap opacity-50">••••••••••••••••••••••••••••••••</span>
                            ) : (
                              <span className="block w-full truncate whitespace-nowrap opacity-50">AUTH_TOKEN</span>
                            )}
                          </div>
                        )}
                        <div className="w-[60px] flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => setShowPushEndpointToken(!showPushEndpointToken)}
                            disabled={isSaving}
                          >
                            {showPushEndpointToken ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={copyPushEndpointToken}
                            disabled={isSaving}
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-medium">
                        {push.pushType === "bark"
                          ? "Bark 设备 Key"
                          : push.pushType === "wecom"
                            ? "企业微信机器人 Key"
                            : push.pushType === "webhook"
                              ? "目标 Key（可选）"
                              : "Webhook 地址/Key"}
                      </label>
                      <div className="flex items-center gap-2">
                        {showDeviceKey ? (
                          <Input
                            value={push.deviceKey}
                            type="text"
                            onChange={(e) => setPush({ deviceKey: e.target.value })}
                            placeholder={
                              push.pushType === "bark"
                                ? "从 Bark App 获取"
                                : push.pushType === "wecom"
                                  ? "从企业微信群机器人获取"
                                  : push.pushType === "dingtalk"
                                    ? "填完整 Webhook URL 或 access_token"
                                    : push.pushType === "webhook"
                                      ? "留空则不携带 deviceKey"
                                      : "填完整 Webhook URL"
                            }
                            className="text-xs font-mono bg-background/50 border-border/30 h-9 min-h-[36px]"
                            disabled={isSaving}
                          />
                        ) : (
                          <div className="flex-1 min-w-0 max-w-full overflow-hidden text-xs text-muted-foreground font-mono bg-background/50 border border-border/30 p-2 rounded-sm flex items-center min-h-[36px]">
                            {push.deviceKey ? (
                              <span className="block w-full truncate whitespace-nowrap opacity-50">••••••••••••••••••••••••••••••••</span>
                            ) : (
                              <span className="block w-full truncate whitespace-nowrap opacity-50">
                                {push.pushType === "bark"
                                  ? "从 Bark App 获取"
                                  : push.pushType === "wecom"
                                    ? "从企业微信群机器人获取"
                                    : push.pushType === "dingtalk"
                                      ? "填完整 Webhook URL 或 access_token"
                                      : push.pushType === "webhook"
                                        ? "留空则不携带 deviceKey"
                                        : "填完整 Webhook URL"}
                              </span>
                            )}
                          </div>
                        )}
                        <div className="w-[60px] flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => setShowDeviceKey(!showDeviceKey)}
                            disabled={isSaving}
                          >
                            {showDeviceKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={copyDeviceKey}
                            disabled={isSaving}
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                      {push.pushType !== "webhook" && <p className="text-xs text-muted-foreground">该项必填</p>}
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-medium">推送标题</label>
                      <Input
                        value={push.pushTitle}
                        onChange={(e) => setPush({ pushTitle: e.target.value })}
                        placeholder="Ostia"
                        className="text-xs h-8"
                        disabled={isSaving}
                      />
                    </div>

                    <div className="flex justify-end">
                      <Button
                        variant="default"
                        size="sm"
                        className="h-7 text-xs px-4"
                        disabled={isSaving}
                        onClick={() => registerPush()}
                      >
                        {isSaving ? (
                          <span className="inline-flex items-center gap-2">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            同步中
                          </span>
                        ) : (
                          "保存并同步"
                        )}
                      </Button>
                    </div>
                  </div>
                </AdaptiveContainer>
              </TabsContent>
            )}

            {showDevFeatures && (
              <TabsContent value="bookmarks" className="h-full m-0">
                <AdaptiveContainer isMobile={isMobile} desktopClassName="px-1 pb-4">
                  <BookmarkGrid isMobile={isMobile} />
                </AdaptiveContainer>
              </TabsContent>
            )}


            <TabsContent value="appearance" className="h-full m-0">
              <AdaptiveContainer isMobile={isMobile} className="space-y-3" desktopClassName="px-1 pb-4">
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium">主题模式</label>
                    <p className="text-xs text-muted-foreground">选择您喜欢的应用外观界面</p>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <button
                      onClick={() => setTheme("light")}
                      className={`flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all ${theme === "light" ? "border-primary bg-primary/5" : "border-muted hover:border-muted-foreground/30 bg-background"
                        }`}
                    >
                      <div className="p-2 bg-amber-50 rounded-full text-amber-500">
                        <Sun className="h-5 w-5" />
                      </div>
                      <span className="text-xs font-medium">浅色</span>
                    </button>

                    <button
                      onClick={() => setTheme("dark")}
                      className={`flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all ${theme === "dark" ? "border-primary bg-primary/5" : "border-muted hover:border-muted-foreground/30 bg-background"
                        }`}
                    >
                      <div className="p-2 bg-slate-900 rounded-full text-slate-100">
                        <Moon className="h-5 w-5" />
                      </div>
                      <span className="text-xs font-medium">深色</span>
                    </button>

                    <button
                      onClick={() => setTheme("system")}
                      className={`flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all ${theme === "system" ? "border-primary bg-primary/5" : "border-muted hover:border-muted-foreground/30 bg-background"
                        }`}
                    >
                      <div className="p-2 bg-muted rounded-full text-muted-foreground">
                        <Monitor className="h-5 w-5" />
                      </div>
                      <span className="text-xs font-medium">系统</span>
                    </button>
                  </div>
                </div>

                <div className="p-3 bg-muted/30 rounded-xl border border-border/50 space-y-3">
                  <div className="space-y-1">
                    <span className="text-xs font-semibold flex items-center gap-2">
                      <Palette className="h-3 w-3 text-primary" />
                      强调色彩
                    </span>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      选择应用的主题强调色，这会影响按钮和活动状态的颜色。
                    </p>
                  </div>

                  <div className="flex gap-2">
                    {[
                      { id: "blue", color: "bg-[#2563eb]", name: "网络蓝" },
                      { id: "orange", color: "bg-[#e5501e]", name: "工业橙" },
                      { id: "green", color: "bg-[#22c55e]", name: "矩阵绿" },
                      { id: "violet", color: "bg-[#8b5cf6]", name: "信号紫" },
                      { id: "crimson", color: "bg-[#dc2626]", name: "战术红" },
                    ].map((c) => (
                      <button
                        key={c.id}
                        onClick={() => setAccentColor(c.id as AccentColor)}
                        className={`group relative w-7 h-7 rounded-full ${c.color} transition-all hover:scale-110 active:scale-95 shadow-sm`}
                      >
                        {accentColor === c.id && (
                          <Check className="w-3.5 h-3.5 text-white absolute inset-0 m-auto" />
                        )}
                        <span className="absolute -top-7 left-1/2 -translate-x-1/2 text-xs bg-popover text-popover-foreground px-2 py-0.5 rounded border border-border shadow-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-all pointer-events-none z-10">
                          {c.name}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-3 bg-muted/30 rounded-xl border border-border/50 space-y-3">
                  <div className="space-y-1">
                    <span className="text-xs font-semibold flex items-center gap-2">
                      <Type className="h-3 w-3 text-primary" />
                      文字大小
                    </span>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      调整应用全局字号大小，适配您的阅读习惯。
                    </p>
                  </div>

                  <div className="flex items-center gap-3 px-1">
                    <span className="text-xs text-muted-foreground shrink-0 font-medium">A</span>
                    <div className="flex-1 space-y-3 pt-2">
                      <Slider
                        value={[([14, 16, 18, 20, 24].indexOf(fontSize) === -1 ? 1 : [14, 16, 18, 20, 24].indexOf(fontSize))]}
                        min={0}
                        max={4}
                        step={1}
                        onValueChange={(vals) => setFontSize([14, 16, 18, 20, 24][vals[0]])}
                        className="cursor-pointer py-2"
                        data-swipe-exclude="true"
                      />
                      <div className="flex justify-between px-1 relative">
                        {[14, 16, 18, 20, 24].map((size) => (
                          <span
                            key={size}
                            className={`text-[0.6rem] font-mono whitespace-nowrap transition-colors duration-200 cursor-pointer ${fontSize === size ? "text-primary font-bold" : "text-muted-foreground/60"
                              }`}
                            onClick={() => setFontSize(size)}
                          >
                            {
                              {
                                14: "较小",
                                16: "标准",
                                18: "中",
                                20: "大",
                                24: "特大"
                              }[size as 14 | 16 | 18 | 20 | 24]
                            }
                          </span>
                        ))}
                      </div>
                    </div>
                    <span className="text-[16px] text-muted-foreground shrink-0 leading-none font-medium">A</span>
                  </div>
                  <div className="h-1" />
                </div>
              </AdaptiveContainer>
            </TabsContent>

            <TabsContent value="privacy" className="h-full m-0">
              <AdaptiveContainer isMobile={isMobile} className="space-y-3" desktopClassName="px-1 pb-4">
                <div className="p-3 bg-muted/30 rounded-xl border border-border/50 space-y-3">
                  <div className="space-y-1">
                    <span className="text-xs font-semibold flex items-center gap-2">
                      <Shield className="h-3 w-3 text-primary" />
                      安全特性
                    </span>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      通过先进的加密技术保护您的数字通信。
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-2">
                    {[
                      { title: "端到端加密", desc: "采用 NIP-17 标准，消息内容经过高强度加密，仅收发双方可见。" },
                      { title: "身份掩码保护", desc: "基于 Gift Wrap 技术对中继器隐藏交互关系，保护您的社交元数据。" },
                      { title: "本地数据安全", desc: "私钥与聊天记录仅加密存储于本地设备，软件不收集任何敏感信息。" },
                      { title: "服务器独立性", desc: "您拥有完全的网络自主权，但同时必须自行配置中继器以连接网络。" }
                    ].map((item, i) => (
                      <div key={i} className="p-2.5 bg-background/50 border border-border/30 rounded-sm space-y-1">
                        <span className="text-xs font-medium flex items-center gap-2">
                          <Check className="h-3 w-3 text-primary" />
                          {item.title}
                        </span>
                        <p className="text-xs text-muted-foreground leading-normal ml-5">
                          {item.desc}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </AdaptiveContainer>
            </TabsContent>
          </div>
        </Tabs>

        <div
          className={`text-center text-xs text-muted-foreground ${isMobile ? "pb-4" : "pt-2"}`}
          onClick={handleVersionClick}
        >
          {appVersion ? `Ostia v${appVersion}` : "Ostia"}
        </div>

        {
          !isMobile && (
            <DialogFooter className="flex-shrink-0 pt-4 border-t mt-auto">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                关闭
              </Button>
            </DialogFooter>
          )
        }

        <ChangePasswordDialog
          open={showChangePasswordDialog}
          onOpenChange={setShowChangePasswordDialog}
        />
        <DeletePasswordDialog
          open={showDeletePasswordDialog}
          onOpenChange={setShowDeletePasswordDialog}
          onSuccess={async () => {
            setHasPassword(false);
            window.location.reload();
          }}
        />
        <SetPasswordDialog
          open={showSetPasswordDialog}
          onOpenChange={setShowSetPasswordDialog}
          onSuccess={async (passwordSet: boolean) => {
            if (passwordSet) {
              setHasPassword(true);
              setShowSetPasswordDialog(false);
              toast.success("密码设置成功");
            } else {
              setShowSetPasswordDialog(false);
            }
          }}
        />
      </DialogContent >
    </Dialog >
  );
}
