import * as React from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "danger" | "ghost";

export function Button({
  className,
  variant = "primary",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const variants: Record<Variant, string> = {
    primary: "ui-button-primary bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] border-transparent",
    secondary: "ui-button-secondary bg-white text-[var(--heading-foreground)] hover:bg-[var(--muted)] border-[var(--border)]",
    danger: "ui-button-danger bg-[var(--danger)] text-white hover:opacity-90 border-transparent",
    ghost: "ui-button-ghost bg-transparent text-[var(--heading-foreground)] hover:bg-[var(--muted)] border-transparent",
  };
  return (
    <button
      className={cn(
        "inline-flex min-h-10 items-center justify-center gap-2 rounded-[var(--radius-lg)] border px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
