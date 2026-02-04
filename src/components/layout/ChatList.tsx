import { Search, MessageSquare } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useContactStore } from "@/store/contactStore";
import { usePresenceStore } from "@/store/presenceStore";
import { useState, useEffect } from "react";
import type { ChatSession, Contact } from "@/types";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";

interface ChatListProps {
    onSelect: (contact: Contact) => void;
    selectedNpub?: string;
    className?: string;
    header?: React.ReactNode;
}

export function ChatList({
    onSelect,
    selectedNpub,
    className = "",
    header,
}: ChatListProps) {
    const chatSessions = useContactStore(s => s.chatSessions);
    const presenceMap = usePresenceStore(s => s.map);
    const [searchQuery, setSearchQuery] = useState("");
    const [searchNpubs, setSearchNpubs] = useState<string[]>([]);

    useEffect(() => {
        // Use getState() to avoid dependency instability
        useContactStore.getState().loadChatSessions();
    }, []);

    // Handle debounced FTS search
    useEffect(() => {
        if (!searchQuery.trim()) {
            setSearchNpubs([]);
            return;
        }

        const timer = setTimeout(async () => {
            try {
                const results = await invoke<string[]>("search_contacts_by_message", { query: searchQuery });
                setSearchNpubs(results);
            } catch (error) {
                console.error("FTS Search failed:", error);
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [searchQuery]);

    const filteredSessions = chatSessions.filter((session) => {
        const query = searchQuery.toLowerCase();
        const name = session.contact.name?.toLowerCase() ?? "";
        const displayName = session.contact.displayName?.toLowerCase() ?? "";
        const remark = session.contact.remark?.toLowerCase() ?? "";
        const lastMessage = session.last_message.toLowerCase();

        return (
            name.includes(query) ||
            displayName.includes(query) ||
            remark.includes(query) ||
            lastMessage.includes(query) ||
            searchNpubs.includes(session.contact.npub)
        );
    });

    const getDisplayName = (contact: Contact) => {
        return contact.remark || contact.displayName || contact.name || contact.npub.slice(0, 12) + "...";
    };

    const getInitials = (contact: Contact) => {
        const name = contact.remark || contact.displayName || contact.name;
        if (name) {
            return name.slice(0, 2).toUpperCase();
        }
        return contact.npub.slice(5, 7).toUpperCase();
    };

    const formatTime = (timestamp: number) => {
        try {
            return formatDistanceToNow(timestamp * 1000, {
                addSuffix: true,
                locale: zhCN,
            });
        } catch {
            return "";
        }
    };

    return (
        <div className={`flex flex-col h-full ${className}`}>
            {/* Search Area */}
            <div className="p-3 shrink-0">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                        placeholder="搜索..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9 bg-muted/40 border-none h-8 text-sm rounded-lg focus-visible:ring-1"
                    />
                </div>
            </div>

            {/* Sessions List */}
            <ScrollArea className="flex-1 px-1">
                <div className="pb-24 min-h-full">
                    {header}
                    {filteredSessions.length === 0 ? (
                        <div className="p-8 text-center text-muted-foreground h-full flex flex-col items-center justify-center space-y-4">
                            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                                <MessageSquare className="h-6 w-6 opacity-50" />
                            </div>
                            <div className="text-sm">
                                <p>暂无消息</p>
                                <p className="text-xs opacity-60 mt-1">去联系人页面打个招呼吧</p>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-0.5 py-1">
                            {filteredSessions.map((session: ChatSession, index) => {
                                const presence = presenceMap.get(session.contact.npub);
                                const isLast = index === filteredSessions.length - 1;
                                return (
                                    <button
                                        key={session.contact.npub}
                                        onClick={() => onSelect(session.contact)}
                                        className={`w-full flex items-center gap-3 p-2 rounded-lg transition-all text-left group active:scale-[0.99] ${selectedNpub === session.contact.npub
                                            ? "bg-primary/10 text-primary-foreground"
                                            : "hover:bg-muted/50 active:bg-muted/60 text-foreground"
                                            }`}
                                    >
                                        <div className="relative shrink-0">
                                            <Avatar className={`h-10 w-10 border border-border/10 transition-transform group-active:scale-95 ${selectedNpub === session.contact.npub ? "ring-2 ring-primary ring-offset-2" : ""}`}>
                                                <AvatarImage src={session.contact.picture} />
                                                <AvatarFallback
                                                    className={
                                                        selectedNpub === session.contact.npub
                                                            ? "bg-primary-foreground/10 text-primary-foreground"
                                                            : "bg-muted text-muted-foreground font-medium text-xs"
                                                    }
                                                >
                                                    {getInitials(session.contact)}
                                                </AvatarFallback>
                                            </Avatar>
                                            {presence?.online && (
                                                <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-green-500 border-2 border-background ring-1 ring-background" />
                                            )}
                                            {session.unread_count > 0 && (
                                                <span className="absolute -top-1 -right-1 flex min-w-[16px] h-[16px] items-center justify-center rounded-full bg-red-500 text-[10px] leading-none font-bold text-white ring-2 ring-background shadow-sm px-0.5 z-10">
                                                    {session.unread_count > 99 ? "99+" : session.unread_count}
                                                </span>
                                            )}
                                        </div>
                                        <div className={`flex-1 min-w-0 py-1.5 ${!isLast ? "border-b border-border/40" : ""}`}>
                                            <div className="flex justify-between items-center">
                                                <p
                                                    className={`font-medium truncate text-sm ${selectedNpub === session.contact.npub ? "text-primary" : "text-foreground"}`}
                                                >
                                                    <span>{getDisplayName(session.contact)}</span>
                                                </p>
                                                <span
                                                    className="text-xs shrink-0 font-medium text-muted-foreground/70"
                                                >
                                                    {formatTime(session.last_timestamp)}
                                                </span>
                                            </div>
                                            <p
                                                className="text-xs text-muted-foreground/60 truncate mt-0.5"
                                            >
                                                {session.lastMessageType === 'image' ? '[图片]' : session.last_message}
                                            </p>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            </ScrollArea>
        </div>
    );
}
