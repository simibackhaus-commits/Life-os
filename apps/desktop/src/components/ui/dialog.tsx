import * as D from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" />
        <D.Content
          className={cn(
            "panel fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[min(640px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto bg-surface p-6 shadow-2xl",
            className,
          )}
        >
          <D.Title className="heading text-lg">{title}</D.Title>
          {description ? <D.Description className="mt-1 text-sm text-muted">{description}</D.Description> : <D.Description className="sr-only">{title}</D.Description>}
          <D.Close className="absolute right-4 top-4 text-muted hover:text-text" aria-label="Schließen">
            <X size={18} />
          </D.Close>
          <div className="mt-4">{children}</div>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
