import { cn } from "@/lib/utils";

interface MobileHeaderProps {
    title: string;
    actionButton?: React.ReactNode;
    className?: string;
}

export function MobileHeader({ title, actionButton, className }: MobileHeaderProps) {
    return (
        <div
            className={cn(
                "p-4 pb-2 border-b bg-background/85 backdrop-blur-md shrink-0 flex items-center justify-between z-10 sticky top-0",
                className
            )}
            style={{ paddingTop: "max(1.25rem, env(safe-area-inset-top))" }}
        >
            <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
            {actionButton ? actionButton : <div className="w-8" />}
        </div>
    );
}

