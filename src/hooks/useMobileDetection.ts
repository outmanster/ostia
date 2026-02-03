import { useState, useEffect } from "react";

const MOBILE_BREAKPOINT = 768;

export function useMobileDetection() {
  const [isMobile, setIsMobile] = useState(false);
  const [isTablet, setIsTablet] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const checkScreenSize = () => {
      const width = window.innerWidth;
      setIsMobile(width < MOBILE_BREAKPOINT);
      setIsTablet(width >= MOBILE_BREAKPOINT && width < 1024);
    };

    // Initial check
    checkScreenSize();

    // Add listener
    window.addEventListener("resize", checkScreenSize);

    // Check for iOS
    const checkIOS = () => {
      const userAgent = window.navigator.userAgent.toLowerCase();
      return /iphone|ipad|ipod/.test(userAgent);
    };

    setIsIOS(checkIOS());

    // Cleanup
    return () => window.removeEventListener("resize", checkScreenSize);
  }, []);

  return { isMobile, isTablet, isDesktop: !isMobile && !isTablet, isIOS };
}

export function useTouchSupport() {
  const [hasTouch, setHasTouch] = useState(false);

  useEffect(() => {
    setHasTouch(
      "ontouchstart" in window ||
      navigator.maxTouchPoints > 0 ||
      (navigator as any).msMaxTouchPoints > 0
    );
  }, []);

  return { hasTouch };
}

export function useKeyboardVisible() {
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) return;

    const handleResize = () => {
      const viewport = window.visualViewport;
      if (!viewport) return;

      const keyboardHeight = window.innerHeight - viewport.height;

      if (keyboardHeight > 100) {
        setIsKeyboardVisible(true);
        setKeyboardHeight(keyboardHeight);
      } else {
        setIsKeyboardVisible(false);
        setKeyboardHeight(0);
      }
    };

    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", handleResize);
      return () => window.visualViewport?.removeEventListener("resize", handleResize);
    }
  }, []);

  return { isKeyboardVisible, keyboardHeight };
}
