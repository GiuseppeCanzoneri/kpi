export function EmptyState({ title, text }: { title: string; text?: string }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      {text && <p>{text}</p>}
    </div>
  );
}
