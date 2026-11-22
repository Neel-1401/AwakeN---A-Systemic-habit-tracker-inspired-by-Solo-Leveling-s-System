import { describe, expect, it } from 'vitest';
import type { SyncStatus } from '../../../../shared/ipc';
import { describeSync, syncedAgo } from '../syncText';

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

describe('sync status text', () => {
  it('synced: how long ago, in 12-hour time once it’s over an hour', () => {
    expect(describeSync(base, NOW)).toMatchObject({ text: 'Synced 2 min ago', tone: 'synced' });
    expect(syncedAgo(new Date(2026, 10, 22, 15, 29, 30), NOW)).toBe('just now');
    expect(syncedAgo(new Date(2026, 10, 22, 9, 5), NOW)).toBe('at 9:05 am');
    expect(syncedAgo(new Date(2026, 10, 21, 18, 40), NOW)).toBe('on 21 Nov at 6:40 pm');
  });

  it('waiting and failed counts', () => {
    expect(describeSync({ ...base, pending: 3 }, NOW)?.text).toBe('3 changes waiting');
    expect(describeSync({ ...base, pending: 1, offline: true }, NOW)?.text).toBe('1 change waiting · offline');
    expect(describeSync({ ...base, pending: 2, failed: 1 }, NOW)).toMatchObject({
      text: '1 event failed to sync',
      tone: 'failed',
    });
    expect(describeSync({ ...base, failed: 2 }, NOW)?.text).toBe('2 events failed to sync');
  });

  it('needs reconnect, and nothing at all when Google isn’t connected', () => {
    expect(describeSync({ ...base, connection: 'needs-reconnect', pending: 2 }, NOW)).toMatchObject({
      text: 'Needs reconnect',
      tone: 'reconnect',
    });
    expect(describeSync({ ...base, connection: 'off', lastSyncedAt: null }, NOW)).toBeNull();
    expect(describeSync({ ...base, connection: 'off', pending: 1 }, NOW)?.text).toBe(
      '1 change waiting · Google not connected',
    );
  });
});
