import { useEffect, useState } from "react";
import { Plus, Settings, LogOut, MoreVertical, MessageSquare, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { useUIStore } from "@/store/uiStore";
import { useAuthStore } from "@/store/authStore";
import { AddContactDialog } from "@/components/contacts/AddContactDialog";
import { SettingsDialog } from "@/components/settings/SettingsDialog";
import { ConnectionStatus } from "@/components/layout/ConnectionStatus";
import { truncateNpub } from "@/utils/format";
import type { Contact } from "@/types";
import { ContactList } from "./ContactList";
import { ChatList } from "./ChatList";

export function Sidebar() {
  const selectedContact = useContactStore(s => s.selectedContact);
  const selectContact = useContactStore(s => s.selectContact);
  const chatSessions = useContactStore(s => s.chatSessions);
  const totalUnread = chatSessions.reduce((acc, session) => acc + session.unread_count, 0);

  const isMobile = useUIStore(s => s.isMobile);
  const closeSidebar = useUIStore(s => s.closeSidebar);
  const activeTab = useUIStore(s => s.activeTab);
  const setActiveTab = useUIStore(s => s.setActiveTab);
  const showAddDialog = useUIStore(s => s.showAddContactDialog);
  const setShowAddDialog = useUIStore(s => s.setShowAddContactDialog);
  const showSettings = useUIStore(s => s.showSettingsDialog);
  const setShowSettings = useUIStore(s => s.setShowSettingsDialog);
  const npub = useAuthStore(s => s.npub);
  const profile = useAuthStore(s => s.profile);
  const logout = useAuthStore(s => s.logout);
  const isAuthLoading = useAuthStore(s => s.isLoading);

  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  useEffect(() => {
    // Use getState() to avoid dependency instability
    useContactStore.getState().loadContacts();
  }, []);

  const handleLogout = async () => {
    await logout();
    setShowLogoutConfirm(false);
  };

  // Handle contact selection
  const handleSelectContact = (contact: Contact) => {
    selectContact(contact);
    // Close sidebar on mobile when contact is selected
    if (isMobile) {
      closeSidebar();
    }
  };

  return (
    <div className="w-72 border-r flex flex-col bg-muted/30 h-full">

      {/* Title and Tabs */}
      <div className="shrink-0 pt-2 px-2 space-y-2">
        <div className="flex items-center justify-between px-1">
          <h2 className="font-bold text-[10px] uppercase tracking-widest text-muted-foreground">
            {activeTab === "chats" ? "消息列表" : "联系人"}
          </h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowAddDialog(true)}
            className="h-6 w-6 hover:bg-background"
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Tab Switcher */}
        <div className="flex p-0.5 bg-muted rounded-lg gap-0.5 border border-border/20 shadow-inner">
          <button
            onClick={() => setActiveTab("chats")}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-1 rounded-md text-xs font-medium transition-all relative",
              activeTab === "chats"
                ? "bg-background text-primary shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            <span>消息</span>
            {totalUnread > 0 && (
              <span className="absolute top-1 right-2 flex min-w-[16px] h-[16px] items-center justify-center rounded-full bg-red-500 text-[0.625rem] leading-none font-bold text-white ring-2 ring-background shadow-sm px-0.5 z-10">
                {badge > 99 ? "99+" : badge}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("contacts")}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-1 rounded-md text-xs font-medium transition-all",
              activeTab === "contacts"
                ? "bg-background text-primary shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Users className="h-3.5 w-3.5" />
            <span>联系人</span>
          </button>
        </div>
      </div>

      {/* List Content */}
      <div className="flex-1 overflow-hidden mt-1">
        {activeTab === "chats" ? (
          <ChatList
            onSelect={handleSelectContact}
            selectedNpub={selectedContact?.npub}
            className="flex-1"
          />
        ) : (
          <ContactList
            onSelect={handleSelectContact}
            selectedNpub={selectedContact?.npub}
            onAddContact={() => setShowAddDialog(true)}
            className="flex-1"
          />
        )}
      </div>

      {/* User Footer Section */}
      <div className="p-2 border-t bg-background/50">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Avatar className="h-8 w-8 border border-primary/10 transition-transform active:scale-95">
              <AvatarImage src={profile?.picture || undefined} />
              <AvatarFallback className="bg-primary/5 text-primary text-xs font-bold">
                {profile?.displayName?.slice(0, 2).toUpperCase() || profile?.name?.slice(0, 2).toUpperCase() || "ME"}
              </AvatarFallback>
            </Avatar>
            <ConnectionStatus minimal />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-col">
              <span className="font-semibold text-xs truncate">
                {profile?.displayName || profile?.name || truncateNpub(npub || "", 6)}
              </span>
              <span className="text-[10px] text-muted-foreground font-mono opacity-60">
                {truncateNpub(npub || "", 4)}
              </span>
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setShowSettings(true)}>
                <Settings className="mr-2 h-4 w-4" />
                <span>设置</span>
              </DropdownMenuItem>

              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={() => setShowLogoutConfirm(true)}
              >
                <LogOut className="mr-2 h-4 w-4" />
                <span>退出</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Dialogs */}
      <AddContactDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
      />

      <SettingsDialog open={showSettings} onOpenChange={setShowSettings} />

      <AlertDialog open={showLogoutConfirm} onOpenChange={setShowLogoutConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认退出登录？</AlertDialogTitle>
            <AlertDialogDescription>
              退出后需要重新输入私钥登录。请确保您已备份私钥。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleLogout();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isAuthLoading}
            >
              {isAuthLoading ? "正在退出..." : "确认退出"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
