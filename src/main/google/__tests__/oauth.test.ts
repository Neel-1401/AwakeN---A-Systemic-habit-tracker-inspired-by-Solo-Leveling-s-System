import { createHash } from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import { describe, expect, it } from 'vitest';
import { createAuthRequest, parseCallback, startLoopback } from '../oauth';

const callback = (query: string) => new URL(`http://127.0.0.1:1234/oauth2callback?${query}`);

describe('createAuthRequest (PKCE and state)', () => {
  it('uses a challenge that is the base64url SHA-256 of the verifier (S256)', async () => {
    const request = await createAuthRequest(new OAuth2Client());
    const expected = createHash('sha256').update(request.codeVerifier).digest('base64url');
    expect(request.codeChallenge).toBe(expected);
  });

  it('makes a verifier within RFC 7636 limits (43–128 unreserved characters)', async () => {
    const { codeVerifier } = await createAuthRequest(new OAuth2Client());
    expect(codeVerifier).toMatch(/^[A-Za-z0-9\-._~]{43,128}$/);
  });

  it('makes a fresh state and verifier every time', async () => {
    const client = new OAuth2Client();
    const [a, b] = await Promise.all([createAuthRequest(client), createAuthRequest(client)]);
    expect(a.state).not.toBe(b.state);
    expect(a.codeVerifier).not.toBe(b.codeVerifier);
    expect(a.state.length).toBeGreaterThanOrEqual(43);
  });
});

describe('parseCallback (state check)', () => {
  it('accepts the code when the state matches', () => {
    expect(parseCallback(callback('state=abc&code=the-code'), 'abc')).toEqual({ kind: 'code', code: 'the-code' });
  });

  it('rejects a reply with a different, missing or longer state, even if it has a code', () => {
    for (const query of ['state=abd&code=x', 'code=x', 'state=abcd&code=x', 'state=&code=x']) {
      expect(parseCallback(callback(query), 'abc')).toMatchObject({ kind: 'error' });
    }
  });

  it('checks the state before reading an error, so a stray denial is ignored', () => {
    expect(parseCallback(callback('state=other&error=access_denied'), 'abc')).toMatchObject({ kind: 'error' });
  });

  it('treats access_denied as the user saying no, and other errors as errors', () => {
    expect(parseCallback(callback('state=abc&error=access_denied'), 'abc')).toEqual({ kind: 'denied' });
    expect(parseCallback(callback('state=abc&error=server_error'), 'abc')).toMatchObject({ kind: 'error' });
    expect(parseCallback(callback('state=abc'), 'abc')).toMatchObject({ kind: 'error' });
  });
});

describe('startLoopback', () => {
  it('listens on 127.0.0.1 with a random port and returns the code from one request', async () => {
    const loopback = await startLoopback('s1');
    expect(loopback.redirectUri).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/oauth2callback$/);

    const reply = await fetch(`${loopback.redirectUri}?state=s1&code=c1`);
    expect(reply.status).toBe(200);
    expect(await reply.text()).toContain('close this tab');
    await expect(loopback.result).resolves.toEqual({ kind: 'code', code: 'c1' });

    // Closed after that one request.
    await expect(fetch(`${loopback.redirectUri}?state=s1&code=c2`)).rejects.toThrow();
  });

  it('ignores other paths and keeps waiting for the real callback', async () => {
    const loopback = await startLoopback('s1');
    const origin = new URL(loopback.redirectUri).origin;
    expect((await fetch(`${origin}/favicon.ico`)).status).toBe(404);
    await fetch(`${loopback.redirectUri}?state=s1&error=access_denied`);
    await expect(loopback.result).resolves.toEqual({ kind: 'denied' });
  });

  it('gives up after the timeout and closes', async () => {
    const loopback = await startLoopback('s1', 50);
    await expect(loopback.result).resolves.toEqual({ kind: 'timeout' });
    await expect(fetch(`${loopback.redirectUri}?state=s1&code=late`)).rejects.toThrow();
  });

  it('stops when cancelled', async () => {
    const loopback = await startLoopback('s1');
    loopback.cancel();
    await expect(loopback.result).resolves.toEqual({ kind: 'cancelled' });
  });
});
