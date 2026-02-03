import { invoke } from "@tauri-apps/api/core";
import type { Account, Profile, Message, Contact, RelayListEntry } from "@/types";

export async function generateAccount(): Promise<Account> {
  try {
    console.log("Invoking Tauri generate_account command...");
    const result = await invoke("generate_account") as Account;
    console.log("Tauri generate_account returned:", result);
    return result;
  } catch (error) {
    console.error("Tauri invoke error in generateAccount:", error);
    throw error;
  }
}

export async function importPrivateKey(nsec: string): Promise<string> {
  return await invoke("import_private_key", { nsec });
}

export async function savePrivateKey(nsec: string): Promise<void> {
  return await invoke("save_private_key", { nsec });
}

export async function loadStoredKey(): Promise<string | null> {
  return await invoke("load_stored_key");
}

export async function deleteStoredKey(): Promise<void> {
  return await invoke("delete_stored_key");
}

export async function getPublicKey(nsec: string): Promise<string> {
  return await invoke("get_public_key", { nsec });
}

export async function npubToHex(npub: string): Promise<string> {
  return await invoke("npub_to_hex", { npub });
}

export async function hasMasterPassword(): Promise<boolean> {
  return await invoke("has_master_password");
}

export async function saveEncryptedPrivateKey(nsec: string, masterPassword: string): Promise<void> {
  return await invoke("save_encrypted_private_key", { nsec, masterPassword });
}

export async function loadDecryptedPrivateKey(masterPassword: string): Promise<string> {
  return await invoke("load_decrypted_private_key", { masterPassword });
}

export type UnlockLockoutState = {
  date: string;
  attempts: number;
  locked: boolean;
};

export async function getUnlockLockoutState(): Promise<UnlockLockoutState> {
  return await invoke("get_unlock_lockout_state");
}

export async function recordUnlockFailure(): Promise<UnlockLockoutState> {
  return await invoke("record_unlock_failure");
}

export async function resetUnlockLockout(): Promise<void> {
  return await invoke("reset_unlock_lockout");
}

export async function deleteMasterPassword(): Promise<void> {
  return await invoke("delete_master_password");
}

export async function publishIdentity(
  name: string,
  about?: string
): Promise<void> {
  return await invoke("publish_identity", { name, about });
}

export async function fetchProfile(npub: string): Promise<Profile> {
  return await invoke("fetch_profile", { npub });
}

export async function sendMessage(
  receiver: string,
  content: string
): Promise<string> {
  return await invoke("send_message", { receiver, content });
}

export async function sendImage(
  receiver: string,
  imageData: Uint8Array,
  filename: string
): Promise<[string, string, string]> {
  // Convert Uint8Array to number array for Tauri
  const data = Array.from(imageData);
  return await invoke("send_image", { receiver, imageData: data, filename });
}

export async function sendReadReceipt(
  receiver: string,
  messageIds: string[]
): Promise<void> {
  return await invoke("send_read_receipt", { receiver, messageIds });
}

export async function sendTyping(
  receiver: string,
  typing: boolean
): Promise<void> {
  return await invoke("send_typing", { receiver, typing });
}

export async function publishPresence(
  online: boolean
): Promise<void> {
  return await invoke("publish_presence", { online });
}

export async function getMessages(
  contact: string,
  limit: number = 50,
  offset: number = 0
): Promise<Message[]> {
  return await invoke("get_messages", { contact, limit, offset });
}

export async function startMessageListener(): Promise<void> {
  return await invoke("start_message_listener");
}

export async function syncMessages(): Promise<number> {
  return await invoke("sync_messages");
}

export async function downloadImage(fullUrl: string): Promise<Uint8Array> {
  console.log("nostr.ts downloadImage - Input fullUrl:", fullUrl);
  console.log("nostr.ts downloadImage - Contains '#':", fullUrl.includes('#'));

  try {
    const data: number[] = await invoke("download_image", { fullUrl });
    console.log("nostr.ts downloadImage - Returned data length:", data.length);
    return new Uint8Array(data);
  } catch (error) {
    console.error("nostr.ts downloadImage - Failed:", error);
    throw error;
  }
}

export async function addContact(
  npub: string,
  remark?: string
): Promise<Contact> {
  return await invoke("add_contact", { npub, remark });
}

export async function removeContact(npub: string): Promise<void> {
  return await invoke("remove_contact", { npub });
}

export async function getContacts(): Promise<Contact[]> {
  return await invoke("get_contacts");
}

export async function resolveNickname(npub: string): Promise<string | null> {
  return await invoke("resolve_nickname", { npub });
}

export async function blockContact(
  npub: string,
  blocked: boolean
): Promise<void> {
  return await invoke("block_contact", { npub, blocked });
}

export async function getMyRelays(): Promise<RelayListEntry[]> {
  return await invoke("get_my_relays");
}

export async function publishRelayList(relays: RelayListEntry[]): Promise<string> {
  return await invoke("publish_relay_list", { relays });
}

export async function deleteLocalMessage(id: string): Promise<void> {
  return await invoke("delete_local_message", { id });
}

export async function clearConversation(contactNpub: string): Promise<void> {
  return await invoke("clear_conversation", { contactNpub });
}
