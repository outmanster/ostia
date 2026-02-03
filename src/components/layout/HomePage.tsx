import { useEffect, useRef } from "react";
import { ServerOff, X } from "lucide-react";
import { useUIStore } from "@/store/uiStore";
import { useContactStore } from "@/store/contactStore";
import { useAuthStore } from "@/store/authStore";
import { useMessageStore } from "@/store/messageStore";
import { useRelayStore } from "@/store/relayStore";
import { toast } from "sonner";
import { Sidebar } from "./Sidebar";
import { ChatArea } from "./ChatArea";
import { MobileView } from "./MobileView";

import { ContactDetailView } from "@/components/contacts/ContactDetailView";

import { syncMessages } from "@/utils/nostr";
import { useNostr } from "@/hooks/useNostr";

export function HomePage() {
  const isMobile = useUIStore(s => s.isMobile);
  const activeTab = useUIStore(s => s.activeTab);
  const showAddContactDialog = useUIStore(s => s.showAddContactDialog);
  const setShowAddContactDialog = useUIStore(s => s.setShowAddContactDialog);
  const showSettingsDialog = useUIStore(s => s.showSettingsDialog);
  const setShowSettingsDialog = useUIStore(s => s.setShowSettingsDialog);

  const selectedContact = useContactStore(s => s.selectedContact);
  const selectedContactNpubRef = useRef<string | null>(null);

  const isAuthenticated = useAuthStore(s => s.isAuthenticated);

  // Use Nostr hook to activate message listener and sync messages
  useNostr();

  // Sync offline messages on component mount (listener is already started by useNostr)
  const syncOperationRef = useRef<boolean>(false);
  useEffect(() => {
    selectedContactNpubRef.current = selectedContact?.npub ?? null;
  }, [selectedContact?.npub]);
  useEffect(() => {
    if (!isAuthenticated) return;

    const syncOfflineMessages = async () => {
      if (syncOperationRef.current) return;
      syncOperationRef.current = true;
      try {
        console.log("HomePage: Starting periodic message sync...");
        let count = 0;
        try {
          count = await syncMessages();
          console.log(`Synced ${count} offline messages`);
        } catch (syncError) {
          console.error("Failed to sync messages:", syncError);
        }

        const currentNpub = selectedContactNpubRef.current;
        if (count > 0 && currentNpub) {
          try {
            await useMessageStore.getState().loadMessages(currentNpub);
            toast.success(`同步了 ${count} 条新消息`);
          } catch (loadError) {
            console.error("Failed to load messages after sync:", loadError);
            toast.success(`同步了 ${count} 条新消息`);
          }
        }
      } catch (syncError) {
        console.error("Unexpected error in syncOfflineMessages:", syncError);
      } finally {
        syncOperationRef.current = false;
      }
    };

    syncOfflineMessages();
    const timer = setInterval(syncOfflineMessages, 30000);
    return () => clearInterval(timer);
  }, [isAuthenticated]);

  // Load contacts on mount or when authenticated
  // Load contacts and chat sessions on mount or when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      // Use getState() to avoid dependency on store functions changing
      useContactStore.getState().loadContacts();
      useContactStore.getState().loadChatSessions(); // Fix: Load sessions immediately
      useRelayStore.getState().getMyRelays();
    }
  }, [isAuthenticated]);

  // Relay Onboarding Check
  const hasCheckedRelays = useRef(false);
  const customRelays = useRelayStore(s => s.config.customRelays);
  const myRelays = useRelayStore(s => s.myRelays);
  const isConfigLoaded = useRelayStore(s => s.isConfigLoaded);
  const isRelaysLoaded = useRelayStore(s => s.isRelaysLoaded);

  useEffect(() => {
    if (isAuthenticated) {
      useRelayStore.getState().getRelayConfig();
    }
  }, [isAuthenticated]);

  useEffect(() => {
    // Stage 1: Fast check against local database config
    if (isAuthenticated && !hasCheckedRelays.current && isConfigLoaded) {
      if (customRelays.length > 0) {
        // We have local relays, we are good!
        hasCheckedRelays.current = true;
        return;
      }

      // Stage 2: If local config is empty, wait for network (NIP-65) list
      if (isRelaysLoaded) {
        if (myRelays.length === 0) {
          hasCheckedRelays.current = true;
          // Custom toast for missing relays
          toast.custom((t) => (
            <div className="relative w-full overflow-hidden rounded-xl border border-border/40 bg-popover/95 p-4 shadow-2xl backdrop-blur-md transition-all animate-in slide-in-from-top-5 duration-300 pointer-events-auto">
              {/* Subtle gradient background */}
              <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent pointer-events-none" />

              <div className="relative flex gap-4">
                {/* Icon */}
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
                  <ServerOff className="h-5 w-5" />
                </div>

                {/* Content */}
                <div className="flex-1 space-y-1.5 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="text-sm font-semibold leading-none tracking-tight text-foreground/90 mt-1">
                      未配置中继器
                    </h4>
                  </div>

                  <p className="text-xs text-muted-foreground leading-relaxed pr-2">
                    您尚未配置中继器，无法接收或发送消息。
                  </p>

                  {/* Actions */}
                  <div className="pt-3 flex items-center gap-2.5">
                    <button
                      onClick={() => {
                        setShowSettingsDialog(true, "relays");
                        toast.dismiss(t);
                      }}
                      className="inline-flex h-8 items-center justify-center rounded-lg bg-primary px-4 text-xs font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 hover:shadow active:scale-95 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer"
                    >
                      立即配置
                    </button>
                    <button
                      onClick={() => toast.dismiss(t)}
                      className="inline-flex h-8 items-center justify-center rounded-lg border border-border/50 bg-secondary/50 px-3 text-xs font-medium shadow-sm transition-all hover:bg-secondary hover:text-secondary-foreground active:scale-95 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer"
                    >
                      暂不处理
                    </button>
                  </div>
                </div>

                {/* Close Button */}
                <button
                  onClick={() => toast.dismiss(t)}
                  className="absolute -right-2 -top-2 p-2 rounded-full text-muted-foreground/40 hover:text-foreground hover:bg-accent transition-all cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          ), {
            duration: Infinity,
            position: isMobile ? "top-center" : "bottom-right",
            // IMPORTANT: Override default sonner styles to remove white background/borders
            className: "!bg-transparent !border-0 !shadow-none !p-0 !pointer-events-auto",
          });
          setShowSettingsDialog(true, "relays");
        } else {
          // Found NIP-65 relays, also good!
          hasCheckedRelays.current = true;
        }
      }
    }
  }, [isAuthenticated, isConfigLoaded, isRelaysLoaded, customRelays.length, myRelays.length, setShowSettingsDialog]);

  // Responsive detection is now handled in App.tsx globally
  // This avoids multiple listeners and potential race conditions/loops


  // Mobile Layout
  if (isMobile) {
    return <MobileView selectedContact={selectedContact} activeTab={activeTab} showAddContactDialog={showAddContactDialog} setShowAddContactDialog={setShowAddContactDialog} showSettingsDialog={showSettingsDialog} setShowSettingsDialog={setShowSettingsDialog} />;
  }

  // Desktop Layout
  return (
    <div className="h-screen flex overflow-hidden bg-background">
      <div className="shrink-0">
        <Sidebar />
      </div>

      <main className="flex-1 flex overflow-hidden relative">
        {activeTab === "chats" ? (
          <ChatArea />
        ) : (
          <ContactDetailView />
        )}
      </main>
    </div>
  );
}
