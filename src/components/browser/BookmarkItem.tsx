import { useState } from "react";
import { MoreVertical, Trash2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Bookmark, useBrowserStore } from "@/store/browserStore";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useUIStore } from "@/store/uiStore";

interface BookmarkItemProps {
    bookmark: Bookmark;
}

// 打开书签 - 桌面端使用独立窗口，移动端使用系统浏览器
async function openBookmark(url: string, isMobile: boolean) {
    try {
        if (isMobile) {
            // 移动端：显示内建叠加层（实际上是跳转提示）
            useBrowserStore.getState().setActiveBrowserUrl(url);
            // toast.info("正在链接到浏览器..."); // Overlay already shows a spinner
        } else {
            // 桌面端：创建独立窗口
            const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
            const windowLabel = `w_${Date.now()}`;
            new WebviewWindow(windowLabel, {
                url,
                title: new URL(url).hostname,
                width: 1200,
                height: 800,
                center: true,
                resizable: true,
            });
        }
    } catch (error) {
        console.error("Failed to open bookmark:", error);
        toast.error("打开失败");
    }
}

export function BookmarkItem({ bookmark }: BookmarkItemProps) {
    const { removeBookmark } = useBrowserStore();
    const isMobile = useUIStore((s) => s.isMobile);
    const [isHovered, setIsHovered] = useState(false);

    const handleClick = () => {
        openBookmark(bookmark.url, isMobile);
    };

    const handleDelete = (e: React.MouseEvent) => {
        e.stopPropagation();
        removeBookmark(bookmark.id);
        toast.success("书签已删除");
    };

    return (
        <div
            className="group relative aspect-square rounded-xl cursor-pointer transition-all duration-200 hover:scale-105 hover:shadow-lg"
            style={{ backgroundColor: bookmark.color }}
            onClick={handleClick}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            {/* Content */}
            <div className="absolute inset-0 flex flex-col items-center justify-center p-2">
                {bookmark.icon ? (
                    <img
                        src={bookmark.icon}
                        alt={bookmark.title}
                        className="w-8 h-8 mb-1.5 rounded-md bg-white/20 p-1"
                        onError={(e) => {
                            (e.target as HTMLImageElement).style.display = "none";
                        }}
                    />
                ) : (
                    <div className="w-8 h-8 mb-1.5 rounded-md bg-white/20 flex items-center justify-center">
                        <ExternalLink className="w-4 h-4 text-white/80" />
                    </div>
                )}
                <span className="text-[0.625rem] font-medium text-white text-center line-clamp-2 leading-tight">
                    {bookmark.title}
                </span>
            </div>

            {/* Menu */}
            <div
                className={`absolute top-1 right-1 transition-opacity ${isHovered ? "opacity-100" : "opacity-0"
                    }`}
            >
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button
                            className="p-1 rounded-md bg-black/20 hover:bg-black/40 transition-colors"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <MoreVertical className="w-3 h-3 text-white" />
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-32">
                        <DropdownMenuItem
                            className="text-xs text-destructive focus:text-destructive"
                            onClick={handleDelete}
                        >
                            <Trash2 className="w-3 h-3 mr-2" />
                            删除
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </div>
    );
}
