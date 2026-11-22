import { format, parseISO } from 'date-fns';
import { useEffect, useRef, useState } from 'react';
import type { FailedSyncItem, SyncStatus } from '../../../shared/ipc';
import { errorMessage } from '../lib/format';
import { clock12, describeSync } from '../lib/syncText';
import './SyncStatus.css';

/** The small warning triangle for something that didn't sync. Decorative: labels say it in words. */
export function WarningIcon({ title }: { title?: string }) {
  return (
    <svg className="sync-warning" viewBox="0 0 16 16" aria-hidden="true">
      {title && <title>{title}</title>}
      <path d="M8 2.2 14.6 13.6H1.4Z" />
      <path className="sync-warning__mark" d="M8 6.4v3.4M8 11.6v.1" />
    </svg>
  );
}

interface SyncIndicatorProps {
  status: SyncStatus;
  now: Date;
  onShowFailed(): void;
  onOpenSettings(): void;
}

/** "Synced 2 min ago" / "3 changes waiting" / "1 event failed to sync" in the Calendar bar. */
export function SyncIndicator({ status, now, onShowFailed, onOpenSettings }: SyncIndicatorProps) {
  const summary = describeSync(status, now);
  if (!summary) return null;
  if (summary.tone === 'failed' || summary.tone === 'reconnect') {
    return (
      <button
        type="button"
        className="button button--quiet sync-status sync-status--problem"
        title={summary.title}
        aria-haspopup={summary.tone === 'failed' ? 'dialog' : undefined}
        onClick={summary.tone === 'failed' ? onShowFailed : onOpenSettings}
      >
        <WarningIcon />
        {summary.text}
      </button>
    );
  }
  return (
    <span className="sync-status" role="status" title={summary.title}>
      {summary.text}
    </span>
  );
}

function describeWhen(item: FailedSyncItem): string {
  const start = parseISO(item.startAt);
  return item.allDay ? format(start, 'EEE d MMM') : `${format(start, 'EEE d MMM')}, ${clock12(start)}`;
}

interface FailedSyncDialogProps {
  /** Reloads the list whenever sync changes (a retry worked, or failed again). */
  status: SyncStatus;
  onClose(): void;
}

/** The events Google refused, with the reason and a Retry button each. */
export function FailedSyncDialog({ status, onClose }: FailedSyncDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [items, setItems] = useState<FailedSyncItem[] | null>(null);
  const [retrying, setRetrying] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  useEffect(() => {
    let current = true;
    window.api.sync.listFailed().then(
      (list) => {
        if (!current) return;
        setItems(list);
        // A retried event that's no longer failed doesn't need its "Retrying…" label.
        setRetrying((ids) => new Set([...ids].filter((id) => list.some((item) => item.id === id))));
      },
      (caught) => current && setError(errorMessage(caught)),
    );
    return () => {
      current = false;
    };
  }, [status]);

  function retry(id: string) {
    setError(null);
    setRetrying((ids) => new Set(ids).add(id));
    window.api.sync.retry(id).catch((caught) => setError(errorMessage(caught)));
  }

  return (
    <dialog
      ref={dialogRef}
      className="habit-dialog sync-dialog"
      aria-labelledby="sync-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <h2 id="sync-dialog-title" className="habit-dialog__title">
        Not synced to Google Calendar
      </h2>
      {items?.length === 0 && <p className="note">Nothing has failed. Everything is synced or on its way.</p>}
      {items && items.length > 0 && (
        <ul className="sync-dialog__list">
          {items.map((item) => (
            <li key={item.id} className="sync-dialog__item">
              <div className="sync-dialog__text">
                <span className="sync-dialog__title">
                  <WarningIcon />
                  {item.title}
                  {item.deleted && <span className="muted"> (deleted in AwakeN)</span>}
                </span>
                <span className="note">{describeWhen(item)}</span>
                <span className="sync-dialog__error">{item.error}</span>
              </div>
              <button
                type="button"
                className="button"
                disabled={retrying.has(item.id) || status.connection !== 'on'}
                onClick={() => retry(item.id)}
              >
                {retrying.has(item.id) ? 'Retrying…' : 'Retry'}
              </button>
            </li>
          ))}
        </ul>
      )}
      {status.connection !== 'on' && <p className="note">Reconnect Google Calendar in Settings to retry.</p>}
      {error && (
        <p className="habit-dialog__error" role="alert">
          {error}
        </p>
      )}
      <div className="habit-dialog__buttons habit-dialog__buttons--end">
        <button type="button" className="button" onClick={onClose}>
          Close
        </button>
      </div>
    </dialog>
  );
}

/** Asked once, right after connecting: "Upload N existing events to Google Calendar?" */
export function UploadOfferDialog({ count, onAnswer }: { count: number; onAnswer(upload: boolean): void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const uploadRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    dialogRef.current?.showModal();
    uploadRef.current?.focus();
  }, []);
  const events = count === 1 ? '1 existing event' : `${count} existing events`;
  return (
    <dialog
      ref={dialogRef}
      className="habit-dialog"
      aria-labelledby="upload-offer-title"
      aria-describedby="upload-offer-text"
      onCancel={(event) => {
        event.preventDefault();
        onAnswer(false);
      }}
    >
      <h2 id="upload-offer-title" className="habit-dialog__title">
        Upload {events} to Google Calendar?
      </h2>
      <p id="upload-offer-text" className="note sync-offer__text">
        They’re only in AwakeN right now. New events go to Google either way. You can upload these later from
        Settings.
      </p>
      <div className="habit-dialog__buttons habit-dialog__buttons--end">
        <button type="button" className="button" onClick={() => onAnswer(false)}>
          Not now
        </button>
        <button ref={uploadRef} type="button" className="button button--primary" onClick={() => onAnswer(true)}>
          Upload
        </button>
      </div>
    </dialog>
  );
}
