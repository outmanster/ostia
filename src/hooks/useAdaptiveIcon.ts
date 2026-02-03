
import { useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import { useTheme } from 'next-themes';
import iconWhite from '@/assets/icons/icon_white.png';
import iconDark from '@/assets/icons/icon_dark.png';

export function useAdaptiveIcon() {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const updateIcon = async () => {
      try {
        const isWindows = /windows/i.test(navigator.userAgent);

        // Fetch icon data - use fetch for dev mode, direct import for release
        const getBytes = async (path: string) => {
          try {
            // Try fetch first (works in dev mode)
            const response = await fetch(path);
            if (response.ok) {
              const blob = await response.blob();
              return new Uint8Array(await blob.arrayBuffer());
            }
          } catch (e) {
            // Fetch failed, fall back to direct import
          }

          // Fallback: use the imported module directly
          // In release mode, the imported module contains the image data
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.src = path;

          await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject(new Error('Failed to load image'));
          });

          // Create canvas to extract pixel data
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            throw new Error('Failed to get canvas context');
          }
          ctx.drawImage(img, 0, 0);

          // Convert to blob (PNG) to match what Rust image::load_from_memory expects
          return new Promise<Uint8Array>((resolve, reject) => {
            canvas.toBlob(async (blob) => {
              if (!blob) {
                reject(new Error('Failed to create blob from canvas'));
                return;
              }
              const buffer = await blob.arrayBuffer();
              resolve(new Uint8Array(buffer));
            }, 'image/png');
          });
        };

        if (isWindows) {
          // Get actual Windows theme settings from registry
          const registryTheme = await invoke<{ system: string, apps: string }>('get_windows_theme_settings');

          // Taskbar (Big) icon depends on system theme (taskbar/start)
          // Window (Small) icon depends on apps theme (title bars)
          const taskbarBytes = await getBytes(registryTheme.system === 'dark' ? iconWhite : iconDark);
          const windowBytes = await getBytes(registryTheme.apps === 'dark' ? iconWhite : iconDark);

          await invoke('set_windows_icons', {
            taskbarIcon: Array.from(taskbarBytes),
            windowIcon: Array.from(windowBytes)
          });
          console.log(`Updated Windows icons auto-detected: Taskbar(${registryTheme.system}), Window(${registryTheme.apps})`);
        } else {
          // Other platforms use standard behavior
          const iconPath = resolvedTheme === 'dark' ? iconWhite : iconDark;
          const bytes = await getBytes(iconPath);
          await getCurrentWindow().setIcon(bytes);
        }
      } catch (error) {
        console.error('Failed to update window icon:', error);
      }
    };

    updateIcon();
  }, [resolvedTheme]);
}
