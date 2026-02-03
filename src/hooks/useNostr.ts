import { useState, useCallback, useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { toast } from "sonner";
import {
  sendMessage as sendNostrMessage,
  startMessageListener,
} from "@/utils/nostr";
import { useMessageStore } from "@/store/messageStore";
import { useContactStore } from "@/store/contactStore";
import { useAuthStore } from "@/store/authStore";
import { useTypingStore } from "@/store/typingStore";
import type { Message } from "@/types";
import { usePresenceStore } from "@/store/presenceStore";
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";

const typingTimeouts = new Map<string, number>();

export function useNostr() {
  const [isConnecting] = useState(false);

  // Use ref to track listener state
  const listenerRef = useRef<{ unlisten?: () => void; unlistenContacts?: () => void; unlistenTyping?: () => void; unlistenRead?: () => void; unlistenPresence?: () => void }>({});
  const windowFocusedRef = useRef(true);
  const documentVisibleRef = useRef(!document.hidden);

  const sendMessage = useCallback(async (receiver: string, content: string) => {
    return await sendNostrMessage(receiver, content);
  }, []);

  useEffect(() => {
    const handleFocus = () => {
      windowFocusedRef.current = true;
    };
    const handleBlur = () => {
      windowFocusedRef.current = false;
    };
    const handleVisibility = () => {
      documentVisibleRef.current = !document.hidden;
    };
    window.addEventListener("focus", handleFocus);
    window.addEventListener("blur", handleBlur);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  useEffect(() => {
    // Get current auth state
    const { isAuthenticated, npub } = useAuthStore.getState();

    if (!isAuthenticated || !npub) {
      console.log("useNostr: Not authenticated, skipping listener setup");
      return;
    }

    let isMounted = true;
    let retryCount = 0;
    const MAX_RETRIES = 5;

    // Debounced refresh functions to prevent rapid-fire updates during sync
    const sessionRefreshTimeout = { current: null as any };
    const contactRefreshTimeout = { current: null as any };

    const setupListener = async () => {
      if (!isMounted) return;

      // Clean up existing listeners first
      if (listenerRef.current.unlisten) {
        listenerRef.current.unlisten();
        listenerRef.current.unlisten = undefined;
      }
      if (listenerRef.current.unlistenContacts) {
        listenerRef.current.unlistenContacts();
        listenerRef.current.unlistenContacts = undefined;
      }

      try {
        console.log("useNostr: Starting message listener...");

        // Start message listener with error handling to prevent crashing the app
        try {
          await startMessageListener();
          console.log("useNostr: Message listener started successfully");
        } catch (listenerError) {
          console.error("useNostr: Failed to start message listener:", listenerError);
          // Don't throw here as it would crash the component, just log the error
          return; // Exit early but don't crash the app
        }

        const debouncedRefreshSessions = () => {
          if (sessionRefreshTimeout.current) clearTimeout(sessionRefreshTimeout.current);
          sessionRefreshTimeout.current = setTimeout(() => {
            if (isMounted) {
              console.log("useNostr: Executing debounced session refresh");
              useContactStore.getState().loadChatSessions();
            }
          }, 300);
        };

        const debouncedRefreshContacts = () => {
          if (contactRefreshTimeout.current) clearTimeout(contactRefreshTimeout.current);
          contactRefreshTimeout.current = setTimeout(() => {
            if (isMounted) {
              console.log("useNostr: Executing debounced contact refresh");
              useContactStore.getState().loadContacts();
            }
          }, 500);
        };

        // Listen for new message events
        const unlistenFn = await listen<{ message: Message; metadata: { is_sync: boolean } }>("new-message", (event) => {
          if (!isMounted) return;

          const { message, metadata } = event.payload;
          const { npub: myNpub } = useAuthStore.getState();

          console.log("useNostr: Received new-message event", {
            id: message.id,
            sender: message.sender.substring(0, 10) + "...",
            receiver: message.receiver.substring(0, 10) + "...",
            myNpub: myNpub?.substring(0, 10) + "...",
            messageType: message.messageType,
            is_sync: metadata.is_sync
          });

          // Validate message belongs to current user
          if (message.sender !== myNpub && message.receiver !== myNpub) {
            console.log("useNostr: Message doesn't belong to current user, ignoring");
            return;
          }

          // Add message to store
          const isNew = useMessageStore.getState().addMessage(message);
          console.log("useNostr: addMessage returned isNew=", isNew);

          // Handle notifications if app is in background and it's a new incoming message
          const hasFocus = typeof document.hasFocus === "function" ? document.hasFocus() : true;
          const isAppActive = windowFocusedRef.current && documentVisibleRef.current && hasFocus;
          
          const isContact = useContactStore.getState().contacts.some(c => c.npub === message.sender);

          if (isNew && message.sender !== myNpub && isContact && !metadata.is_sync && !isAppActive) {
            (async () => {
              try {
                let permissionGranted = await isPermissionGranted();
                if (!permissionGranted) {
                  const permission = await requestPermission();
                  permissionGranted = permission === 'granted';
                }

                if (permissionGranted) {
                  sendNotification({
                    title: "Ostia",
                    body: "您收到了一条新消息",
                  });
                }
              } catch (err) {
                console.error("Failed to send notification:", err);
              }
            })();
          }

          // Always refresh chat sessions when a significant message arrives
          // Use debounced version to avoid hitting React depth limits during sync
          debouncedRefreshSessions();
        });

        // Listen for contact updates
        const unlistenContactsFn = await listen("contacts-updated", () => {
          if (!isMounted) return;
          console.log("useNostr: Contacts updated event received");
          debouncedRefreshContacts();
          debouncedRefreshSessions();
        });

        const unlistenTyping = await listen<{ from: string; typing: boolean }>("typing", (event) => {
          if (!isMounted) return;
          const { from, typing } = event.payload;
          const store = useTypingStore.getState();
          store.setTyping(from, typing);
          const prev = typingTimeouts.get(from);
          if (prev) {
            window.clearTimeout(prev);
            typingTimeouts.delete(from);
          }
          if (typing) {
            const id = window.setTimeout(() => {
              useTypingStore.getState().setTyping(from, false);
              typingTimeouts.delete(from);
            }, 5000);
            typingTimeouts.set(from, id);
          }
        });

        const unlistenRead = await listen<{ messageId: string; from: string }>("read-receipt", (event) => {
          if (!isMounted) return;
          const { messageId, from } = event.payload;
          useMessageStore.getState().updateMessageStatus(messageId, "read", from);
          debouncedRefreshSessions();
        });

        const unlistenPresence = await listen<{ from: string; online: boolean; lastSeen: number }>("presence", (event) => {
          if (!isMounted) return;
          const { from, online, lastSeen } = event.payload;
          usePresenceStore.getState().setPresence(from, { online, lastSeen });
        });

        if (isMounted) {
          listenerRef.current = {
            unlisten: unlistenFn,
            unlistenContacts: unlistenContactsFn,
            unlistenTyping,
            unlistenRead,
            unlistenPresence
          };
          retryCount = 0; // Reset retry count on success
        }

      } catch (error) {
        console.error("useNostr - Failed to setup message listener:", error);

        if (isMounted && retryCount < MAX_RETRIES) {
          retryCount++;
          const delay = 5000 * retryCount; // Exponential backoff
          console.log(`useNostr: Retrying listener setup in ${delay}ms (attempt ${retryCount}/${MAX_RETRIES})`);
          setTimeout(() => setupListener(), delay);
        } else if (isMounted) {
          console.error("useNostr: Max retries reached, giving up");
          toast.error("消息监听启动失败", {
            description: "请检查网络连接后重试"
          });
        }
      }
    };

    setupListener();

    // Cleanup on unmount or when auth changes
    return () => {
      console.log("useNostr: Cleaning up listeners");
      isMounted = false;
      if (listenerRef.current.unlisten) {
        listenerRef.current.unlisten();
      }
      if (listenerRef.current.unlistenContacts) {
        listenerRef.current.unlistenContacts();
      }
      if (listenerRef.current.unlistenTyping) {
        listenerRef.current.unlistenTyping();
      }
      if (listenerRef.current.unlistenRead) {
        listenerRef.current.unlistenRead();
      }
      if (listenerRef.current.unlistenPresence) {
        listenerRef.current.unlistenPresence();
      }
      // Clear debounced timeouts
      if (sessionRefreshTimeout.current) clearTimeout(sessionRefreshTimeout.current);
      if (contactRefreshTimeout.current) clearTimeout(contactRefreshTimeout.current);
      typingTimeouts.forEach((id) => {
        window.clearTimeout(id);
      });
      typingTimeouts.clear();

      listenerRef.current = {};
    };
  }, []); // Only run once on mount

  return {
    sendMessage,
    isConnecting,
  };
}
