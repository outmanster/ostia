import { useEffect } from "react";
import { Globe } from "lucide-react";
import { useBrowserStore } from "@/store/browserStore";
import { toast } from "sonner";

export function MobileBrowserOverlay() {
    const { activeBrowserUrl, setActiveBrowserUrl } = useBrowserStore();

    useEffect(() => {
        if (!activeBrowserUrl) return;

        // 最终确认：移动端（iOS & Android）暂不支持多 Webview (Webview API unavailable)。
        // 统一使用系统浏览器跳转。
        openSystemBrowser();

        async function openSystemBrowser() {
            try {
                const { openUrl } = await import("@tauri-apps/plugin-opener");
                // 给予一点 UI 响应时间
                await new Promise(resolve => setTimeout(resolve, 300));
                await openUrl(activeBrowserUrl!);
                toast.success("已跳转系统浏览器");
            } catch (e) {
                console.error("Failed to open system browser", e);
                toast.error("无法打开浏览器");
            } finally {
                setTimeout(() => {
                    setActiveBrowserUrl(null);
                }, 500);
            }
        }
    }, [activeBrowserUrl, setActiveBrowserUrl]);

    if (!activeBrowserUrl) return null;

    // Android Render (Simple Overlay)
    return (
        <div className="fixed inset-0 z-[1000] flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-4 p-6 bg-background rounded-xl border shadow-xl animate-in fade-in zoom-in duration-300">
                <Globe className="w-12 h-12 text-primary animate-pulse" />
                <div className="text-center space-y-2">
                    <h3 className="font-semibold text-lg">正在跳转...</h3>
                    <p className="text-xs text-muted-foreground max-w-[200px] truncate">
                        {activeBrowserUrl}
                    </p>
                </div>
            </div>
        </div>
    );
}
