import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { SyncStatus } from '../../../../shared/ipc';
import { SyncIndicator, UploadOfferDialog } from '../SyncStatus';

const NOW = new Date(2026, 10, 22, 15, 30);
const base: SyncStatus = {
  connection: 'on',
  pending: 0,
  failed: 0,
  lastSyncedAt: new Date(2026, 10, 22, 15, 28).toISOString(),
  offline: false,
  uploadOffer: null,
  localOnly: 0,
};
const noop = () => {};
const indicator = (status: SyncStatus) =>
  renderToStaticMarkup(<SyncIndicator status={status} now={NOW} onShowFailed={noop} onOpenSettings={noop} />);

describe('SyncIndicator (Calendar toolbar)', () => {
  it('synced and waiting are plain status text', () => {
    expect(indicator(base)).toContain('role="status"');
    expect(indicator(base)).toContain('Synced 2 min ago');
    expect(indicator({ ...base, pending: 3 })).toContain('3 changes waiting');
  });

  it('failed is a button that opens the list, with the warning icon', () => {
    const html = indicator({ ...base, failed: 1 });
    expect(html).toMatch(/^<button/);
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('sync-warning');
    expect(html).toContain('1 event failed to sync');
  });

  it('shows nothing when Google isn’t connected', () => {
    expect(indicator({ ...base, connection: 'off' })).toBe('');
  });
});

describe('UploadOfferDialog', () => {
  it('asks about the number of existing events, with Upload and Not now', () => {
    const html = renderToStaticMarkup(<UploadOfferDialog count={4} onAnswer={noop} />);
    expect(html).toContain('Upload 4 existing events to Google Calendar?');
    expect([...html.matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map((m) => m[1])).toEqual(['Not now', 'Upload']);
  });
});
