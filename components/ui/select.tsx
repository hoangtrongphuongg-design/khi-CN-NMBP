import * as React from "react";
import { cn } from "@/lib/utils";

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, ...props }, ref) {
  return <select ref={ref} className={cn("min-h-10 w-full rounded-[var(--radius-lg)] border border-[var(--border)] bg-white px-3 py-2 text-sm", className)} {...props} />;
});
