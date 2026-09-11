import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "ghost" | "signal-outline";
type Size = "sm" | "md" | "lg";

const BASE = "inline-flex items-center justify-center rounded-full font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-void disabled:opacity-50 disabled:cursor-not-allowed";

const VARIANT: Record<Variant, string> = {
  primary:
    "bg-signal text-void tracking-tight hover:brightness-110 active:scale-[0.98] motion-reduce:active:scale-100 shadow-signal transition-[filter,transform]",
  ghost:
    "border border-border-strong text-text-secondary hover:border-signal/50 hover:text-text-primary transition-colors",
  "signal-outline":
    "border border-signal/40 text-signal hover:bg-signal/10 active:scale-[0.98] motion-reduce:active:scale-100 transition-[filter,transform,background-color]",
};

const SIZE: Record<Size, string> = {
  sm: "px-5 min-h-[44px] text-sm",
  md: "px-6 min-h-[44px] text-sm",
  lg: "px-8 min-h-[48px] text-base",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  className?: string;
  children: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "ghost", size = "md", fullWidth, className, children, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      {...props}
      className={`${BASE} ${VARIANT[variant]} ${SIZE[size]}${fullWidth ? " w-full" : ""}${className ? ` ${className}` : ""}`}
    >
      {children}
    </button>
  );
});
