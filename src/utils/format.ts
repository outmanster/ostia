export function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) {
    return "刚刚";
  } else if (diff < hour) {
    const minutes = Math.floor(diff / minute);
    return `${minutes}分钟前`;
  } else if (diff < day) {
    const hours = Math.floor(diff / hour);
    return `${hours}小时前`;
  } else if (diff < 7 * day) {
    const days = Math.floor(diff / day);
    return `${days}天前`;
  } else {
    return date.toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }
}

export function formatTime(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function truncateNpub(npub: string, length: number = 8): string {
  if (npub.length <= length * 2 + 3) {
    return npub;
  }
  return `${npub.slice(0, length)}...${npub.slice(-length)}`;
}

export function isValidNsec(nsec: string): boolean {
  return nsec.startsWith("nsec1") && nsec.length === 63;
}

export function isValidNpub(npub: string): boolean {
  return npub.startsWith("npub1") && npub.length === 63;
}
