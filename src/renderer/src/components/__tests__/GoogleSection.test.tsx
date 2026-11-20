import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { GoogleStatus } from '../../../../shared/ipc';
import { GoogleSection } from '../GoogleSection';

const noop = () => {};
const render = (status: GoogleStatus, extra: { onTest?: () => Promise<{ ok: boolean; message: string }> } = {}) =>
  renderToStaticMarkup(
    <GoogleSection status={status} onConnect={noop} onCancel={noop} onDisconnect={noop} {...extra} />,
  );
/** Button labels in order, from the static HTML. */
const buttons = (html: string) => [...html.matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map((m) => m[1]);

describe('GoogleSection (Settings → Google Calendar)', () => {
  it('not connected: only a Connect button', () => {
    const html = render({ state: 'not-connected' });
    expect(buttons(html)).toEqual(['Connect Google Calendar']);
    expect(html).not.toContain('Connected as');
  });

  it('connected: shows the account email and Disconnect', () => {
    const html = render({ state: 'connected', email: 'me@example.com' });
    expect(html).toContain('Connected as <strong>me@example.com</strong>');
    expect(buttons(html)).toEqual(['Disconnect']);
  });

  it('needs reconnect: says the sign-in expired, with Reconnect', () => {
    const html = render({ state: 'needs-reconnect', email: 'me@example.com' });
    expect(html).toContain('Google sign-in expired');
    expect(html).toContain('role="alert"');
    expect(html).toContain('me@example.com');
    expect(buttons(html)).toEqual(['Reconnect', 'Disconnect']);
  });

  it('shows a notice, e.g. after a denied sign-in', () => {
    const html = render({ state: 'not-connected', notice: 'Google sign-in was cancelled. Nothing was connected.' });
    expect(html).toContain('Google sign-in was cancelled.');
  });

  it('while waiting for the browser: a Cancel button so it never feels stuck', () => {
    expect(buttons(render({ state: 'connecting' }))).toEqual(['Cancel']);
  });

  it('without .env values: explains the setup, no buttons', () => {
    const html = render({ state: 'not-configured' });
    expect(html).toContain('GOOGLE_CLIENT_ID');
    expect(buttons(html)).toEqual([]);
  });

  it('dev Test connection button only shows while connected', () => {
    const onTest = async () => ({ ok: true, message: 'OK' });
    expect(buttons(render({ state: 'connected', email: 'a@b.c' }, { onTest }))).toContain('Test connection');
    expect(buttons(render({ state: 'not-connected' }, { onTest }))).not.toContain('Test connection');
  });
});
