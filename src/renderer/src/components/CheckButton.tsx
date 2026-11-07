import './CheckButton.css';

interface CheckButtonProps {
  done: boolean;
  label: string;
  onClick(): void;
}

/**
 * Today's complete/undo button. Not done: an outlined circle. Done: a filled circle with a tick.
 * aria-pressed tells screen readers it's a toggle and whether it's on.
 */
export function CheckButton({ done, label, onClick }: CheckButtonProps) {
  return (
    <button
      type="button"
      className="check-button"
      aria-pressed={done}
      aria-label={`${label}: ${done ? 'done today, press to undo' : 'mark done today'}`}
      onClick={onClick}
    >
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M4 8.5l2.5 2.5L12 5.5" />
      </svg>
    </button>
  );
}
