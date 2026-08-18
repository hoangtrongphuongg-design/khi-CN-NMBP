import * as React from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "danger" | "ghost";

export function Button({
  className,
  variant = "primary",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const variants: Record<Variant, string> = {
    primary: "bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] border-transparent",
    secondary: "bg-white text-[var(--ink)] hover:bg-[var(--muted)] border-[var(--border)]",
    danger: "bg-[var(--danger)] text-white hover:opacity-90 border-transparent",
    ghost: "bg-transparent text-[var(--ink)] hover:bg-[var(--muted)] border-transparent",
  };
  return (
    <button
      className={cn(
        "inline-flex min-h-10 items-center justify-center gap-2 rounded-[var(--radius-lg)] border px-4 py-2 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
