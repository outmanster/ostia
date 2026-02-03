import { useState, useEffect, useRef, useCallback } from "react";
import { ChatArea } from "./ChatArea";
import { MobileChatsScreen } from "@/components/mobile/MobileChatsScreen";
import { MobileContactsScreen } from "@/components/mobile/MobileContactsScreen";
import { MobileSettingsScreen } from "@/components/mobile/MobileSettingsScreen";
import { BottomNav } from "./BottomNav";
import { AddContactDialog } from "@/components/contacts/AddContactDialog";
import { SettingsDialog } from "@/components/settings/SettingsDialog";
import { useContactStore } from "@/store/contactStore";
import { useUIStore } from "@/store/uiStore";
import { Contact } from "@/types";

interface MobileViewProps {
    selectedContact: Contact | null;
    activeTab: string;
    showAddContactDialog: boolean;
    setShowAddContactDialog: (open: boolean) => void;
    showSettingsDialog: boolean;
    setShowSettingsDialog: (open: boolean, tab?: any) => void;
}

export function MobileView({
    selectedContact,
    activeTab,
    showAddContactDialog,
    setShowAddContactDialog,
    showSettingsDialog,
    setShowSettingsDialog,
}: MobileViewProps) {
    // activeContact: controls whether the chat layer is rendered
    const [activeContact, setActiveContact] = useState<Contact | null>(selectedContact);
    // animationState: 'idle' | 'entering' | 'leaving'
    const [animationState, setAnimationState] = useState<'idle' | 'entering' | 'leaving'>('idle');
    const [listBaseOffset, setListBaseOffset] = useState(0);
    const activeContactRef = useRef<Contact | null>(selectedContact);
    const setActiveTab = useUIStore(s => s.setActiveTab);
    const lastListTab = useUIStore(s => s.lastListTab);

    // Refs for gesture handling
    const listLayerRef = useRef<HTMLDivElement>(null);
    const touchStartRef = useRef<{ x: number; y: number } | null>(null);
    const isSwipingRef = useRef(false);
    const currentOffsetRef = useRef(0);
    const elementRef = useRef<HTMLDivElement | null>(null);
    const backTimerRef = useRef<number | null>(null);

    // Use a Ref to hold the latest handler functions to avoid closure staleness
    // while keeping the event listener registration stable.
    const handlersRef = useRef<{
        start: (e: TouchEvent) => void;
        move: (e: TouchEvent) => void;
        end: () => void;
    }>({ start: () => { }, move: () => { }, end: () => { } });

    // Update handlers on every render
    useEffect(() => {
        handlersRef.current.start = (e: TouchEvent) => {
            const x = e.touches[0].clientX;
            const y = e.touches[0].clientY;

            // Strict edge detection for reliable "Back" gesture
            // If starting > 50px from left, ignore it (let content scroll)
            // UNLESS we want full screen swipe. User said "page follows finger".
            // But usually "Back" is edge. Full screen back conflicts with carousels/tabs.
            // Let's compromise: < 50px is Priority. > 50px is allowed but stricter.

            // Actually, for "Native-like" feel, edge is best.
            // But let's support full screen with angle check.

            touchStartRef.current = { x, y };
            isSwipingRef.current = false;
            currentOffsetRef.current = 0;

            // Force browser to acknowledge we might take over
            // Note: We can't preventDefault on start in passive listeners, 
            // but we can prepare the element.
            const element = elementRef.current;
            if (element) {
                element.style.transition = 'none';
                element.style.animation = 'none';
            }
        };

        handlersRef.current.move = (e: TouchEvent) => {
            if (!touchStartRef.current) return;

            const currentX = e.touches[0].clientX;
            const currentY = e.touches[0].clientY;
            const diffX = currentX - touchStartRef.current.x;
            const diffY = currentY - touchStartRef.current.y;
            const absX = Math.abs(diffX);
            const absY = Math.abs(diffY);

            // Determine gesture intent
            if (!isSwipingRef.current) {
                // If we moved mostly vertically, ABORT immediately to let browser scroll
                if (absY > absX && absY > 5) {
                    touchStartRef.current = null;
                    return;
                }

                // If moving right and horizontal is dominant
                if (diffX > 5 && absX > absY) {
                    // It is a swipe!
                    isSwipingRef.current = true;

                    // Kill any animations
                    const element = elementRef.current;
                    if (element) {
                        element.style.transition = 'none';
                        element.style.animation = 'none';
                    }
                    if (listLayerRef.current) {
                        listLayerRef.current.style.transition = 'none';
                        listLayerRef.current.style.animation = 'none';
                    }
                }
            }

            if (isSwipingRef.current) {
                // We are in control. Stop browser.
                if (e.cancelable) {
                    e.preventDefault();
                    e.stopPropagation();
                }

                // Only allow dragging right
                const offset = Math.max(0, diffX);
                currentOffsetRef.current = offset;

                const element = elementRef.current;
                const containerWidth = element?.offsetWidth || window.innerWidth;
                if (element) {
                    element.style.transform = `translate3d(${offset}px, 0, 0)`;
                }

                if (listLayerRef.current) {
                    const progress = containerWidth ? Math.min(1, offset / containerWidth) : 0;
                    const listOffset = listBaseOffset + progress * -listBaseOffset;
                    listLayerRef.current.style.transform = `translate3d(${listOffset}px, 0, 0)`;
                    listLayerRef.current.style.opacity = `${0.9 + progress * 0.1}`;
                }
            }
        };

        handlersRef.current.end = () => {
            if (!touchStartRef.current) return;

            if (!isSwipingRef.current) {
                touchStartRef.current = null;
                return;
            }

            const diffX = currentOffsetRef.current;
            const element = elementRef.current;
            const screenWidth = element?.offsetWidth || window.innerWidth;

            // Restore transitions
            if (element) {
                element.style.transition = 'transform 250ms cubic-bezier(0.2, 0.8, 0.2, 1)';
            }
            if (listLayerRef.current) {
                listLayerRef.current.style.transition = 'transform 250ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity 250ms ease';
            }

            // Threshold to trigger back: 30% of width or velocity (simplified to distance here)
            if (diffX > screenWidth * 0.35) {
                // Finish Swipe
                if (element) {
                    element.style.transform = `translate3d(${screenWidth}px, 0, 0)`;
                }
                if (listLayerRef.current) {
                    listLayerRef.current.style.transform = 'translate3d(0, 0, 0)';
                    listLayerRef.current.style.opacity = '1';
                }

                setTimeout(() => {
                    isSwipingRef.current = false;
                    useContactStore.getState().selectContact(null);
                    setActiveTab(lastListTab);
                    setActiveContact(null);
                    setAnimationState('idle');

                    if (element) {
                        element.style.transition = '';
                        element.style.transform = '';
                    }
                }, 250);
            } else {
                // Cancel Swipe (Snap back)
                if (element) {
                    element.style.transform = 'translate3d(0, 0, 0)';
                }
                if (listLayerRef.current) {
                    listLayerRef.current.style.transform = `translate3d(${listBaseOffset}px, 0, 0)`;
                    listLayerRef.current.style.opacity = '0.9';
                }

                setTimeout(() => {
                    isSwipingRef.current = false;
                    if (element) {
                        element.style.transition = '';
                    }
                    if (listLayerRef.current) {
                        listLayerRef.current.style.transition = '';
                        listLayerRef.current.style.transform = '';
                        listLayerRef.current.style.opacity = '';
                    }
                }, 250);
            }

            touchStartRef.current = null;
        };
    });

    useEffect(() => {
        activeContactRef.current = activeContact;
    }, [activeContact]);

    useEffect(() => {
        const currentActive = activeContactRef.current;
        if (selectedContact) {
            if (!currentActive || selectedContact.npub !== currentActive.npub) {
                setActiveContact(selectedContact);
                if (!currentActive) {
                    setAnimationState('entering');
                    const timer = setTimeout(() => setAnimationState('idle'), 300);
                    return () => clearTimeout(timer);
                }
            }
            return;
        }

        if (currentActive && !isSwipingRef.current) {
            setAnimationState('leaving');
            const timer = setTimeout(() => {
                setActiveContact(null);
                setAnimationState('idle');
            }, 300);
            return () => clearTimeout(timer);
        }
    }, [selectedContact?.npub]);

    // Static event proxies
    const onTouchStart = (e: TouchEvent) => handlersRef.current.start(e);
    const onTouchMove = (e: TouchEvent) => handlersRef.current.move(e);
    const onTouchEnd = () => handlersRef.current.end();

    // Callback ref to attach listeners ONCE to the DOM element
    const setChatLayerRef = useCallback((node: HTMLDivElement | null) => {
        if (elementRef.current) {
            const oldEl = elementRef.current;
            // Remove old listeners
            oldEl.removeEventListener('touchstart', onTouchStart, { capture: true });
            oldEl.removeEventListener('touchmove', onTouchMove, { capture: true });
            oldEl.removeEventListener('touchend', onTouchEnd, { capture: true });
            oldEl.removeEventListener('touchcancel', onTouchEnd, { capture: true });
        }

        elementRef.current = node;

        if (node) {
            // Static proxies that delegate to the ref-held handlers
            // This ensures we never need to re-bind listeners
            node.addEventListener('touchstart', onTouchStart, { passive: true, capture: true });
            // Passive: false is REQUIRED to prevent scrolling
            node.addEventListener('touchmove', onTouchMove, { passive: false, capture: true });
            node.addEventListener('touchend', onTouchEnd, { capture: true });
            node.addEventListener('touchcancel', onTouchEnd, { capture: true });

            // Force hardware acceleration
            node.style.willChange = 'transform';
            node.style.touchAction = 'pan-y'; // Allow vertical scroll, we handle horizontal
        }
    }, []);

    // Compute animation class based on state
    let animationClass = '';
    if (animationState === 'entering') animationClass = 'animate-slide-in';
    if (animationState === 'leaving') animationClass = 'animate-slide-out';

    const chatShadowClassName = [
        "absolute",
        "left-0",
        "top-0",
        "bottom-0",
        "w-4",
        "-ml-4",
        "bg-gradient-to-r",
        "from-transparent",
        "to-black/10",
        "pointer-events-none",
    ].join(" ");

    useEffect(() => {
        const node = listLayerRef.current;
        if (!node) return;
        const updateOffset = () => {
            const width = node.offsetWidth || window.innerWidth;
            setListBaseOffset(-0.2 * width);
        };
        updateOffset();
        if (!("ResizeObserver" in window)) return;
        const observer = new ResizeObserver(updateOffset);
        observer.observe(node);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        if ((activeContact || showSettingsDialog) && listLayerRef.current) {
            listLayerRef.current.style.transition = '';
            listLayerRef.current.style.transform = '';
            listLayerRef.current.style.opacity = '';
        }
    }, [activeContact, showSettingsDialog]);

    const handleChatBack = useCallback(() => {
        if (isSwipingRef.current) return;
        if (backTimerRef.current) {
            window.clearTimeout(backTimerRef.current);
            backTimerRef.current = null;
        }
        if (elementRef.current) {
            elementRef.current.style.animation = '';
            elementRef.current.style.transition = '';
            elementRef.current.style.transform = '';
        }
        if (listLayerRef.current) {
            listLayerRef.current.style.transition = 'transform 250ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity 250ms ease';
            listLayerRef.current.style.transform = 'translate3d(0, 0, 0)';
            listLayerRef.current.style.opacity = '1';
        }
        setAnimationState('leaving');
        backTimerRef.current = window.setTimeout(() => {
            useContactStore.getState().selectContact(null);
            setActiveTab(lastListTab);
            setActiveContact(null);
            setAnimationState('idle');
            if (elementRef.current) {
                elementRef.current.style.transition = '';
                elementRef.current.style.transform = '';
            }
            if (listLayerRef.current) {
                listLayerRef.current.style.transition = '';
                listLayerRef.current.style.transform = '';
                listLayerRef.current.style.opacity = '';
            }
            backTimerRef.current = null;
        }, 300);
    }, [lastListTab, setActiveTab]);

    return (
        <div className="h-screen w-screen overflow-hidden relative bg-background">
            {/* Main List Layer */}
            <div
                ref={listLayerRef}
                className={`absolute inset-0 h-full w-full bg-background transition-all duration-300 ease-out ${(activeContact || showSettingsDialog) ? "opacity-90" : "opacity-100"}`}
                style={{
                    transform: (activeContact || showSettingsDialog) ? `translate3d(${listBaseOffset}px, 0, 0)` : 'translate3d(0, 0, 0)',
                }}
            >
                <div className="h-full w-full relative">
                    <div className="absolute inset-0 pb-0 overflow-hidden">
                        {activeTab === "chats" && <MobileChatsScreen />}
                        {activeTab === "contacts" && <MobileContactsScreen />}
                        {activeTab === "settings" && <MobileSettingsScreen />}
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 z-50">
                        <BottomNav />
                    </div>
                </div>

                <AddContactDialog
                    open={showAddContactDialog}
                    onOpenChange={setShowAddContactDialog}
                />
                <SettingsDialog
                    open={showSettingsDialog}
                    onOpenChange={setShowSettingsDialog}
                    onSwipeStart={() => {
                        if (listLayerRef.current) {
                            listLayerRef.current.style.transition = 'none';
                        }
                    }}
                    onSwipeMove={(progress) => {
                        if (listLayerRef.current) {
                            const clampedProgress = Math.max(0, Math.min(1, progress));
                            const listOffset = listBaseOffset + clampedProgress * -listBaseOffset;
                            listLayerRef.current.style.transform = `translate3d(${listOffset}px, 0, 0)`;
                            listLayerRef.current.style.opacity = `${0.9 + clampedProgress * 0.1}`;
                        }
                    }}
                    onSwipeEnd={(closing) => {
                        if (listLayerRef.current) {
                            listLayerRef.current.style.transition = 'transform 250ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity 250ms ease';
                            if (closing) {
                                listLayerRef.current.style.transform = 'translate3d(0, 0, 0)';
                                listLayerRef.current.style.opacity = '1';
                            } else {
                                listLayerRef.current.style.transform = '';
                                listLayerRef.current.style.opacity = '';
                            }
                        }
                    }}
                />
            </div>

            {/* Chat Layer */}
            {activeContact && (
                <div
                    ref={setChatLayerRef}
                    className={`absolute inset-0 h-full w-full bg-background z-20 shadow-2xl ${animationClass}`}
                    style={{ touchAction: 'pan-y' }}
                >
                    <div
                        className="absolute left-0 top-0 bottom-0 w-6 z-50"
                        style={{ touchAction: "none" }}
                    />

                    <div className={chatShadowClassName} />

                    <ChatArea contact={activeContact} onBack={handleChatBack} />
                </div>
            )}
        </div>
    );
}
