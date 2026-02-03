import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { useMobileDetection } from "@/hooks/useMobileDetection"

const Toaster = ({ ...props }: ToasterProps) => {
  const { isIOS, isMobile } = useMobileDetection()

  return (
    <Sonner
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      toastOptions={{
        style: isMobile ? {
          marginTop: isIOS ? "calc(env(safe-area-inset-top, 0px) + 50px)" : "60px",
        } : undefined,
        className: "group toast bg-white dark:bg-zinc-800 text-zinc-950 dark:text-zinc-50 border-zinc-200 dark:border-zinc-700 shadow-2xl rounded-xl",
      }}
      style={
        {
          "--normal-bg": "var(--background)",
          "--normal-text": "var(--foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius-lg)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
