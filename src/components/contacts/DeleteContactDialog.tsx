import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useContactStore } from "@/store/contactStore";
import { toast } from "sonner";
import { useState } from "react";

interface DeleteContactDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    contactNpub: string | null;
    contactName?: string | null;
}

export function DeleteContactDialog({
    open,
    onOpenChange,
    contactNpub,
    contactName
}: DeleteContactDialogProps) {
    const { removeContact } = useContactStore();
    const [isDeleting, setIsDeleting] = useState(false);

    const handleDelete = async () => {
        if (!contactNpub) return;

        setIsDeleting(true);
        try {
            await removeContact(contactNpub);
            toast.success("联系人已删除");
            onOpenChange(false);
        } catch (error) {
            toast.error("删除失败", {
                description: String(error)
            });
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>确认删除联系人？</AlertDialogTitle>
                    <AlertDialogDescription>
                        您确定要删除 {contactName || "此联系人"} 吗？
                        <br />
                        删除后，您将无法收到他/她的加密消息，直到再次添加。
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={isDeleting}>取消</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={(e) => {
                            e.preventDefault();
                            handleDelete();
                        }}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        disabled={isDeleting}
                    >
                        {isDeleting ? "删除中..." : "删除"}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
