import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn("min-h-10 w-full rounded-[var(--radius-lg)] border border-[var(--border)] bg-white px-3 py-2 text-sm focus-visible:ring-3 focus-visible:ring-[var(--ring)]/50", className)} {...props} />;
});
