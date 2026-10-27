import { forwardRef, type HTMLAttributes, type InputHTMLAttributes, type LabelHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("panel p-4", className)} {...props} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("heading text-sm uppercase mb-3 flex items-center gap-2", className)} {...props} />;
}

export function Badge({ className, color, style, ...props }: HTMLAttributes<HTMLSpanElement> & { color?: string }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[11px] font-medium leading-none", className)}
      style={color ? { color, borderColor: `${color}55`, backgroundColor: `${color}14`, ...style } : style}
      {...props}
    />
  );
}

export function Progress({ value, className, barClassName, color }: { value: number; className?: string; barClassName?: string; color?: string }) {
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-surface-2", className)} role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div
        className={cn("h-full rounded-full bg-gradient-to-r from-gold-deep to-gold transition-[width] duration-700", barClassName)}
        style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, ...(color ? { background: color } : {}) }}
      />
    </div>
  );
}

const field = "w-full rounded-md border border-border bg-bg/60 px-3 py-2 text-sm text-text placeholder:text-muted/70 focus:outline-none focus:ring-2 focus:ring-electric/50";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => (
  <input ref={ref} className={cn(field, "h-9", className)} {...p} />
));
Input.displayName = "Input";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...p }, ref) => (
  <textarea ref={ref} className={cn(field, "min-h-20", className)} {...p} />
));
Textarea.displayName = "Textarea";

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(({ className, ...p }, ref) => (
  <select ref={ref} className={cn(field, "h-9 py-0", className)} {...p} />
));
Select.displayName = "Select";

export function Label({ className, ...p }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("mb-1 block text-xs font-medium text-muted", className)} {...p} />;
}
