import { cn } from "@/lib/utils";

type Tone = "info" | "warning" | "danger" | "success" | "neutral";

export function Badge({ children, tone = "neutral", className }: { children: React.ReactNode; tone?: Tone; className?: string }) {
  return <span className={cn("inline-flex items-center rounded-[var(--radius-sm)] border px-2 py-1 text-xs font-bold", `status-${tone}`, className)}>{children}</span>;
}
