import { MessageSquare, Users, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUIStore } from "@/store/uiStore";
import { useContactStore } from "@/store/contactStore";
import { cn } from "@/lib/utils";

export function BottomNav() {
    const activeTab = useUIStore(s => s.activeTab);
    const setActiveTab = useUIStore(s => s.setActiveTab);
    const chatSessions = useContactStore(s => s.chatSessions);
    const totalUnread = chatSessions.reduce((acc, session) => acc + session.unread_count, 0);

    return (
        <div className="min-h-[4rem] border-t bg-background/85 backdrop-blur-md flex items-center justify-around px-4 pt-2 pb-safe z-40 shrink-0">
            <Button
                variant="ghost"
                className={cn(
                    "flex flex-col items-center gap-1 h-auto py-1 px-4 hover:bg-transparent transition-colors relative",
                    activeTab === "chats" ? "text-primary" : "text-muted-foreground"
                )}
                onClick={() => setActiveTab("chats")}
            >
                <div className="relative">
                    <MessageSquare className={cn("h-7 w-7", activeTab === "chats" && "fill-current")} />
                    {totalUnread > 0 && (
                        <span className="absolute -top-1 -right-1.5 flex min-w-[16px] h-[16px] items-center justify-center rounded-full bg-red-500 text-[0.625rem] leading-none font-bold text-white ring-2 ring-background shadow-sm px-0.5 z-10">
                          {totalUnread > 99 ? "99+" : totalUnread}
                        </span>
                    )}
                </div>
                <span className="text-[0.625rem] font-medium">消息</span>
            </Button>

            <Button
                variant="ghost"
                className={cn(
                    "flex flex-col items-center gap-1 h-auto py-1 px-4 hover:bg-transparent transition-colors",
                    activeTab === "contacts" ? "text-primary" : "text-muted-foreground"
                )}
                onClick={() => setActiveTab("contacts")}
            >
                <Users className={cn("h-7 w-7", activeTab === "contacts" && "fill-current")} />
                <span className="text-[0.625rem] font-medium">联系人</span>
            </Button>

            <Button
                variant="ghost"
                className={cn(
                    "flex flex-col items-center gap-1 h-auto py-1 px-4 hover:bg-transparent transition-colors",
                    activeTab === "settings" ? "text-primary" : "text-muted-foreground"
                )}
                onClick={() => setActiveTab("settings")}
            >
                <Settings className={cn("h-7 w-7", activeTab === "settings" && "fill-current")} />
                <span className="text-[0.625rem] font-medium">设置</span>
            </Button>
        </div>
    );
}
