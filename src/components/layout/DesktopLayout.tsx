import React, { useState } from "react";
import { Sidebar } from "./Sidebar";
import { ChatArea } from "./ChatArea";
import { ConnectionStatus } from "./ConnectionStatus";
import { SettingsDialog } from "@/components/settings/SettingsDialog";
import { useAuthStore } from "@/store/authStore";
import { Button } from "@/components/ui/button";
import { LogOut, Settings, User } from "lucide-react";
import { truncateNpub } from "@/utils/format";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface DesktopLayoutProps {
  children?: React.ReactNode;
}

export function DesktopLayout({ children }: DesktopLayoutProps) {
  const { npub, logout, isLoading } = useAuthStore();
  const [showSettings, setShowSettings] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const handleLogout = async () => {
    await logout();
    setShowLogoutConfirm(false);
  };

  return (
    <div className="h-screen flex flex-col">
      {/* Top bar */}
      <header className="h-14 border-b flex items-center justify-between px-4 bg-background">
        <div className="flex items-center gap-2">
          <div className="font-semibold text-lg">Ostia</div>
          <span className="text-xs text-muted-foreground px-2 py-0.5 rounded bg-muted hidden sm:inline">
            隐私优先
          </span>
        </div>
        <div className="flex items-center gap-3">
          <ConnectionStatus />
          <div className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground">
            <User className="h-4 w-4" />
            <span className="font-mono">{truncateNpub(npub || "", 8)}</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowSettings(true)}
          >
            <Settings className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowLogoutConfirm(true)}
          >
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex overflow-hidden">
        <Sidebar />
        {children || <ChatArea />}
      </main>

      {/* Settings Dialog */}
      <SettingsDialog open={showSettings} onOpenChange={setShowSettings} />

      {/* Logout Confirmation Dialog */}
      <Dialog open={showLogoutConfirm} onOpenChange={setShowLogoutConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认退出</DialogTitle>
            <DialogDescription>
              退出后需要重新输入私钥才能登录。请确保您已备份私钥。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowLogoutConfirm(false)}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={handleLogout}
              disabled={isLoading}
            >
              {isLoading ? "退出中..." : "确认退出"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
