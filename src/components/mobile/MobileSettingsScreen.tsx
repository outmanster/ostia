import { LogOut, Shield, User, Key, Server, Palette, Database, ChevronRight, Bell, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect, useState, useRef } from "react";
import { toast } from "sonner";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";


import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuthStore } from "@/store/authStore";
import { useUIStore } from "@/store/uiStore";
import { truncateNpub } from "@/utils/format";
import { MobileHeader } from "./MobileHeader";

export function MobileSettingsScreen() {
    const npub = useAuthStore(s => s.npub);
    const profile = useAuthStore(s => s.profile);
    const logout = useAuthStore(s => s.logout);
    const setShowSettingsDialog = useUIStore(s => s.setShowSettingsDialog);
    const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
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
    }, []);

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

    const handleLogout = async () => {
        await logout();
        setShowLogoutConfirm(false);
    };

    return (
        <div className="flex flex-col h-full bg-background animate-in fade-in slide-in-from-bottom-4 duration-300 relative">
            <MobileHeader title="设置" />

            <div className="flex-1 overflow-y-auto">
                <div className="px-4 pb-24 pt-4 space-y-3">
                    <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-xl border border-border/50">
                        <Avatar className="h-12 w-12 border-2 border-background shadow-sm">
                            <AvatarImage src={profile?.picture || undefined} />
                            <AvatarFallback className="text-sm bg-primary/10 text-primary">
                                {profile?.displayName?.slice(0, 2).toUpperCase() || "ME"}
                            </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                            <h2 className="text-base font-bold truncate">
                                {profile?.displayName || profile?.name || "匿名用户"}
                            </h2>
                            <p className="text-xs text-muted-foreground font-mono">
                                {truncateNpub(npub || "", 8)}
                            </p>
                        </div>
                    </div>

                    <div className="rounded-xl overflow-hidden border border-border/50 bg-card">
                        <button
                            className="w-full flex items-center justify-between p-3 bg-card hover:bg-accent/50 transition-colors border-b border-border/50"
                            onClick={() => setShowSettingsDialog(true, "relays")}
                        >
                            <div className="flex items-center gap-3">
                                <div className="p-1.5 rounded-md bg-blue-500/10 text-blue-500">
                                    <Server className="h-4 w-4" />
                                </div>
                                <span className="font-medium text-xs">中继器管理</span>
                            </div>
                            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
                        </button>

                        <button
                            className="w-full flex items-center justify-between p-3 bg-card hover:bg-accent/50 transition-colors border-b border-border/50"
                            onClick={() => setShowSettingsDialog(true, "profile")}
                        >
                            <div className="flex items-center gap-3">
                                <div className="p-1.5 rounded-md bg-purple-500/10 text-purple-500">
                                    <User className="h-4 w-4" />
                                </div>
                                <span className="font-medium text-xs">个人资料</span>
                            </div>
                            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
                        </button>

                        <button
                            className="w-full flex items-center justify-between p-3 bg-card hover:bg-accent/50 transition-colors border-b border-border/50"
                            onClick={() => setShowSettingsDialog(true, "account")}
                        >
                            <div className="flex items-center gap-3">
                                <div className="p-1.5 rounded-md bg-green-500/10 text-green-500">
                                    <Key className="h-4 w-4" />
                                </div>
                                <span className="font-medium text-xs">账户与安全</span>
                            </div>
                            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
                        </button>

                        <button
                            className="w-full flex items-center justify-between p-3 bg-card hover:bg-accent/50 transition-colors border-b border-border/50"
                            onClick={() => setShowSettingsDialog(true, "storage")}
                        >
                            <div className="flex items-center gap-3">
                                <div className="p-1.5 rounded-md bg-orange-500/10 text-orange-500">
                                    <Database className="h-4 w-4" />
                                </div>
                                <span className="font-medium text-xs">存储管理</span>
                            </div>
                            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
                        </button>

                        {showDevFeatures && (
                            <button
                                className="w-full flex items-center justify-between p-3 bg-card hover:bg-accent/50 transition-colors border-b border-border/50"
                                onClick={() => setShowSettingsDialog(true, "notifications")}
                            >
                                <div className="flex items-center gap-3">
                                    <div className="p-1.5 rounded-md bg-red-500/10 text-red-500">
                                        <Bell className="h-4 w-4" />
                                    </div>
                                    <span className="font-medium text-xs">推送通知</span>
                                </div>
                                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
                            </button>
                        )}

                        {showDevFeatures && (
                            <button
                                className="w-full flex items-center justify-between p-3 bg-card hover:bg-accent/50 transition-colors border-b border-border/50"
                                onClick={() => setShowSettingsDialog(true, "bookmarks")}
                            >
                                <div className="flex items-center gap-3">
                                    <div className="p-1.5 rounded-md bg-cyan-500/10 text-cyan-500">
                                        <Globe className="h-4 w-4" />
                                    </div>
                                    <span className="font-medium text-xs">网络书签</span>
                                </div>
                                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
                            </button>
                        )}

                        <button
                            className="w-full flex items-center justify-between p-3 bg-card hover:bg-accent/50 transition-colors border-b border-border/50"
                            onClick={() => setShowSettingsDialog(true, "appearance")}
                        >
                            <div className="flex items-center gap-3">
                                <div className="p-1.5 rounded-md bg-pink-500/10 text-pink-500">
                                    <Palette className="h-4 w-4" />
                                </div>
                                <span className="font-medium text-xs">外观设计</span>
                            </div>
                            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
                        </button>

                        <button
                            className="w-full flex items-center justify-between p-3 bg-card hover:bg-accent/50 transition-colors"
                            onClick={() => setShowSettingsDialog(true, "privacy")}
                        >
                            <div className="flex items-center gap-3">
                                <div className="p-1.5 rounded-md bg-slate-500/10 text-slate-500">
                                    <Shield className="h-4 w-4" />
                                </div>
                                <span className="font-medium text-xs">隐私保护</span>
                            </div>
                            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
                        </button>
                    </div>

                    <AlertDialog open={showLogoutConfirm} onOpenChange={setShowLogoutConfirm}>
                        <AlertDialogTrigger asChild>
                            <Button
                                variant="destructive"
                                className="w-full h-9 text-xs"
                            >
                                <LogOut className="mr-2 h-3.5 w-3.5" />
                                退出登录
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="w-[calc(100%-32px)] rounded-xl">
                            <AlertDialogHeader>
                                <AlertDialogTitle>确认退出登录？</AlertDialogTitle>
                                <AlertDialogDescription>
                                    退出后需要重新输入私钥登录。请确保您已备份私钥。
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter className="flex-row gap-3 sm:flex-row sm:justify-end">
                                <AlertDialogCancel className="flex-1 mt-0 rounded-lg">取消</AlertDialogCancel>
                                <AlertDialogAction
                                    onClick={(e) => {
                                        e.preventDefault();
                                        handleLogout();
                                    }}
                                    className="flex-1 rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                    确认退出
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>

                    <p
                        className="text-center px-4 text-xs text-muted-foreground pb-4"
                        onClick={handleVersionClick}
                    >
                        {appVersion ? `Ostia v${appVersion}` : "Ostia"}
                    </p>
                </div>
            </div>
        </div>
    );
}
