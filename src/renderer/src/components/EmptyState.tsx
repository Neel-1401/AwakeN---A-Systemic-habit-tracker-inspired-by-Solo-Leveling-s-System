interface EmptyStateProps {
  onNew(): void;
}

export function EmptyState({ onNew }: EmptyStateProps) {
  return (
    <div className="card fade-in" style={{ padding: 'var(--space-7) var(--space-5)', textAlign: 'center' }}>
      <h2 style={{ fontSize: 'var(--text-md)', fontWeight: 500 }}>No habits yet</h2>
      <p className="muted" style={{ margin: 'var(--space-2) 0 var(--space-4)' }}>
        Start with one small thing you want to do most days.
      </p>
      <button type="button" className="button button--primary" onClick={onNew}>
        New habit
      </button>
    </div>
  );
}
