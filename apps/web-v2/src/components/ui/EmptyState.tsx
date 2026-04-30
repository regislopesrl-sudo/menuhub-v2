export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="ui-empty ui-card">
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      {description ? <p style={{ marginBottom: 0 }}>{description}</p> : null}
    </div>
  );
}
