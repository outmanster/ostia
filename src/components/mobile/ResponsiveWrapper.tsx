import React from "react";
import { useMobileDetection } from "@/hooks/useMobileDetection";
import { MobileLayout } from "@/components/mobile/MobileLayout";
import { DesktopLayout } from "@/components/layout/DesktopLayout";

interface ResponsiveWrapperProps {
  children: React.ReactNode;
}

/**
 * 响应式包装器
 * 根据屏幕尺寸自动选择移动端或桌面端布局
 */
export function ResponsiveWrapper({ children }: ResponsiveWrapperProps) {
  const { isMobile, isTablet } = useMobileDetection();

  // 移动端 (< 768px)
  if (isMobile) {
    return <MobileLayout>{children}</MobileLayout>;
  }

  // 平板端 (768px - 1024px) - 可以使用桌面布局但调整一些参数
  if (isTablet) {
    return (
      <DesktopLayout>
        <div className="max-w-4xl mx-auto p-4">
          {children}
        </div>
      </DesktopLayout>
    );
  }

  // 桌面端 (>= 1024px)
  return <DesktopLayout>{children}</DesktopLayout>;
}

/**
 * 移动端优先的组件
 * 为移动端优化的组件变体
 */
export function MobileFirstComponent<T extends object>(
  Component: React.ComponentType<T>,
  MobileComponent: React.ComponentType<T>
) {
  return (props: T) => {
    const { isMobile } = useMobileDetection();
    const ComponentToRender = isMobile ? MobileComponent : Component;
    return <ComponentToRender {...props} />;
  };
}

/**
 * 平台特定的钩子包装
 * 提供平台特定的功能和行为
 */
export function usePlatformFeatures() {
  const { isMobile, isTablet, isDesktop } = useMobileDetection();

  return {
    // 平台检测
    isMobile,
    isTablet,
    isDesktop,

    // 功能支持
    supportsNotifications: typeof window !== "undefined" && "Notification" in window,
    supportsVibration: typeof navigator !== "undefined" && "vibrate" in navigator,
    supportsShare: typeof navigator !== "undefined" && "share" in navigator,

    // UI 优化
    optimalListSize: isMobile ? 20 : isDesktop ? 50 : 30,
    shouldLazyLoad: isMobile || isTablet,
    useVirtualScrolling: isDesktop, // 桌面端使用虚拟滚动

    // 交互优化
    touchTargetSize: isMobile ? 44 : 32, // 最小触摸目标
    animationDuration: isMobile ? 150 : 200,
  };
}
