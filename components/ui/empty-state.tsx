export function EmptyState({ title = "Chưa có dữ liệu", description }: { title?: string; description?: string }) {
  return <div className="rounded-[var(--radius-xl)] border border-dashed border-[var(--border)] p-8 text-center"><strong>{title}</strong>{description ? <p className="mt-2 text-sm text-[var(--muted-foreground)]">{description}</p> : null}</div>;
}
