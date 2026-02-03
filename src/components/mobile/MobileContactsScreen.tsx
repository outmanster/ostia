import { ContactList } from "@/components/layout/ContactList";
import { Button } from "@/components/ui/button";
import { UserPlus } from "lucide-react";
import { useUIStore } from "@/store/uiStore";
import { useContactStore } from "@/store/contactStore";
import { MobileHeader } from "./MobileHeader";

export function MobileContactsScreen() {
    const selectContact = useContactStore(s => s.selectContact);
    const setShowAddContactDialog = useUIStore(s => s.setShowAddContactDialog);
    const setLastListTab = useUIStore(s => s.setLastListTab);

    return (
        <div className="flex flex-col h-full bg-background animate-in fade-in slide-in-from-bottom-4 duration-300 relative">
            <MobileHeader
                title="联系人"
                actionButton={
                    <Button
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => setShowAddContactDialog(true)}
                    >
                        <UserPlus className="h-6 w-6" />
                    </Button>
                }
            />

            <div className="flex-1 overflow-hidden">
                <ContactList
                    onSelect={(contact) => {
                        setLastListTab("contacts");
                        selectContact(contact);
                    }}
                    showAddButton={false}
                />
            </div>
        </div>
    );
}
