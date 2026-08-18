export function FormField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-sm font-bold">{label}</span>
      {children}
      {hint ? <span className="text-xs text-[var(--muted-foreground)]">{hint}</span> : null}
    </label>
  );
}
