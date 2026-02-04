import { Search, User, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useContactStore } from "@/store/contactStore";
import { usePresenceStore } from "@/store/presenceStore";
import { useState, useMemo } from "react";
import type { Contact } from "@/types";
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { DeleteContactDialog } from "@/components/contacts/DeleteContactDialog";

interface ContactListProps {
    onSelect: (contact: Contact) => void;
    onAddContact?: () => void;
    selectedNpub?: string;
    className?: string;
    showAddButton?: boolean;
    header?: React.ReactNode;
}

export function ContactList({
    onSelect,
    onAddContact,
    selectedNpub,
    className = "",
    showAddButton = true,
    header
}: ContactListProps) {
    const { contacts, isLoading } = useContactStore();
    const [searchQuery, setSearchQuery] = useState("");
    const [contactToDelete, setContactToDelete] = useState<Contact | null>(null);
    const presenceMap = usePresenceStore(s => s.map);
    const collator = useMemo(() => new Intl.Collator("zh-CN-u-co-pinyin", { sensitivity: "base", numeric: true }), []);

    const letterBoundaries = useMemo(() => ([
        { letter: "A", boundary: "阿" },
        { letter: "B", boundary: "芭" },
        { letter: "C", boundary: "擦" },
        { letter: "D", boundary: "搭" },
        { letter: "E", boundary: "蛾" },
        { letter: "F", boundary: "发" },
        { letter: "G", boundary: "噶" },
        { letter: "H", boundary: "哈" },
        { letter: "J", boundary: "击" },
        { letter: "K", boundary: "喀" },
        { letter: "L", boundary: "拉" },
        { letter: "M", boundary: "妈" },
        { letter: "N", boundary: "拿" },
        { letter: "O", boundary: "哦" },
        { letter: "P", boundary: "啪" },
        { letter: "Q", boundary: "七" },
        { letter: "R", boundary: "然" },
        { letter: "S", boundary: "撒" },
        { letter: "T", boundary: "他" },
        { letter: "W", boundary: "挖" },
        { letter: "X", boundary: "昔" },
        { letter: "Y", boundary: "压" },
        { letter: "Z", boundary: "匝" }
    ]), []);

    const getSortName = (contact: Contact) => {
        return (contact.remark || contact.displayName || contact.name || contact.npub).trim();
    };

    const getGroupLetter = (name: string) => {
        const trimmed = name.trim();
        if (!trimmed) return "#";
        const first = trimmed.charAt(0);
        if (/[A-Za-z]/.test(first)) return first.toUpperCase();
        if (/[0-9]/.test(first)) return "#";
        for (let i = letterBoundaries.length - 1; i >= 0; i -= 1) {
            if (collator.compare(trimmed, letterBoundaries[i].boundary) >= 0) {
                return letterBoundaries[i].letter;
            }
        }
        return "#";
    };

    const filteredContacts = useMemo(() => {
        return contacts.filter((contact) => {
            const query = searchQuery.toLowerCase();
            const name = contact.name?.toLowerCase() ?? "";
            const displayName = contact.displayName?.toLowerCase() ?? "";
            const remark = contact.remark?.toLowerCase() ?? "";
            const npubStr = contact.npub.toLowerCase();
            return (
                name.includes(query) ||
                displayName.includes(query) ||
                remark.includes(query) ||
                npubStr.includes(query)
            );
        });
    }, [contacts, searchQuery]);

    const groupedContacts = useMemo(() => {
        const groups: Record<string, Contact[]> = {};
        
        filteredContacts.forEach(contact => {
            const name = getSortName(contact);
            const letter = getGroupLetter(name);
            if (!groups[letter]) {
                groups[letter] = [];
            }
            groups[letter].push(contact);
        });

        const sortedKeys = Object.keys(groups).sort((a, b) => {
            if (a === "#") return 1;
            if (b === "#") return -1;
            return a.localeCompare(b, "en");
        });

        return sortedKeys.map(key => ({
            letter: key,
            contacts: groups[key].sort((a, b) => {
                 const nameA = getSortName(a);
                 const nameB = getSortName(b);
                 return collator.compare(nameA, nameB);
            })
        }));
    }, [collator, filteredContacts, letterBoundaries]);

    const groupIndex = useMemo(() => groupedContacts.map(group => group.letter), [groupedContacts]);

    const jumpToGroup = (letter: string) => {
        const target = document.getElementById(`contact-group-${letter}`);
        if (target) {
            target.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    };

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

    return (
        <div className={`flex flex-col h-full ${className}`}>
            {/* Search Area */}
            <div className="p-2 shrink-0">
                <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                        placeholder="搜索..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-8 bg-muted/40 border-none h-8 text-sm rounded-lg focus-visible:ring-1"
                    />
                </div>
            </div>

            {/* Contact List */}
            <ScrollArea className="flex-1">
                <div className="pb-24 min-h-full">
                    {header}
                    {isLoading ? (
                        <div className="p-8 text-center text-muted-foreground text-sm flex flex-col items-center gap-2">
                             <div className="w-4 h-4 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
                            加载中...
                        </div>
                    ) : filteredContacts.length === 0 ? (
                        <div className="p-8 text-center text-muted-foreground flex flex-col items-center mt-10">
                            {contacts.length === 0 ? (
                                <div className="space-y-4 flex flex-col items-center">
                                    <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center">
                                        <User className="h-8 w-8 opacity-40" />
                                    </div>
                                    <div className="text-sm space-y-1">
                                        <p className="font-medium">暂无联系人</p>
                                        <p className="text-xs text-muted-foreground">添加好友开始聊天</p>
                                    </div>
                                    {showAddButton && onAddContact && (
                                        <Button
                                            className="rounded-full px-6 h-8 text-xs"
                                            onClick={onAddContact}
                                        >
                                            添加联系人
                                        </Button>
                                    )}
                                </div>
                            ) : (
                                "未找到匹配的联系人"
                            )}
                        </div>
                    ) : (
                        <div className="relative">
                            {groupedContacts.map((group) => (
                                <div key={group.letter} className="mb-1">
                                    <div
                                        id={`contact-group-${group.letter}`}
                                        className="px-4 py-1.5 text-xs font-semibold text-muted-foreground/70 bg-background/95 sticky top-0 backdrop-blur-md z-10"
                                    >
                                        {group.letter}
                                    </div>
                                    <div className="px-2 pt-2 pb-1 space-y-0.5">
                                        {group.contacts.map((contact, index) => {
                                            const presence = presenceMap.get(contact.npub);
                                            const isLast = index === group.contacts.length - 1;
                                            return (
                                                <ContextMenu key={contact.npub}>
                                                    <ContextMenuTrigger>
                                                        <button
                                                            onClick={() => onSelect(contact)}
                                                            className={`w-full flex items-center gap-3 px-2.5 py-2 rounded-md transition-all text-left group active:scale-[0.99]
                                                                ${selectedNpub === contact.npub
                                                                    ? "bg-primary/10 text-primary-foreground"
                                                                    : "hover:bg-muted/50 active:bg-muted/60 text-foreground"
                                                                }`}
                                                        >
                                                            <div className="relative shrink-0">
                                                                <Avatar className={`h-9 w-9 border border-border/10 transition-transform group-active:scale-95 ${selectedNpub === contact.npub ? "ring-2 ring-primary ring-offset-2" : ""}`}>
                                                                    <AvatarImage src={contact.picture} />
                                                                    <AvatarFallback className="bg-muted text-muted-foreground font-medium text-[0.625rem]">
                                                                        {getInitials(contact)}
                                                                    </AvatarFallback>
                                                                </Avatar>
                                                                {presence?.online && (
                                                                    <span className="absolute bottom-0 right-0 h-2 w-2 rounded-full bg-green-500 border-2 border-background ring-1 ring-background" />
                                                                )}
                                                            </div>
                                                            
                                                            <div className={`flex-1 min-w-0 py-0.5 ${!isLast ? "border-b border-border/40" : ""}`}>
                                                                <div className="flex justify-between items-center">
                                                                    <p className={`font-medium truncate text-sm ${selectedNpub === contact.npub ? "text-primary" : "text-foreground"}`}>
                                                                        {getDisplayName(contact)}
                                                                    </p>
                                                                </div>
                                                                <p className="text-[0.625rem] text-muted-foreground/60 truncate font-mono mt-0.5">
                                                                    {contact.npub.slice(0, 10)}...{contact.npub.slice(-4)}
                                                                </p>
                                                            </div>
                                                        </button>
                                                    </ContextMenuTrigger>
                                                    <ContextMenuContent>
                                                        <ContextMenuItem
                                                            className="text-destructive focus:text-destructive gap-2 text-xs"
                                                            onClick={() => setContactToDelete(contact)}
                                                        >
                                                            <Trash2 className="h-3.5 w-3.5" />
                                                            删除联系人
                                                        </ContextMenuItem>
                                                    </ContextMenuContent>
                                                </ContextMenu>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                            {groupIndex.length > 1 && (
                                <div className="absolute right-0.5 top-6 z-20 flex flex-col items-center gap-0.5 text-[0.625rem] text-muted-foreground/70">
                                    {groupIndex.map((letter) => (
                                        <button
                                            key={`index-${letter}`}
                                            className="px-0.5 leading-none hover:text-foreground"
                                            onClick={() => jumpToGroup(letter)}
                                        >
                                            {letter}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </ScrollArea>

            <DeleteContactDialog
                open={!!contactToDelete}
                onOpenChange={(open) => !open && setContactToDelete(null)}
                contactNpub={contactToDelete?.npub || null}
                contactName={contactToDelete ? getDisplayName(contactToDelete) : null}
            />
        </div>
    );
}
