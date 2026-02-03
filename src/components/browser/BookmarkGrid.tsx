import { useState } from "react";
import { Plus, Trash2, Globe, Eraser } from "lucide-react";
import { toast } from "sonner";
import { useBrowserStore } from "@/store/browserStore";
import { BookmarkItem } from "./BookmarkItem";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
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
import { ScrollArea } from "@/components/ui/scroll-area";

interface BookmarkGridProps {
    isMobile?: boolean;
}

// 清除浏览器数据（Cookie、缓存等）
async function clearBrowsingData() {
    try {
        const { getCurrentWebview } = await import("@tauri-apps/api/webview");
        const webview = getCurrentWebview();
        await webview.clearAllBrowsingData();
        toast.success("浏览器数据已清除（Cookie、缓存等）");
    } catch (error) {
        console.error("Failed to clear browsing data:", error);
        toast.error("清除浏览器数据失败");
    }
}

export function BookmarkGrid({ isMobile = false }: BookmarkGridProps) {
    const { bookmarks, addBookmark, clearAll, isLoading } = useBrowserStore();
    const [showAddDialog, setShowAddDialog] = useState(false);
    const [newUrl, setNewUrl] = useState("");

    const handleAdd = async () => {
        if (!newUrl.trim()) {
            toast.error("请输入网址");
            return;
        }
        await addBookmark(newUrl.trim());
        setNewUrl("");
        setShowAddDialog(false);
        toast.success("书签已添加");
    };

    const handleClearAll = () => {
        clearAll();
        toast.success("所有书签已清除");
    };

    return (
        <div className="h-full flex flex-col">
            {/* Header */}
            <div className={`mb-4 ${isMobile ? "space-y-3" : "flex items-center justify-between"}`}>
                {!isMobile && (
                    <div className="flex items-center gap-2">
                        <Globe className="h-4 w-4 text-primary" />
                        <span className="text-xs font-semibold">网络书签</span>
                    </div>
                )}
                <div className={`flex items-center ${isMobile ? "justify-between" : "gap-2"}`}>
                    {!isMobile && (
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className={`${isMobile ? "h-8 px-2" : "h-7"} text-xs text-amber-600 hover:text-amber-600`}
                                >
                                    <Eraser className="h-3 w-3 mr-1" />
                                    清除痕迹
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent className={isMobile ? "w-[calc(100%-32px)] rounded-xl" : ""}>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>确认清除浏览器数据？</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        将清除所有 Cookie、缓存和浏览数据。已登录的网站将需要重新登录。
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter className={isMobile ? "flex-row gap-3 sm:flex-row sm:justify-end" : ""}>
                                    <AlertDialogCancel className={isMobile ? "flex-1 mt-0 rounded-lg" : ""}>取消</AlertDialogCancel>
                                    <AlertDialogAction
                                        onClick={clearBrowsingData}
                                        className={`bg-amber-600 text-white hover:bg-amber-700 ${isMobile ? "flex-1 rounded-lg" : ""}`}
                                    >
                                        确认清除
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    )}
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button
                                variant="ghost"
                                size="sm"
                                className={`${isMobile ? "h-8 px-2" : "h-7"} text-xs text-destructive hover:text-destructive`}
                                disabled={bookmarks.length === 0}
                            >
                                <Trash2 className="h-3 w-3 mr-1" />
                                清空书签
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className={isMobile ? "w-[calc(100%-32px)] rounded-xl" : ""}>
                            <AlertDialogHeader>
                                <AlertDialogTitle>确认清空所有书签？</AlertDialogTitle>
                                <AlertDialogDescription>
                                    此操作不可撤销，所有书签将被永久删除。
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter className={isMobile ? "flex-row gap-3 sm:flex-row sm:justify-end" : ""}>
                                <AlertDialogCancel className={isMobile ? "flex-1 mt-0 rounded-lg" : ""}>取消</AlertDialogCancel>
                                <AlertDialogAction
                                    onClick={handleClearAll}
                                    className={`bg-destructive text-destructive-foreground hover:bg-destructive/90 ${isMobile ? "flex-1 rounded-lg" : ""}`}
                                >
                                    确认清空
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                    <Button
                        variant="outline"
                        size="sm"
                        className={`${isMobile ? "h-8 px-3" : "h-7"} text-xs`}
                        onClick={() => setShowAddDialog(true)}
                    >
                        <Plus className="h-3 w-3 mr-1" />
                        添加
                    </Button>
                </div>
            </div>

            {/* Grid */}
            <ScrollArea className="flex-1">
                {bookmarks.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                        <Globe className="h-12 w-12 text-muted-foreground/30 mb-4" />
                        <p className="text-sm text-muted-foreground mb-2">暂无书签</p>
                        <p className="text-xs text-muted-foreground/70">
                            点击"添加"按钮添加你的第一个网络书签
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3 pb-4">
                        {bookmarks.map((bookmark) => (
                            <BookmarkItem key={bookmark.id} bookmark={bookmark} />
                        ))}
                    </div>
                )}
            </ScrollArea>

            {/* Add Dialog */}
            <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
                <DialogContent className={isMobile ? "w-[calc(100%-32px)] rounded-xl" : "sm:max-w-md"}>
                    <DialogHeader>
                        <DialogTitle>添加书签</DialogTitle>
                        <DialogDescription>
                            输入网址，系统将自动获取图标和标题
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        <Input
                            placeholder="例如: google.com"
                            value={newUrl}
                            onChange={(e) => setNewUrl(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                            className="font-mono text-sm"
                            autoFocus
                        />
                    </div>
                    <DialogFooter className={isMobile ? "flex-row gap-3 sm:flex-row sm:justify-end" : ""}>
                        <Button
                            variant="outline"
                            onClick={() => setShowAddDialog(false)}
                            className={isMobile ? "flex-1" : ""}
                        >
                            取消
                        </Button>
                        <Button
                            onClick={handleAdd}
                            disabled={isLoading}
                            className={isMobile ? "flex-1" : ""}
                        >
                            {isLoading ? "添加中..." : "添加"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
