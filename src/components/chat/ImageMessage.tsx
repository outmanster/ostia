import { useState, useEffect } from "react";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ZoomIn, Download, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { downloadImage } from "@/utils/nostr";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { useInView } from "react-intersection-observer";

interface ImageMessageProps {
  mediaUrl: string;
  timestamp: number;
  lazyLoad?: boolean; // Enable lazy loading
}

export function ImageMessage({ mediaUrl, timestamp, lazyLoad = true }: ImageMessageProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [hasStartedLoading, setHasStartedLoading] = useState(false);

  // Intersection Observer for lazy loading
  const { ref, inView } = useInView({
    threshold: 0.1,
    triggerOnce: true,
    rootMargin: "100px", // Start loading 100px before visible
  });

  // Auto-trigger lazy load when in view
  useEffect(() => {
    if (lazyLoad && inView && !hasStartedLoading && !imageUrl) {
      downloadAndDecrypt();
    }
  }, [inView, lazyLoad, hasStartedLoading, imageUrl]);

  // Auto-download immediately if lazy loading is disabled
  useEffect(() => {
    if (!lazyLoad && !hasStartedLoading && !imageUrl) {
      downloadAndDecrypt();
    }
  }, [lazyLoad, hasStartedLoading, imageUrl, mediaUrl]);

  const downloadAndDecrypt = async () => {
    if (imageUrl || hasStartedLoading) return; // Already loaded or loading

    setHasStartedLoading(true);
    setIsLoading(true);
    setError(null);

    try {
      // Download and decrypt image
      const result = await downloadImage(mediaUrl);

      // Convert byte array to blob and create URL
      const blob = new Blob([result as any], { type: "image/webp" });
      const url = URL.createObjectURL(blob);
      setImageUrl(url);

      // Cache the image URL in memory for reuse
      if (window.imageCache) {
        window.imageCache[mediaUrl] = url;
      } else {
        window.imageCache = { [mediaUrl]: url };
      }
    } catch (err: any) {
      const msg = typeof err === 'string' ? err : (err instanceof Error ? err.message : "下载失败");
      setError(msg);
      toast.error("图片下载失败", {
        description: msg
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleImageClick = () => {
    if (imageUrl) {
      setShowDialog(true);
    } else if (!lazyLoad) {
      // If not using lazy load, download immediately on click
      downloadAndDecrypt();
    }
  };

  const handleDownload = async () => {
    if (!imageUrl) return;

    try {
      // Convert blob URL back to file and download
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const arrayBuffer = await blob.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      const path = await save({
        title: "保存图片",
        defaultPath: `image_${timestamp}.webp`,
        filters: [{ name: "WebP Images", extensions: ["webp"] }]
      });

      if (path) {
        await writeFile(path, uint8Array);
        toast.success("图片已保存");
      }
    } catch (err) {
      console.error("Failed to save image:", err);
      toast.error("保存失败", {
        description: err instanceof Error ? err.message : "未知错误"
      });
    }
  };

  // Check cache first on mount or when mediaUrl changes
  useEffect(() => {
    // If already loaded or loading, don't do anything
    if (imageUrl || hasStartedLoading) {
      return;
    }

    // Check cache first
    if (window.imageCache && window.imageCache[mediaUrl]) {
      setImageUrl(window.imageCache[mediaUrl]);
      return;
    }

    // If not lazy loading, start loading immediately
    if (!lazyLoad) {
      downloadAndDecrypt();
    }
  }, [mediaUrl, lazyLoad, imageUrl, hasStartedLoading]);

  return (
    <div className="inline-block" ref={ref}>
      {imageUrl ? (
        <div className="relative group block">
          <img
            src={imageUrl}
            alt="Image message"
            className="max-w-[180px] max-h-[220px] w-auto h-auto rounded-lg cursor-zoom-in object-contain block"
            onClick={handleImageClick}
            loading="lazy"
          />
          <Button
            size="icon"
            variant="secondary"
            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity h-7 w-7"
            onClick={handleDownload}
          >
            <Download className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : error ? (
        <div className="inline-block p-3 bg-red-50 dark:bg-red-900/20 rounded-lg text-red-600 dark:text-red-400 text-sm">
          <p>图片加载失败</p>
          <p className="text-xs mt-1">{error}</p>
          <Button size="sm" variant="outline" className="mt-2" onClick={downloadAndDecrypt}>
            重试
          </Button>
        </div>
      ) : isLoading ? (
        <div className="inline-block space-y-2">
          <Skeleton className="h-[200px] w-[250px] rounded-lg" />
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            正在解密...
          </div>
        </div>
      ) : lazyLoad ? (
        <div className="inline-block space-y-2">
          <Skeleton className="h-[200px] w-[250px] rounded-lg" />
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>等待加载...</span>
          </div>
        </div>
      ) : (
        <Button
          variant="outline"
          className="gap-2"
          onClick={downloadAndDecrypt}
        >
          <ZoomIn className="h-4 w-4" />
          点击查看加密图片
        </Button>
      )}

      {/* Image Preview Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent
          className="max-w-4xl p-0 bg-transparent border-0 shadow-none"
          showCloseButton={false}
        >
          <div className="relative">
            <img
              src={imageUrl || ""}
              alt="Image preview"
              className="max-h-[80vh] w-auto rounded-lg mx-auto"
            />
            <div className="absolute top-2 right-2 flex items-center gap-2">
              <Button
                size="icon"
                variant="secondary"
                className="h-8 w-8"
                onClick={handleDownload}
              >
                <Download className="h-4 w-4" />
              </Button>
              <DialogClose asChild>
                <Button size="icon" variant="secondary" className="h-8 w-8">
                  <X className="h-4 w-4" />
                </Button>
              </DialogClose>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
