import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { QrCode } from "lucide-react";
import { QRScanner } from "@/components/ui/QRScanner";
import { useContactStore } from "@/store/contactStore";
import { useAuthStore } from "@/store/authStore";
import { useUIStore } from "@/store/uiStore";

interface AddContactDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddContactDialog({ open, onOpenChange }: AddContactDialogProps) {
  const [npub, setNpub] = useState("");
  const [remark, setRemark] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const { isMobile } = useUIStore();

  const { addContact, resolveNickname } = useContactStore();
  const contacts = useContactStore((state) => state.contacts);

  const validateNpub = (value: string) => {
    if (!value.startsWith("npub1")) {
      return "公钥必须以 npub1 开头";
    }
    if (value.length < 60) {
      return "公钥长度不正确";
    }
    return "";
  };

  const handleSubmit = async () => {
    setError("");

    const normalizedNpub = npub.trim();
    const validationError = validateNpub(normalizedNpub);
    if (validationError) {
      setError(validationError);
      return;
    }

    if (normalizedNpub === useAuthStore.getState().npub) {
      setError("不能添加自己为联系人");
      return;
    }

    if (contacts.some((contact) => contact.npub === normalizedNpub)) {
      setError("联系人已存在");
      return;
    }

    setIsSubmitting(true);
    try {
      await addContact(normalizedNpub, remark.trim() || undefined);

      // Try to resolve nickname from Nostr network
      resolveNickname(normalizedNpub);

      // Reset form and close dialog
      setNpub("");
      setRemark("");
      onOpenChange(false);
    } catch (err) {
      setError(String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setNpub("");
    setRemark("");
    setError("");
    onOpenChange(false);
  };

  if (showScanner) {
    return (
      <QRScanner
        onScan={(result) => {
          // If it starts with nostr: strip it
          const cleaned = result.replace(/^nostr:/, "");
          setNpub(cleaned);
          setShowScanner(false);
        }}
        onClose={() => setShowScanner(false)}
      />
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className={isMobile ? "text-left" : ""}>
          <div className="flex-1 text-left">
            <DialogTitle className={isMobile ? "text-lg" : ""}>添加联系人</DialogTitle>
            <DialogDescription>输入联系人的公钥 (npub) 来添加他/她</DialogDescription>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label htmlFor="npub" className="text-sm font-medium">
              公钥 (npub) <span className="text-destructive">*</span>
            </label>
            <div className="flex gap-2">
              <Input
                id="npub"
                placeholder="npub1..."
                value={npub}
                onChange={(e) => {
                  setNpub(e.target.value);
                  setError("");
                }}
                className="font-mono text-sm h-12 flex-1"
              />
              <Button
                variant="outline"
                size="icon"
                className="h-12 w-12 shrink-0 border-border/50 hover:bg-accent"
                onClick={() => setShowScanner(true)}
              >
                <QrCode className="h-5 w-5" />
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="remark" className="text-sm font-medium">
              备注名称 <span className="text-muted-foreground">(可选)</span>
            </label>
            <Input
              id="remark"
              placeholder="给联系人起个名字..."
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              className="h-12"
            />
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </div>

        <DialogFooter className="flex-row gap-2">
          {!isMobile && (
            <Button variant="outline" onClick={handleClose} className="h-12 flex-1">
              取消
            </Button>
          )}
          <Button onClick={handleSubmit} disabled={isSubmitting || !npub} className={`h-12 text-base ${isMobile ? "w-full" : "flex-1"}`}>
            {isSubmitting ? "添加中..." : "添加"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
