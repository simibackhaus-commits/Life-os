import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric/60 disabled:pointer-events-none disabled:opacity-50 cursor-pointer",
  {
    variants: {
      variant: {
        gold: "bg-gold text-bg hover:bg-gold/90 font-semibold",
        violet: "bg-violet text-white hover:bg-violet/90",
        electric: "bg-electric text-bg hover:bg-electric/90 font-semibold",
        outline: "border border-border bg-surface-2/60 text-text hover:bg-surface-2 hover:border-muted/50",
        ghost: "text-muted hover:text-text hover:bg-surface-2",
        danger: "bg-danger/90 text-bg hover:bg-danger",
      },
      size: { sm: "h-8 px-3 text-xs", md: "h-9 px-4", lg: "h-11 px-6 text-base", icon: "h-9 w-9" },
    },
    defaultVariants: { variant: "outline", size: "md" },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, ...props }, ref) => (
  <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
));
Button.displayName = "Button";
