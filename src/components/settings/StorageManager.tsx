import { useState, useEffect } from "react";
import { toast } from "sonner";
import { invoke } from "@tauri-apps/api/core";
import { HardDrive, Database, Activity, Loader2, Info, FileOutput, FileInput, Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { save, open } from "@tauri-apps/plugin-dialog";
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

export function StorageManager() {
  const [isCleaning, setIsCleaning] = useState(false);
  const [isGettingStats, setIsGettingStats] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [showImportConfirm, setShowImportConfirm] = useState(false);
  const [importPath, setImportPath] = useState<string | null>(null);
  const [stats, setStats] = useState<{ messages: number; contacts: number; deleted: number; oldestDays: number | null } | null>(null);

  // Get database stats
  const getStats = async (silent = false) => {
    setIsGettingStats(true);
    try {
      // Rust returns: (u64, u64, u64, u64) where 0 means no data
      const result = await invoke<[number, number, number, number]>("get_database_stats");
      setStats({
        messages: result[0],
        contacts: result[1],
        deleted: result[2],
        oldestDays: result[3] > 0 ? result[3] : null
      });
      if (!silent) {
        toast.success("统计信息已更新");
      }
    } catch (error) {
      if (!silent) {
        toast.error(`获取统计失败: ${error}`);
      }
    } finally {
      setIsGettingStats(false);
    }
  };

  useEffect(() => {
    getStats(true);
  }, []);

  // Manual cleanup
  const handleCleanup = async (mode: "all" | "old" | "stranger" | "vacuum") => {
    setIsCleaning(true);
    try {
      const result = await invoke<[number, number, string]>("manual_cleanup", { mode });
      toast.success(result[2]);
      // Always refresh stats after cleanup
      await getStats(true);
    } catch (error) {
      toast.error(`清理失败: ${error}`);
    } finally {
      setIsCleaning(false);
    }
  };

  // Export Data
  const handleExport = async () => {
    setIsExporting(true);
    try {
      const path = await save({
        filters: [{ name: 'Ostia Database', extensions: ['db'] }],
        defaultPath: 'ostia_backup.db',
      });

      if (!path) {
        setIsExporting(false);
        return;
      }

      await invoke('export_database', { path });
      toast.success('数据导出成功');
    } catch (error) {
      toast.error(`导出失败: ${error}`);
    } finally {
      setIsExporting(false);
    }
  };

  // Import Data (Step 1: Select File)
  const handleImportSelect = async () => {
    try {
      const selected = await open({
        title: "选择备份文件",
        multiple: false,
        directory: false,
      });

      if (selected) {
        setImportPath(selected as string);
        setShowImportConfirm(true);
      }
    } catch (error) {
      toast.error(`选择文件失败: ${error}`);
    }
  };

  // Import Data (Step 2: Confirm & Execute)
  const handleImportExecute = async () => {
    if (!importPath) return;

    setIsImporting(true);
    setShowImportConfirm(false);

    try {
      await invoke('import_database', { path: importPath });
      toast.success('数据导入成功');
      await getStats(true);
    } catch (error) {
      toast.error(`导入失败: ${error}`);
    } finally {
      setIsImporting(false);
      setImportPath(null);
    }
  };

  return (
    <div className="space-y-3 pb-6 px-1">
      {/* 数据库概览 */}
      <section className="p-3 bg-muted/30 rounded-lg border border-border/50 space-y-3">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h3 className="text-xs font-semibold flex items-center gap-2">
              <Database className="h-3 w-3 text-primary" />
              存储状态
            </h3>
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              本地数据库的当前记录统计。
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => getStats(false)}
            disabled={isGettingStats}
            className="h-6 text-[10px] uppercase tracking-widest rounded-lg border-border/50 px-2"
          >
            <Activity className={`h-3 w-3 mr-1.5 ${isGettingStats ? 'animate-spin' : ''}`} />
            刷新
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {[
            { label: "消息总数", value: stats ? stats.messages.toLocaleString() : "-" },
            { label: "联系人", value: stats ? stats.contacts.toLocaleString() : "-" },
            { label: "已删除记录", value: stats ? stats.deleted.toLocaleString() : "-" },
            { label: "历史跨度", value: stats?.oldestDays ? `${stats.oldestDays} 天` : "无数据" }
          ].map((item, i) => (
            <div key={i} className="p-2.5 bg-background/50 rounded-lg border border-border/30 space-y-0.5 hover:bg-background/80 transition-colors">
              <div className="text-[0.6rem] text-muted-foreground font-bold uppercase tracking-widest opacity-70">
                {item.label}
              </div>
              <div className="text-lg font-semibold tracking-tight">
                {item.value}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 维护与清理 */}
      <section className="p-3 bg-muted/30 rounded-lg border border-border/50 space-y-3">
        <div className="space-y-1">
          <h3 className="text-xs font-semibold flex items-center gap-2">
            <HardDrive className="h-3 w-3 text-primary" />
            维护与清理
          </h3>
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            执行数据库优化和过期数据清理操作，释放存储空间。
          </p>
        </div>

        <div className="space-y-2">
          {[
            {
              title: "深度清理",
              desc: "清理日志、过期消息并压缩数据库。",
              badge: "推荐",
              mode: "all",
              variant: "default" as const
            },
            {
              title: "仅清理过期",
              desc: "仅删除 7 天前的消息记录。",
              mode: "old",
              variant: "secondary" as const
            },
            {
              title: "数据库压缩",
              desc: "重建数据库文件以释放空间。",
              mode: "vacuum",
              variant: "outline" as const
            }
          ].map((op, i) => (
            <div key={i} className="flex items-center justify-between p-2.5 bg-background/50 border border-border/30 rounded-lg hover:bg-background/80 transition-colors">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold">{op.title}</span>
                  {op.badge && (
                    <Badge variant="outline" className="text-[0.6rem] px-1 py-0 h-3.5 border-primary/20 text-primary bg-primary/5">{op.badge}</Badge>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground leading-normal">
                  {op.desc}
                </p>
              </div>
              <Button
                size="sm"
                variant={op.variant}
                className="h-6 text-[10px] px-3 rounded-lg"
                onClick={() => handleCleanup(op.mode as any)}
                disabled={isCleaning}
              >
                {isCleaning ? <Loader2 className="h-3 w-3 animate-spin" /> : "执行"}
              </Button>
            </div>
          ))}
        </div>

        <div className="flex items-start gap-2 p-2 bg-amber-500/10 border border-amber-500/20 rounded-lg">
          <Info className="h-3 w-3 text-amber-600/70 mt-0.5 shrink-0" />
          <p className="text-[10px] text-amber-800/80 dark:text-amber-200/80 leading-relaxed">
            注意：清理操作不可撤销。建议定期执行"深度清理"以保持应用流畅运行。
          </p>
        </div>
      </section>

      {/* 数据备份与恢复 */}
      <section className="p-3 bg-muted/30 rounded-lg border border-border/50 space-y-3">
        <div className="space-y-1">
          <h3 className="text-xs font-semibold flex items-center gap-2">
            <Archive className="h-3 w-3 text-primary" />
            备份与恢复
          </h3>
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            将本地数据导出为备份文件，或从备份文件恢复数据。
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            className="h-16 flex flex-col gap-1.5 border-border/50 hover:bg-background/80"
            onClick={handleExport}
            disabled={isExporting || isImporting}
          >
            {isExporting ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : <FileOutput className="h-4 w-4 text-primary" />}
            <div className="space-y-0">
              <span className="text-xs font-semibold block">导出数据</span>
              <span className="text-[10px] text-muted-foreground block font-normal">保存为 .db 文件</span>
            </div>
          </Button>

          <Button
            variant="outline"
            className="h-16 flex flex-col gap-1.5 border-border/50 hover:bg-background/80"
            onClick={handleImportSelect}
            disabled={isExporting || isImporting}
          >
            {isImporting ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : <FileInput className="h-4 w-4 text-primary" />}
            <div className="space-y-0">
              <span className="text-xs font-semibold block">导入数据</span>
              <span className="text-[10px] text-muted-foreground block font-normal">覆盖当前数据</span>
            </div>
          </Button>
        </div>
      </section>

      <AlertDialog open={showImportConfirm} onOpenChange={setShowImportConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认导入数据？</AlertDialogTitle>
            <AlertDialogDescription>
              此操作将<span className="text-destructive font-bold">完全覆盖</span>当前的本地数据（消息、联系人、缓存）。
              <br /><br />
              建议在导入前先导出当前数据作为备份。此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleImportExecute} className="bg-destructive hover:bg-destructive/90">
              确认覆盖导入
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
