import { useState } from 'react';
import type { GoogleStatus, GoogleTestResult } from '../../../shared/ipc';
import { errorMessage } from '../lib/format';
import './GoogleSection.css';

interface GoogleSectionProps {
  status: GoogleStatus;
  /** A disconnect is in progress. */
  busy?: boolean;
  onConnect(): void;
  onCancel(): void;
  onDisconnect(): void;
  /** Development builds only: the "Test connection" button, shown while connected. */
  onTest?: () => Promise<GoogleTestResult>;
  /** Events only in AwakeN, and the button that uploads them (shown while connected). */
  localOnly?: number;
  onUpload?: () => void;
}

/** Settings → Google Calendar. Only shows what main reports; no tokens ever reach here. */
export function GoogleSection({
  status,
  busy = false,
  onConnect,
  onCancel,
  onDisconnect,
  onTest,
  localOnly = 0,
  onUpload,
}: GoogleSectionProps) {
  return (
    <fieldset className="settings-field google-section">
      <legend className="segmented__legend">Google Calendar</legend>
      <GoogleState status={status} busy={busy} onConnect={onConnect} onCancel={onCancel} onDisconnect={onDisconnect} />
      {status.state === 'connected' && localOnly > 0 && onUpload && (
        <p className="settings-test">
          <button type="button" className="button" onClick={onUpload}>
            Upload to Google
          </button>
          <span className="muted">
            {localOnly === 1 ? '1 event is' : `${localOnly} events are`} only in AwakeN.
          </span>
        </p>
      )}
      {status.state === 'connected' && onTest && <TestConnectionButton onTest={onTest} />}
      {status.notice && (
        <p className="settings-hint google-section__notice" role="status">
          {status.notice}
        </p>
      )}
    </fieldset>
  );
}

type StateProps = Required<Pick<GoogleSectionProps, 'status' | 'busy' | 'onConnect' | 'onCancel' | 'onDisconnect'>>;

function GoogleState({ status, busy, onConnect, onCancel, onDisconnect }: StateProps) {
  switch (status.state) {
    case 'not-configured':
      return (
        <p className="muted settings-hint">
          Google sign-in isn’t set up. Add <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> to the{' '}
          <code>.env</code> file in the project folder, then restart AwakeN.
        </p>
      );

    case 'not-connected':
      return (
        <>
          <p className="muted settings-hint">
            Connect your Google account so events and their reminders can reach Google Calendar on your phone.
          </p>
          <div className="google-section__actions">
            <button type="button" className="button button--primary" onClick={onConnect}>
              Connect Google Calendar
            </button>
          </div>
        </>
      );

    case 'connecting':
      return (
        <>
          <p className="settings-hint" aria-live="polite">
            Finish signing in in your browser. AwakeN stops waiting after 5 minutes.
          </p>
          <div className="google-section__actions">
            <button type="button" className="button" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </>
      );

    case 'connected':
      return (
        <>
          <p className="google-section__account">
            Connected as <strong>{status.email}</strong>
          </p>
          <p className="muted settings-hint">
            New and changed events go to your primary calendar, with their reminders, so Google can notify your
            phone. Changes made in Google don’t come back to AwakeN yet.
          </p>
          <div className="google-section__actions">
            <button type="button" className="button" disabled={busy} onClick={onDisconnect}>
              {busy ? 'Disconnecting…' : 'Disconnect'}
            </button>
          </div>
        </>
      );

    case 'needs-reconnect':
      return (
        <>
          <div className="google-section__expired" role="alert">
            <strong>Google sign-in expired</strong>
            <span>
              Google no longer accepts AwakeN’s sign-in for {status.email}. This happens when access is removed, or
              after about 7 days while the Google project is in Testing mode.
            </span>
          </div>
          <div className="google-section__actions">
            <button type="button" className="button button--primary" onClick={onConnect}>
              Reconnect
            </button>
            <button type="button" className="button button--quiet" disabled={busy} onClick={onDisconnect}>
              Disconnect
            </button>
          </div>
        </>
      );
  }
}

/** Development builds only: one harmless read from Google Calendar. */
function TestConnectionButton({ onTest }: { onTest: () => Promise<GoogleTestResult> }) {
  const [result, setResult] = useState('');
  const [testing, setTesting] = useState(false);
  return (
    <p className="settings-test">
      <button
        type="button"
        className="button"
        disabled={testing}
        onClick={() => {
          setTesting(true);
          onTest()
            .then(({ message }) => setResult(message))
            .catch((caught) => setResult(errorMessage(caught)))
            .finally(() => setTesting(false));
        }}
      >
        Test connection
      </button>
      <span className="muted" aria-live="polite">
        {testing ? 'Asking Google…' : result || 'Dev only: reads your next event'}
      </span>
    </p>
  );
}
