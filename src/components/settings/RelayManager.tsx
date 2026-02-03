import { useEffect, useState } from "react";
import { useRelayStore } from "@/store/relayStore";
import { useUIStore } from "@/store/uiStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Plus, Trash2, Activity, Server, Save, Eye, EyeOff, Copy } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";

interface RelayManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RelayManager({ open }: RelayManagerProps) {
  const {
    myRelays,
    config,
    statuses,
    isLoading,
    isPublishing,
    isHealthChecking,
    getMyRelays,
    publishRelayList,
    addCustomRelay,
    removeCustomRelay,
    getRelayConfig,
    getRelayStatuses,
    checkRelaysHealth,
  } = useRelayStore();

  const { isAuthenticated } = useAuthStore();
  const [newRelayUrl, setNewRelayUrl] = useState("");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [isAddingRelay, setIsAddingRelay] = useState(false);
  const [showMediaServerToken, setShowMediaServerToken] = useState(false);

  const {
    updateLocalRelay
  } = useRelayStore();

  useEffect(() => {
    if (open && isAuthenticated) {
      const init = async () => {
        await getRelayConfig();
        getMyRelays();
        getRelayStatuses();
      };
      init();
    }
  }, [open, isAuthenticated]);

  const handleAddRelay = async () => {
    if (!newRelayUrl || isAddingRelay) return;
    setIsAddingRelay(true);
    try {
      await addCustomRelay(newRelayUrl);
      setNewRelayUrl("");
      setShowAddDialog(false);
    } catch (error) {
      // Error already shown in store
    } finally {
      setIsAddingRelay(false);
    }
  };

  const handleRemoveRelay = async (url: string) => {
    try {
      await removeCustomRelay(url);
    } catch (error) {
      // Error already shown in store
    }
  };

  const handlePublish = async () => {
    try {
      // Publish current myRelays
      await publishRelayList(myRelays);
    } catch (error) {
      // Error already shown in store
    }
  };

  const handleHealthCheck = async () => {
    const urls = [...config.customRelays];
    if (urls.length > 0) {
      await checkRelaysHealth(urls);
    }
  };

  const copyMediaServerToken = async () => {
    if (!config.mediaServerToken) {
      toast.error("暂无令牌可复制");
      return;
    }
    try {
      await navigator.clipboard.writeText(config.mediaServerToken);
      toast.success("令牌已复制到剪贴板");
    } catch {
      toast.error("复制失败");
    }
  };

  const getHealthDot = (url: string) => {
    const status = statuses.find((s) => s.url === url);
    if (!status) return <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30 animate-pulse" />;

    switch (status.status) {
      case "connected":
        return <div className="h-1.5 w-1.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" />;
      case "connecting":
        return <div className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />;
      default:
        return <div className="h-1.5 w-1.5 rounded-full bg-destructive/60" />;
    }
  };

  return (
    <div className="space-y-3 pb-6 px-1">
      {/* 中继器管理 */}
      <section className="p-3 bg-muted/30 rounded-xl border border-border/50 space-y-3">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold flex items-center gap-2 text-foreground/90">
              <Server className="h-3.5 w-3.5 text-primary" />
              中继器设置
            </h3>
            <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
              <DialogTrigger asChild>
                <Button variant="secondary" size="sm" className="h-6 text-xs font-medium px-2.5 shadow-sm border border-border/50 hover:bg-background">
                  <Plus className="h-3 w-3 mr-1.5" />
                  添加中继器
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md p-5 rounded-lg border-border shadow-2xl">
                <DialogHeader>
                  <DialogTitle className="text-sm font-mono tracking-tighter">添加中继器</DialogTitle>
                  <DialogDescription className="text-xs">
                    请输入 WebSocket 协议地址 (wss://)。
                  </DialogDescription>
                </DialogHeader>
                <Input
                  placeholder="wss://relay.example.com"
                  value={newRelayUrl}
                  onChange={(e) => setNewRelayUrl(e.target.value)}
                  disabled={isAddingRelay}
                  className="font-mono text-xs h-8 rounded-sm bg-muted/30"
                />
                <DialogFooter className="gap-2">
                  <Button
                    variant="ghost"
                    className="h-8 text-xs px-4 rounded-sm"
                    onClick={() => setShowAddDialog(false)}
                    disabled={isAddingRelay}
                  >
                    取消
                  </Button>
                  <Button className="h-8 text-xs px-6 rounded-sm bg-primary" onClick={handleAddRelay} disabled={isAddingRelay}>
                    {isAddingRelay ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : null}
                    {isAddingRelay ? "添加中" : "确认添加"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            管理您的中继器。添加中继器后，请点击“同步至网络”以便让其他人发现您。
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-4 bg-muted/20 rounded-lg border border-dashed border-border/50">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground mr-2" />
            <span className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest">正在访问网络...</span>
          </div>
        ) : config.customRelays.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 px-4 bg-muted/20 rounded-lg border border-dashed border-border/50 gap-2 text-center">
            <Server className="h-6 w-6 text-muted-foreground/30 mb-1" />
            <p className="text-xs font-medium text-muted-foreground">未连接到网络</p>
            <p className="text-[10px] text-muted-foreground/70 max-w-[240px]">
              请点击右上角“添加中继器”，以便同步您的中继器列表。
            </p>
          </div>
        ) : myRelays.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 px-4 bg-muted/20 rounded-lg border border-dashed border-border/50 gap-2 text-center">
            <p className="text-xs font-medium text-muted-foreground">中继器列表为空</p>
            <p className="text-[10px] text-muted-foreground/70 max-w-[240px]">
              暂无中继器。您可以点击右上角添加，然后同步发布。
            </p>
          </div>
        ) : (
          <div className="overflow-hidden bg-background/50 rounded-lg border border-border/30">
            {useUIStore.getState().isMobile ? (
              <div className="divide-y divide-border/30">
                {myRelays.map((relay, idx) => (
                  <div key={idx} className="p-2.5 group hover:bg-muted/5 transition-colors">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className="font-mono text-[10px] truncate leading-none">{relay.url}</span>
                        {getHealthDot(relay.url)}
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-5 w-5 text-muted-foreground/40 hover:text-destructive transition-colors shrink-0"
                        onClick={() => handleRemoveRelay(relay.url)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                    <div className="flex gap-4">
                      <div className="flex items-center gap-2">
                        <span className="text-[0.6rem] text-muted-foreground font-medium uppercase tracking-tighter">读取</span>
                        <Switch
                          className="scale-75 origin-left"
                          checked={relay.read}
                          onCheckedChange={(checked: boolean) => updateLocalRelay(relay.url, checked, relay.write)}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[0.6rem] text-muted-foreground font-medium uppercase tracking-tighter">写入</span>
                        <Switch
                          className="scale-75 origin-left"
                          checked={relay.write}
                          onCheckedChange={(checked: boolean) => updateLocalRelay(relay.url, relay.read, checked)}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <Table>
                <TableBody>
                  {myRelays.map((relay, idx) => (
                    <TableRow key={idx} className="hover:bg-muted/5 group border-b border-border/30 last:border-0 h-8">
                      <TableCell className="py-1">
                        <div className="flex items-center gap-2">
                          {getHealthDot(relay.url)}
                          <span className="font-mono text-[10px] opacity-80 group-hover:opacity-100 transition-opacity" title={relay.url}>
                            {relay.url}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="w-14 py-1">
                        <div className="flex items-center gap-1.5 text-[0.6rem] text-muted-foreground">
                          <span>读</span>
                          <Switch
                            className="scale-75"
                            checked={relay.read}
                            onCheckedChange={(checked: boolean) => updateLocalRelay(relay.url, checked, relay.write)}
                          />
                        </div>
                      </TableCell>
                      <TableCell className="w-14 py-1">
                        <div className="flex items-center gap-1.5 text-[0.6rem] text-muted-foreground">
                          <span>写</span>
                          <Switch
                            className="scale-75"
                            checked={relay.write}
                            onCheckedChange={(checked: boolean) => updateLocalRelay(relay.url, relay.read, checked)}
                          />
                        </div>
                      </TableCell>
                      <TableCell className="w-8 py-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-5 w-5 text-muted-foreground/40 hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                          onClick={() => handleRemoveRelay(relay.url)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <Button
            className="flex-1 h-7 rounded-lg font-mono text-[10px] uppercase tracking-widest bg-primary shadow-none transition-all"
            onClick={handlePublish}
            disabled={isPublishing || config.customRelays.length === 0}
            title={config.customRelays.length === 0 ? "请先添加中继器" : "发布当前配置到网络"}
          >
            {isPublishing ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : <Save className="h-3 w-3 mr-2" />}
            同步至网络
          </Button>
          <Button
            variant="outline"
            className="h-7 w-7 p-0 rounded-lg border-border/50 hover:bg-muted/50 transition-colors"
            onClick={handleHealthCheck}
            disabled={isHealthChecking}
            title="开始连接探测"
          >
            {isHealthChecking ? <Loader2 className="h-3 w-3 animate-spin" /> : <Activity className="h-3 w-3" />}
          </Button>
          <Button
            variant="outline"
            className="h-7 w-7 p-0 rounded-lg border-border/50 hover:bg-muted/50 transition-colors"
            onClick={getMyRelays}
            title="拉取最新列表"
          >
            <Loader2 className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </section>

      {/* 媒体服务器配置 */}
      <section className="p-3 bg-muted/30 rounded-lg border border-border/50 space-y-3">
        <div className="space-y-1">
          <h3 className="text-xs font-semibold flex items-center gap-2">
            <Activity className="h-3 w-3 text-primary" />
            媒体服务器
          </h3>
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            配置用于图片上传的 Blossom 服务器地址。
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="https://blossom.example.com"
              value={config.mediaServer || ""}
              onChange={(e) => useRelayStore.getState().updateMediaServer(e.target.value)}
              className="flex-1 h-8 rounded-sm border border-border/50 bg-background/50 px-3 text-[10px] font-mono focus:outline-none focus:ring-1 focus:ring-primary/30"
            />
            <div className="w-[60px] flex items-center justify-end">
              <Button
                size="sm"
                onClick={async () => {
                  try {
                    await invoke("set_media_server", {
                      url: config.mediaServer || "",
                      token: config.mediaServerToken || null
                    });
                    toast.success("媒体服务器已更新");
                  } catch (error) {
                    toast.error(`更新失败: ${error}`);
                  }
                }}
                className="h-8 w-full rounded-lg text-[10px]"
              >
                保存
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {showMediaServerToken ? (
              <input
                type="text"
                placeholder="AUTH_TOKEN (可选)"
                value={config.mediaServerToken || ""}
                onChange={(e) => useRelayStore.getState().updateMediaServerToken(e.target.value)}
                className="flex-1 min-w-0 max-w-full overflow-hidden text-[10px] text-muted-foreground font-mono bg-background/50 border border-border/30 px-3 py-1.5 rounded-sm min-h-[36px] focus:outline-none focus:ring-1 focus:ring-primary/30"
              />
            ) : (
              <div className="flex-1 min-w-0 max-w-full overflow-hidden text-[10px] text-muted-foreground font-mono bg-background/50 border border-border/30 px-3 py-1.5 rounded-sm min-h-[36px] flex items-center">
                {config.mediaServerToken ? (
                  <span className="block w-full truncate whitespace-nowrap opacity-50">••••••••••••••••••••••••••••••••</span>
                ) : (
                  <span className="block w-full truncate whitespace-nowrap opacity-50">AUTH_TOKEN (可选)</span>
                )}
              </div>
            )}
            <div className="w-[60px] flex items-center justify-end gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setShowMediaServerToken(!showMediaServerToken)}
              >
                {showMediaServerToken ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={copyMediaServerToken}
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
