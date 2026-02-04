import { useState, useEffect } from "react";
import { useAuthStore } from "@/store/authStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Save, User, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";

export function ProfileEditor() {
    const { profile, updateProfile, isLoading } = useAuthStore();

    const [formData, setFormData] = useState({
        displayName: "",
        picture: "",
    });

    useEffect(() => {
        if (profile) {
            setFormData({
                displayName: profile.displayName || profile.name || "",
                picture: profile.picture || "",
            });
        }
    }, [profile]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        // 同时更新 name 字段以保证兼容性
        try {
            await updateProfile({
                ...formData,
                name: formData.displayName.toLowerCase().replace(/\s+/g, '_')
            });
            toast.success("个人资料已更新");
        } catch {
            toast.error("更新失败");
        }
    };

    return (
        <div className="space-y-3 mt-0 px-1 pb-4">
            <form onSubmit={handleSubmit} className="space-y-3">
                <div className="p-3 bg-muted/30 rounded-xl border border-border/50 space-y-3">
                    <div className="space-y-1">
                        <span className="text-xs font-semibold flex items-center gap-2">
                            <User className="h-3 w-3 text-primary" />
                            个人信息
                        </span>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                            设置您的基本资料，这些信息将通过中继器共享给您的联系人。
                        </p>
                    </div>

                    <div className="space-y-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="displayName" className="text-xs font-bold uppercase tracking-widest text-muted-foreground">昵称</Label>
                            <div className="relative group">
                                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground transition-colors group-focus-within:text-primary" />
                                <Input
                                    id="displayName"
                                    placeholder="例如: 爱丽丝"
                                    value={formData.displayName}
                                    onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                                    className="pl-9 text-xs bg-background/50 border-border/50 h-9 rounded-sm focus-visible:ring-1 focus-visible:ring-primary/50 transition-all"
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="picture" className="text-xs font-bold uppercase tracking-widest text-muted-foreground">头像地址 (URL)</Label>
                            <div className="relative group">
                                <ImageIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground transition-colors group-focus-within:text-primary" />
                                <Input
                                    id="picture"
                                    placeholder="https://example.com/avatar.png"
                                    value={formData.picture}
                                    onChange={(e) => setFormData({ ...formData, picture: e.target.value })}
                                    className="pl-9 font-mono text-xs bg-background/50 border-border/50 h-9 rounded-sm focus-visible:ring-1 focus-visible:ring-primary/50 transition-all"
                                />
                            </div>

                            <div className="flex justify-center pt-1">
                                <div className="h-16 w-16 rounded-full border-2 border-border/50 bg-muted/20 flex items-center justify-center overflow-hidden">
                                    {formData.picture ? (
                                        <img
                                            src={formData.picture}
                                            alt="预览"
                                            className="h-full w-full object-cover"
                                            onError={(e) => (e.currentTarget.style.display = 'none')}
                                        />
                                    ) : (
                                        <User className="h-6 w-6 text-muted-foreground/30" />
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <Button type="submit" className="w-full h-9 rounded-lg font-mono text-xs uppercase tracking-widest bg-primary hover:bg-primary/90 text-primary-foreground shadow-none transition-all" disabled={isLoading}>
                    {isLoading ? (
                        <Loader2 className="h-3 w-3 animate-spin mr-2" />
                    ) : (
                        <Save className="h-3 w-3 mr-2" />
                    )}
                    保存个人资料
                </Button>
            </form>
        </div>
    );
}

