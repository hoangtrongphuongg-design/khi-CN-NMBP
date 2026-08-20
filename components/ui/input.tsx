import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, inputMode, type, step, ...props }, ref) {
  const resolvedInputMode = inputMode ?? (type === "number" ? (String(step ?? "1") === "1" ? "numeric" : "decimal") : undefined);
  return <input ref={ref} type={type} inputMode={resolvedInputMode} step={step} className={cn("min-h-10 w-full rounded-[var(--radius-lg)] border border-[var(--border)] bg-white px-3 py-2 text-sm focus-visible:ring-3 focus-visible:ring-[var(--ring)]/50", className)} {...props} />;
});
