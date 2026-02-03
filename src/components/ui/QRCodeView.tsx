import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Copy, Check } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface QRCodeViewProps {
    value: string;
    label?: string;
}

export function QRCodeView({ value, label }: QRCodeViewProps) {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            toast.success("已复制到剪贴板");
            setTimeout(() => setCopied(false), 2000);
        } catch {
            toast.error("复制失败");
        }
    };

    return (
        <div className="flex flex-col items-center gap-6 py-4">
            <div className="bg-white p-4 rounded-xl shadow-inner border border-border/50">
                <QRCodeSVG
                    value={value}
                    size={200}
                    level="H"
                    includeMargin={false}
                    imageSettings={{
                        src: "/logo.png", // Assuming logo.png exists in public
                        x: undefined,
                        y: undefined,
                        height: 40,
                        width: 40,
                        excavate: true,
                    }}
                />
            </div>

            <div className="text-center space-y-2 w-full max-w-[280px]">
                {label && <p className="text-sm font-medium text-muted-foreground">{label}</p>}
                <div className="flex items-center gap-2 bg-muted/50 p-2 rounded-md border border-border/50">
                    <code className="text-[10px] font-mono flex-1 truncate">{value}</code>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={handleCopy}
                    >
                        {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                    </Button>
                </div>
            </div>

            <p className="text-[11px] text-muted-foreground text-center max-w-[240px]">
                让对方打开 Ostia “添加联系人”并扫描此二维码即可快速添加你。
            </p>
        </div>
    );
}
