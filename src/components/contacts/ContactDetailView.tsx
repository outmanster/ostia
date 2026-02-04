import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useContactStore } from "@/store/contactStore";
import { useUIStore } from "@/store/uiStore";
import { cn } from "@/lib/utils";
import { MessageSquare, Shield, ShieldOff, Trash2, Copy, Check, Edit2, X, CheckCircle2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { toast } from "sonner";
import { truncateNpub } from "@/utils/format";

type ContactDetailViewProps = {
    onStartChat?: () => void;
    className?: string;
};

export function ContactDetailView({ onStartChat, className }: ContactDetailViewProps) {
    const { selectedContact, blockContact, removeContact, selectContact, updateRemark } = useContactStore();
    const { setActiveTab, isMobile } = useUIStore();
    const [isCopied, setIsCopied] = useState(false);
    const [isEditingRemark, setIsEditingRemark] = useState(false);
    const [remarkValue, setRemarkValue] = useState("");

    if (!selectedContact) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center bg-muted/5 h-full p-6 text-center">
                <div className="w-20 h-20 bg-muted/30 rounded-full flex items-center justify-center mb-6">
                    <MessageSquare className="h-10 w-10 text-muted-foreground opacity-20" />
                </div>
                <h2 className="text-xl font-semibold mb-2">联系人详情</h2>
                <p className="text-muted-foreground text-sm max-w-xs">
                    从左侧列表选择一个联系人来查看详细信息。
                </p>
            </div>
        );
    }

    const handleCopyNpub = () => {
        navigator.clipboard.writeText(selectedContact.npub);
        setIsCopied(true);
        toast.success("公钥已复制到剪贴板");
        setTimeout(() => setIsCopied(false), 2000);
    };

    const startChat = () => {
        if (selectedContact) {
            selectContact(selectedContact);
        }
        setActiveTab("chats");
        onStartChat?.();
    };

    const toggleBlock = async () => {
        if (!selectedContact) return;
        const newStatus = !selectedContact.blocked;
        await blockContact(selectedContact.npub, newStatus);
        toast.success(newStatus ? "已屏蔽联系人" : "已取消屏蔽");
    };

    const handleSaveRemark = async () => {
        if (!selectedContact) return;
        try {
            await updateRemark(selectedContact.npub, remarkValue.trim() || null);
            setIsEditingRemark(false);
            toast.success("备注已更新");
        } catch (error) {
            toast.error("更新失败");
        }
    };

    const startEditing = () => {
        setRemarkValue(selectedContact?.remark || "");
        setIsEditingRemark(true);
    };

    const getDisplayName = () => {
        if (!selectedContact) return "";
        return selectedContact.remark || selectedContact.displayName || selectedContact.name || "未命名";
    };

    const getInitials = () => {
        if (!selectedContact) return "";
        const name = selectedContact.remark || selectedContact.displayName || selectedContact.name;
        if (name) return name.slice(0, 2).toUpperCase();
        return selectedContact.npub.slice(5, 7).toUpperCase();
    };

    return (
        <div className={cn("flex-1 flex flex-col h-full bg-background overflow-y-auto", className)}>
            <div className="max-w-2xl mx-auto w-full px-6 py-8 space-y-8">
                {/* Profile Header */}
                <div className="flex flex-col items-start text-left space-y-4">
                    <Avatar className="h-20 w-20 border-4 border-background shadow-xl">
                        <AvatarImage src={selectedContact.picture} />
                        <AvatarFallback className="text-2xl font-bold bg-muted">
                            {getInitials()}
                        </AvatarFallback>
                    </Avatar>

                    <div className="space-y-3 w-full">
                        {isEditingRemark ? (
                            <div className="flex flex-col items-start gap-3 w-full max-w-sm">
                                <div className="relative w-full">
                                    <Input
                                        value={remarkValue}
                                        onChange={(e) => setRemarkValue(e.target.value)}
                                        placeholder="设置备注名..."
                                        className="h-9 text-left text-lg font-bold rounded-lg pr-10"
                                        autoFocus
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") handleSaveRemark();
                                            if (e.key === "Escape") setIsEditingRemark(false);
                                        }}
                                    />
                                    {remarkValue && (
                                        <button
                                            onClick={() => setRemarkValue("")}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                        >
                                            <X className="h-3.5 w-3.5" />
                                        </button>
                                    )}
                                </div>
                                <div className="flex gap-2">
                                    <Button size="sm" variant="ghost" onClick={() => setIsEditingRemark(false)} className="h-8">取消</Button>
                                    <Button size="sm" className="gap-1 h-8" onClick={handleSaveRemark}>
                                        <CheckCircle2 className="h-3.5 w-3.5" />
                                        保存
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col items-start group">
                                <h1 className="text-xl font-bold tracking-tight inline-flex items-center gap-2 group">
                                    {getDisplayName()}
                                    <button
                                        onClick={startEditing}
                                        className={cn(
                                            "p-1 hover:bg-muted rounded-full transition-all text-muted-foreground hover:text-primary",
                                            isMobile ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                                        )}
                                        title="修改备注"
                                    >
                                        <Edit2 className="h-3.5 w-3.5" />
                                    </button>
                                </h1>
                                {(selectedContact.remark) && (
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        原名: {selectedContact.displayName || selectedContact.name || "未命名"}
                                    </p>
                                )}
                            </div>
                        )}

                        <div className="flex flex-col items-start gap-2">
                            <div
                                onClick={handleCopyNpub}
                                className="group flex items-center gap-2 px-2.5 py-1 bg-muted/50 rounded-full cursor-pointer hover:bg-muted transition-colors"
                            >
                                <code className="text-[0.65rem] font-mono text-muted-foreground">
                                    {truncateNpub(selectedContact.npub, 16)}
                                </code>
                                {isCopied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3 text-muted-foreground group-hover:text-foreground" />}
                            </div>

                            {selectedContact.blocked && (
                                <div className="flex items-center gap-1.5 px-2 py-0.5 bg-destructive/10 text-destructive rounded-full text-xs font-bold uppercase tracking-wider">
                                    <Shield className="h-3 w-3" />
                                    已屏蔽
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="grid grid-cols-2 gap-3">
                    <Button
                        className="h-9 gap-2 text-sm shadow-sm"
                        onClick={startChat}
                    >
                        <MessageSquare className="h-4 w-4" />
                        开始聊天
                    </Button>
                    <Button
                        variant="outline"
                        className={`h-9 gap-2 text-sm shadow-sm ${selectedContact.blocked ? "text-primary hover:text-primary" : "text-muted-foreground"}`}
                        onClick={toggleBlock}
                    >
                        {selectedContact.blocked ? (
                            <>
                                <ShieldOff className="h-4 w-4" />
                                取消屏蔽
                            </>
                        ) : (
                            <>
                                <Shield className="h-4 w-4" />
                                屏蔽此人
                            </>
                        )}
                    </Button>
                </div>

                {/* Danger Zone */}
                <div className="pt-6 border-t">
                    <h3 className="text-xs font-semibold text-destructive mb-3 uppercase tracking-wider">危险区域</h3>
                    <Button
                        variant="ghost"
                        className="w-full justify-start h-9 text-destructive hover:bg-destructive/5 hover:text-destructive group text-sm"
                        onClick={() => {
                            if (confirm("确定要删除此联系人吗？聊天记录也将被清空。")) {
                                removeContact(selectedContact.npub);
                                selectContact(null);
                            }
                        }}
                    >
                        <Trash2 className="h-4 w-4 mr-2" />
                        删除联系人
                    </Button>
                </div>
            </div>
        </div>
    );
}
