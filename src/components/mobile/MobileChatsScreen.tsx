import { ChatList } from "@/components/layout/ChatList";
import { useContactStore } from "@/store/contactStore";
import { useUIStore } from "@/store/uiStore";
import type { Contact } from "@/types";
import { MobileHeader } from "./MobileHeader";

export function MobileChatsScreen() {
    const selectContact = useContactStore(s => s.selectContact);
    const setLastListTab = useUIStore(s => s.setLastListTab);

    const handleSelectContact = (contact: Contact) => {
        setLastListTab("chats");
        selectContact(contact);
    };

    return (
        <div className="flex flex-col h-full bg-background animate-in fade-in slide-in-from-bottom-4 duration-300 relative">
            <MobileHeader 
                title="消息" 
            />

            <div className="flex-1 overflow-hidden">
                <ChatList
                    onSelect={handleSelectContact}
                />
            </div>
        </div>
    );
}
