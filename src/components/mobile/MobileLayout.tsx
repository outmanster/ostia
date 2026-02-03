import React, { useState } from "react";
import { useContactStore } from "@/store/contactStore";
import { Settings, MessageSquare, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { SettingsDialog } from "@/components/settings/SettingsDialog";
import { ContactList } from "@/components/layout/ContactList";
import type { Contact } from "@/types";

interface MobileLayoutProps {
  children: React.ReactNode;
}

export function MobileLayout({ children }: MobileLayoutProps) {
  const { selectedContact, selectContact } = useContactStore();
  const [showSettings, setShowSettings] = useState(false);
  const [showContacts, setShowContacts] = useState(false);

  // Handle contact selection and close drawer
  const handleSelectContact = (contact: Contact) => {
    selectContact(contact);
    setShowContacts(false);
  };

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Mobile Header */}
      <header className="flex items-center justify-between p-3 border-b bg-card">
        <div className="flex items-center gap-2">
          <Sheet open={showContacts} onOpenChange={setShowContacts}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden">
                <Users className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[85vw] max-w-sm p-0">
              <div className="h-full flex flex-col pt-[max(1.25rem,env(safe-area-inset-top))]">
                <ContactList
                  onSelect={(contact) => handleSelectContact(contact)}
                  selectedNpub={selectedContact?.npub}
                  showAddButton={false}
                />
              </div>
            </SheetContent>
          </Sheet>

          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            <span className="font-semibold text-sm hidden sm:inline">Ostia</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowSettings(true)}
          >
            <Settings className="h-5 w-5" />
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden">
        {children}
      </main>

      {/* Mobile Bottom Navigation (Optional) */}
      <nav className="border-t bg-card p-2 flex justify-around items-center lg:hidden">
        <Button variant="ghost" size="sm" className="flex flex-col gap-1 h-auto py-2">
          <MessageSquare className="h-7 w-7" />
          <span className="text-[10px]">消息</span>
        </Button>
        <Button variant="ghost" size="sm" className="flex flex-col gap-1 h-auto py-2">
          <Users className="h-7 w-7" />
          <span className="text-[10px]">联系人</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="flex flex-col gap-1 h-auto py-2"
          onClick={() => setShowSettings(true)}
        >
          <Settings className="h-7 w-7" />
          <span className="text-[10px]">设置</span>
        </Button>
      </nav>

      {/* Settings Dialog */}
      <SettingsDialog open={showSettings} onOpenChange={setShowSettings} />
    </div>
  );
}
