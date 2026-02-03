import { useEffect, useState, useRef } from "react";
import { AuthPage } from "@/components/auth/AuthPage";
// import { HomePage } from "@/components/layout/HomePage";
import { SetPasswordDialog } from "@/components/auth/SetMasterPasswordDialog";
import { UnlockDialog } from "@/components/auth/UnlockDialog";
import { useAuthStore } from "@/store/authStore";
import { useUIStore } from "@/store/uiStore";
import { Toaster } from "@/components/ui/sonner";
import { Loader2 } from "lucide-react";
import { hasMasterPassword, publishPresence, resetUnlockLockout } from "@/utils/nostr";
import { useAdaptiveIcon } from "@/hooks/useAdaptiveIcon";
import ErrorBoundary from "@/components/ErrorBoundary";
import HomePageWrapper from "@/components/HomePageWrapper";
import { MobileBrowserOverlay } from "@/components/browser/MobileBrowserOverlay";
import { useBrowserStore } from "@/store/browserStore";

function App() {
  useAdaptiveIcon();

  // 为了避免直接依赖authStore造成循环，我们使用一个独立的状态来管理认证UI
  // const [authCheckComplete, setAuthCheckComplete] = useState(false);
  const [showSetMasterPassword, setShowSetMasterPassword] = useState(false);
  const [showUnlockDialog, setShowUnlockDialog] = useState(false);
  const [initializationComplete, setInitializationComplete] = useState(false);
  const [readyToRender, setReadyToRender] = useState(false);
  const initializedRef = useRef(false); // 使用ref确保只初始化一次

  useEffect(() => {
    if (initializedRef.current) return; // 防止重复初始化

    initializedRef.current = true; // 设置初始化标志

    const initializeApp = async () => {
      try {
        // 只检查后端密钥状态，不直接与authStore交互
        const encryptedKeyExists = await hasMasterPassword();

        if (encryptedKeyExists) {
          setShowUnlockDialog(true);
        }

      } catch (error) {
        console.error("Failed to initialize app:", error);
      } finally {
        setInitializationComplete(true);
        // 添加短暂延迟以确保状态稳定
        setTimeout(() => {
          setReadyToRender(true);
        }, 50);
      }
    };

    // 立即执行
    initializeApp();
  }, []);

  // 分离主密码设置检查逻辑，避免与认证状态直接耦合
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const isMobile = useUIStore(s => s.isMobile);
  const setIsMobile = useUIStore(s => s.setIsMobile);
  const fontSize = useUIStore(s => s.fontSize);
  const activeBrowserUrl = useBrowserStore(s => s.activeBrowserUrl);
  const masterPasswordCheckRef = useRef(false);

  // Sync font size with DOM
  useEffect(() => {
    document.documentElement.style.fontSize = `${fontSize}px`;
  }, [fontSize]);

  // Unify mobile detection in one place
  useEffect(() => {
    const checkMobile = () => {
      const isWindowMobile = window.innerWidth < 768;
      setIsMobile(isWindowMobile);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, [setIsMobile]);

  useEffect(() => {
    // 只在isAuthenticated为true且尚未检查时执行
    if (isAuthenticated && !masterPasswordCheckRef.current) {
      masterPasswordCheckRef.current = true; // 标记为已检查

      const checkMasterPasswordSetup = async () => {
        try {
          const hasPassword = await hasMasterPassword();
          if (!hasPassword) {
            setShowSetMasterPassword(true);
          }
        } catch (error) {
          console.error("Failed to check master password setup:", error);
        }
      };
      checkMasterPasswordSetup();
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    setShowUnlockDialog(false);
    const resetLockout = async () => {
      try {
        await resetUnlockLockout();
      } catch (error) {
        console.warn("Failed to reset unlock lockout after login:", error);
      }
    };
    resetLockout();
  }, [isAuthenticated]);

  useEffect(() => {
    let intervalId: number | null = null;

    const updatePresence = async (online: boolean) => {
      try {
        await publishPresence(online);
      } catch (error) {
        console.error("Failed to publish presence:", error);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        updatePresence(true);
      } else {
        updatePresence(false);
      }
    };

    const handleBeforeUnload = () => {
      updatePresence(false);
    };

    if (isAuthenticated) {
      updatePresence(true);
      document.addEventListener("visibilitychange", handleVisibilityChange);
      window.addEventListener("beforeunload", handleBeforeUnload);
      intervalId = window.setInterval(() => {
        if (document.visibilityState === "visible") {
          updatePresence(true);
        }
      }, 60000);
    }

    return () => {
      if (intervalId !== null) {
        window.clearInterval(intervalId);
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isAuthenticated]);


  useEffect(() => {
    if (activeBrowserUrl) {
      document.body.classList.add("browser-active");
    } else {
      document.body.classList.remove("browser-active");
    }
  }, [activeBrowserUrl]);

  // 移动端优化：回到顶部居中，但通过样式避开刘海屏
  const toastPosition = isMobile ? "top-center" : "top-right";

  // Show loading until initialization is complete
  if (!initializationComplete || !readyToRender) {
    return (
      <>
        <main className="min-h-screen bg-background flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </main>
        <Toaster position={toastPosition} />
      </>
    );
  }

  // 使用独立的认证状态来决定渲染哪个组件，避免与authStore直接耦合
  const shouldShowHomePage = isAuthenticated;

  return (
    <>
      {!activeBrowserUrl ? (
        <>
          {shouldShowHomePage ? (
            <ErrorBoundary>
              <HomePageWrapper />
            </ErrorBoundary>
          ) : showUnlockDialog ? (
            <main className="min-h-screen bg-background flex items-center justify-center p-4 bg-background overflow-hidden">
              <div className="relative z-10 w-full max-w-md">
                <div className="flex flex-col items-center mb-10">
                  <div className="flex h-16 w-16 items-center justify-center bg-foreground text-background mb-6 shadow-2xl skew-x-[-5deg] overflow-hidden">
                    <img src="/logo.png" alt="Ostia Logo" className="w-full h-full object-contain p-2" />
                  </div>
                </div>
                <UnlockDialog
                  open={showUnlockDialog}
                  onOpenChange={setShowUnlockDialog}
                  onSwitchToLogin={() => {
                    setShowUnlockDialog(false);
                    // 现在会显示 AuthPage
                  }}
                />
              </div>
            </main>
          ) : (
            <AuthPage />
          )}

          <SetPasswordDialog
            open={showSetMasterPassword}
            onOpenChange={setShowSetMasterPassword}
            onSuccess={async (passwordSet: boolean) => {
              if (passwordSet) {
                // 设置密码成功后，登出用户并显示解锁对话框
                const { logout } = useAuthStore.getState();
                await logout();
                setShowSetMasterPassword(false);
                setShowUnlockDialog(true);
              } else {
                // 跳过设置密码，只关闭对话框，保持登录状态
                setShowSetMasterPassword(false);
              }
            }}
          />
        </>
      ) : null}
      <Toaster position={toastPosition} richColors visibleToasts={1} expand={false} />
      <MobileBrowserOverlay />
    </>
  );
}

export default App;
