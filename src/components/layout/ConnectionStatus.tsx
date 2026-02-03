import { useEffect } from "react";
import { Wifi, WifiOff, RefreshCw, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useConnectionStore, type ConnectionStatus } from "@/store/connectionStore";
import { cn } from "@/lib/utils";

const statusConfig: Record<ConnectionStatus, {
  label: string;
  color: string;
  icon: typeof Wifi;
}> = {
  connecting: {
    label: "连接中",
    color: "bg-amber-500",
    icon: Loader2,
  },
  connected: {
    label: "已连接",
    color: "bg-green-500",
    icon: Wifi,
  },
  disconnected: {
    label: "未连接",
    color: "bg-gray-400",
    icon: WifiOff,
  },
  error: {
    label: "连接失败",
    color: "bg-red-500",
    icon: WifiOff,
  },
};

export function ConnectionStatus({ minimal = false }: { minimal?: boolean }) {
  const { status, isSyncing, syncMessages, checkConnection, lastSync } = useConnectionStore();

  useEffect(() => {
    checkConnection();
  }, [checkConnection]);

  const config = statusConfig[status];
  const Icon = config.icon;

  const formatLastSync = () => {
    if (!lastSync) return "从未同步";
    const diff = Date.now() - lastSync;
    if (diff < 60000) return "刚刚";
    if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
    return `${Math.floor(diff / 3600000)} 小时前`;
  };

  if (minimal) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={cn(
              "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background z-10",
              config.color,
              status === "connecting" && "animate-pulse",
              status === "connected" && "shadow-[0_0_6px_rgba(34,197,94,0.4)]"
            )} />
          </TooltipTrigger>
          <TooltipContent side="right" className="text-[10px] font-mono">
            <p>{config.label}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <div className="flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant="outline"
              className={cn(
                "gap-1.5 px-2 py-0.5 cursor-default",
                status === "connected" && "border-green-200 bg-green-50 text-green-700",
                status === "connecting" && "border-amber-200 bg-amber-50 text-amber-700",
                status === "disconnected" && "border-gray-200 bg-gray-50 text-gray-600",
                status === "error" && "border-red-200 bg-red-50 text-red-700"
              )}
            >
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  config.color,
                  status === "connecting" && "animate-pulse"
                )}
              />
              <Icon
                className={cn(
                  "h-3 w-3",
                  status === "connecting" && "animate-spin"
                )}
              />
              <span className="text-xs">{config.label}</span>
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p>上次同步: {formatLastSync()}</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={syncMessages}
              disabled={isSyncing || status !== "connected"}
            >
              <RefreshCw
                className={cn(
                  "h-4 w-4",
                  isSyncing && "animate-spin"
                )}
              />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>同步消息</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
