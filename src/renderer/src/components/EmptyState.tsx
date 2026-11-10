interface EmptyStateProps {
  onNew(): void;
}

export function EmptyState({ onNew }: EmptyStateProps) {
  return (
    <div className="card fade-in" style={{ padding: 'var(--space-7) var(--space-5)', textAlign: 'center' }}>
      <h2 style={{ fontSize: '16px', fontWeight: 600 }}>No habits yet</h2>
      <p className="muted" style={{ maxWidth: '40ch', margin: '10px auto' }}>
        Add something small you want to do regularly, like reading, coding or a gym session.
      </p>
      <button type="button" className="button button--primary" onClick={onNew}>
        Add your first habit
      </button>
    </div>
  );
}
