import type { Credentials, GenerateAuthUrlOpts } from 'google-auth-library';
import { describe, expect, it, vi } from 'vitest';
import type { GoogleStatus } from '../../../shared/ipc';
import { GoogleAuth, type GoogleClient } from '../googleAuth';
import { CALENDAR_SCOPE } from '../oauth';
import type { StoredGoogleAccount, TokenStore } from '../tokenStore';

const CONFIG = { clientId: 'client-id', clientSecret: 'client-secret' };
const REFRESH = '1//refresh-token-value';
const ACCESS = 'ya29.access-token-value';

function memoryStore(initial: StoredGoogleAccount | null = null): TokenStore & { saved: StoredGoogleAccount | null } {
  const store = {
    saved: initial,
    load: () => store.saved,
    save: (account: StoredGoogleAccount) => void (store.saved = account),
    clear: () => void (store.saved = null),
  };
  return store;
}

/** A stand-in for OAuth2Client that records what it's asked and answers like Google would. */
function fakeClient() {
  const fake = {
    credentials: {} as Credentials,
    authUrlOptions: null as GenerateAuthUrlOpts | null,
    tokens: {
      refresh_token: REFRESH,
      access_token: ACCESS,
      id_token: 'id-token',
      scope: `openid https://www.googleapis.com/auth/userinfo.email ${CALENDAR_SCOPE}`,
      expiry_date: Date.now() + 3_600_000,
    } as Credentials,
    generateCodeVerifierAsync: async () => ({ codeVerifier: 'v'.repeat(64), codeChallenge: 'challenge' }),
    generateAuthUrl(options: GenerateAuthUrlOpts) {
      fake.authUrlOptions = options;
      const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      url.searchParams.set('redirect_uri', options.redirect_uri!);
      url.searchParams.set('state', options.state!);
      return url.toString();
    },
    getToken: vi.fn(async () => ({ tokens: fake.tokens })),
    verifyIdToken: vi.fn(async () => ({ getPayload: () => ({ email: 'me@example.com' }) })),
    setCredentials: (credentials: Credentials) => void (fake.credentials = credentials),
    getAccessToken: vi.fn(async (): Promise<unknown> => ({ token: ACCESS })),
    revokeToken: vi.fn(async (): Promise<unknown> => ({ data: { success: true } })),
    request: vi.fn(async (): Promise<unknown> => ({ data: { items: [] } })),
    on: () => fake,
  };
  return fake;
}

const invalidGrant = () => Object.assign(new Error('invalid_grant'), { response: { status: 400, data: { error: 'invalid_grant' } } });
const offline = () => Object.assign(new Error('request to oauth2.googleapis.com failed'), { config: {} });

/** Plays the browser: follows the sign-in URL's redirect_uri back to the loopback server. */
function browser(reply: (state: string) => string) {
  return async (url: string) => {
    const { searchParams } = new URL(url);
    void fetch(`${searchParams.get('redirect_uri')}?${reply(searchParams.get('state')!)}`);
  };
}

function setup(options: { stored?: StoredGoogleAccount | null; openExternal?: (url: string) => Promise<void> } = {}) {
  const client = fakeClient();
  const store = memoryStore(options.stored ?? null);
  const statuses: GoogleStatus[] = [];
  const auth = new GoogleAuth({
    config: CONFIG,
    store,
    openExternal: options.openExternal ?? browser((state) => `state=${state}&code=auth-code`),
    onStatus: (status) => statuses.push(status),
    createClient: () => client as unknown as GoogleClient,
  });
  return { auth, client, store, statuses };
}

describe('GoogleAuth', () => {
  it('is not configured without a client ID and secret', () => {
    const auth = new GoogleAuth({ config: null, store: memoryStore(), openExternal: async () => {} });
    expect(auth.getStatus()).toEqual({ state: 'not-configured' });
  });

  it('connects: asks for the three scopes with PKCE, then stores the refresh token encrypted', async () => {
    const { auth, client, store, statuses } = setup();
    expect(auth.getStatus()).toEqual({ state: 'not-connected' });

    await expect(auth.connect()).resolves.toEqual({ state: 'connected', email: 'me@example.com' });
    expect(statuses[0]).toEqual({ state: 'connecting' });
    expect(client.authUrlOptions).toMatchObject({
      access_type: 'offline',
      scope: ['openid', 'email', CALENDAR_SCOPE],
      code_challenge: 'challenge',
      code_challenge_method: 'S256',
    });
    expect(client.authUrlOptions?.redirect_uri).toMatch(/^http:\/\/127\.0\.0\.1:\d+\//);
    expect(client.getToken).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'auth-code', codeVerifier: 'v'.repeat(64) }),
    );
    expect(store.saved).toEqual({ email: 'me@example.com', refreshToken: REFRESH });
    // The access token is in the client's memory, never in the store.
    expect(client.credentials.access_token).toBe(ACCESS);
    expect(JSON.stringify(store.saved)).not.toContain(ACCESS);
  });

  it('never puts a token in a status the renderer sees', async () => {
    const { auth, statuses } = setup();
    statuses.push(await auth.connect(), auth.getStatus(), await auth.disconnect());
    const sent = JSON.stringify(statuses);
    expect(sent).not.toContain(REFRESH);
    expect(sent).not.toContain(ACCESS);
    expect(sent).not.toContain('client-secret');
  });

  it('returns to not connected with a message when access is denied', async () => {
    const { auth, store } = setup({ openExternal: browser((state) => `state=${state}&error=access_denied`) });
    const status = await auth.connect();
    expect(status).toMatchObject({ state: 'not-connected', notice: expect.stringContaining('cancelled') });
    expect(store.saved).toBeNull();
  });

  it('returns to not connected when the user cancels the wait (closed the browser)', async () => {
    const { auth } = setup({ openExternal: async () => {} });
    const pending = auth.connect();
    await vi.waitFor(() => expect(auth.getStatus()).toEqual({ state: 'connecting' }));
    auth.cancelConnect();
    await expect(pending).resolves.toEqual({ state: 'not-connected', notice: 'Sign-in cancelled.' });
  });

  it('times out instead of hanging when nobody comes back', async () => {
    const client = fakeClient();
    const auth = new GoogleAuth({
      config: CONFIG,
      store: memoryStore(),
      openExternal: async () => {},
      createClient: () => client as unknown as GoogleClient,
      signInTimeoutMs: 30,
    });
    await expect(auth.connect()).resolves.toMatchObject({ state: 'not-connected', notice: expect.stringContaining('timed out') });
  });

  it('refuses and revokes when the calendar permission was unticked', async () => {
    const { auth, client, store } = setup();
    client.tokens = { ...client.tokens, scope: 'openid email' };
    const status = await auth.connect();
    expect(status).toMatchObject({ state: 'not-connected', notice: expect.stringContaining('calendar') });
    expect(client.revokeToken).toHaveBeenCalledWith(REFRESH);
    expect(store.saved).toBeNull();
  });

  it('shows a short message when Google can’t be reached during sign-in', async () => {
    const { auth, client } = setup();
    client.getToken.mockRejectedValueOnce(offline());
    await expect(auth.connect()).resolves.toMatchObject({
      state: 'not-connected',
      notice: expect.stringContaining('Couldn’t reach Google'),
    });
  });

  it('stays connected across a restart (a new instance reads the store)', () => {
    const { auth, client } = setup({ stored: { email: 'me@example.com', refreshToken: REFRESH } });
    expect(auth.getStatus()).toEqual({ state: 'connected', email: 'me@example.com' });
    expect(client.credentials).toEqual({ refresh_token: REFRESH });
  });

  it('needs reconnecting when Google refuses the refresh token at start-up', async () => {
    const { auth, client, store, statuses } = setup({ stored: { email: 'me@example.com', refreshToken: REFRESH } });
    client.getAccessToken.mockRejectedValueOnce(invalidGrant());
    await auth.verifyStoredSignIn();
    expect(auth.getStatus()).toEqual({ state: 'needs-reconnect', email: 'me@example.com' });
    expect(statuses.at(-1)).toEqual({ state: 'needs-reconnect', email: 'me@example.com' });
    expect(store.saved).toEqual({ email: 'me@example.com', refreshToken: null });
  });

  it('stays connected when the start-up check is only offline', async () => {
    const { auth, client } = setup({ stored: { email: 'me@example.com', refreshToken: REFRESH } });
    client.getAccessToken.mockRejectedValueOnce(offline());
    await auth.verifyStoredSignIn();
    expect(auth.getStatus()).toEqual({ state: 'connected', email: 'me@example.com' });
  });

  it('reconnecting replaces the expired sign-in', async () => {
    const { auth, client, store } = setup({ stored: { email: 'me@example.com', refreshToken: null } });
    expect(auth.getStatus()).toEqual({ state: 'needs-reconnect', email: 'me@example.com' });
    await expect(auth.connect()).resolves.toEqual({ state: 'connected', email: 'me@example.com' });
    expect(client.authUrlOptions?.login_hint).toBe('me@example.com');
    expect(store.saved?.refreshToken).toBe(REFRESH);
  });

  it('disconnect revokes with Google, forgets the token and clears memory', async () => {
    const { auth, client, store } = setup({ stored: { email: 'me@example.com', refreshToken: REFRESH } });
    const status = await auth.disconnect();
    expect(status).toMatchObject({ state: 'not-connected', notice: expect.stringContaining('haven’t changed') });
    expect(client.revokeToken).toHaveBeenCalledWith(REFRESH);
    expect(store.saved).toBeNull();
    expect(client.credentials).toEqual({});
  });

  it('disconnects locally even when Google can’t be reached to revoke', async () => {
    const { auth, client, store } = setup({ stored: { email: 'me@example.com', refreshToken: REFRESH } });
    client.revokeToken.mockRejectedValueOnce(offline());
    const status = await auth.disconnect();
    expect(status).toMatchObject({ state: 'not-connected', notice: expect.stringContaining('myaccount.google.com') });
    expect(store.saved).toBeNull();
  });

  it('test connection reads one event, and flags an expired sign-in', async () => {
    const { auth, client } = setup({ stored: { email: 'me@example.com', refreshToken: REFRESH } });
    client.request.mockResolvedValueOnce({ data: { items: [{ summary: 'Lecture', start: { date: '2026-11-21' } }] } });
    await expect(auth.testConnection()).resolves.toEqual({ ok: true, message: 'OK. Next event: “Lecture”, 2026-11-21' });
    expect(client.request).toHaveBeenCalledWith(
      expect.objectContaining({ params: expect.objectContaining({ maxResults: 1 }) }),
    );

    client.request.mockRejectedValueOnce(invalidGrant());
    await expect(auth.testConnection()).resolves.toMatchObject({ ok: false });
    expect(auth.getStatus().state).toBe('needs-reconnect');
  });

  it('never shows a library error message, which can contain the ID token', async () => {
    const { auth, client } = setup();
    client.verifyIdToken.mockRejectedValueOnce(new Error('Invalid token signature: eyJhbGciOi.secret.jwt'));
    const status = await auth.connect();
    expect(status.notice).not.toContain('eyJ');
    expect(status.state).toBe('not-connected');
  });

  describe('as the push queue’s transport', () => {
    const connected = () => setup({ stored: { email: 'me@example.com', refreshToken: REFRESH } });
    const insert = { method: 'POST' as const, url: 'https://www.googleapis.com/calendar/v3/calendars/primary/events' };

    it('returns every HTTP status as a response instead of throwing', async () => {
      const { auth, client } = connected();
      client.request.mockResolvedValueOnce({ status: 412, data: { error: { message: 'Precondition Failed' } } });
      await expect(auth.send(insert)).resolves.toEqual({
        kind: 'response',
        status: 412,
        data: { error: { message: 'Precondition Failed' } },
      });
      const options = (client.request.mock.calls[0] as unknown as [{ validateStatus(status: number): boolean }])[0];
      expect(options.validateStatus(401)).toBe(true);
    });

    it('no answer is offline; a refused sign-in is signed-out and needs reconnect', async () => {
      const { auth, client } = connected();
      client.request.mockRejectedValueOnce(offline());
      await expect(auth.send(insert)).resolves.toEqual({ kind: 'offline' });
      expect(auth.getStatus().state).toBe('connected');

      client.request.mockRejectedValueOnce(invalidGrant());
      await expect(auth.send(insert)).resolves.toEqual({ kind: 'signed-out' });
      expect(auth.getStatus().state).toBe('needs-reconnect');
      expect(auth.hasAccount()).toBe(true);
      expect(auth.isConnected()).toBe(false);
    });

    it('refreshAccess drops the access token and asks for a new one', async () => {
      const { auth, client } = connected();
      client.setCredentials({ refresh_token: REFRESH, access_token: ACCESS });
      await expect(auth.refreshAccess()).resolves.toBe('ok');
      expect(client.credentials).toEqual({ refresh_token: REFRESH });
      expect(client.getAccessToken).toHaveBeenCalled();

      client.getAccessToken.mockRejectedValueOnce(invalidGrant());
      await expect(auth.refreshAccess()).resolves.toBe('signed-out');
      expect(auth.getStatus().state).toBe('needs-reconnect');
    });

    it('rejectSignIn: Settings asks to reconnect', () => {
      const { auth } = connected();
      auth.rejectSignIn();
      expect(auth.getStatus()).toEqual({ state: 'needs-reconnect', email: 'me@example.com' });
    });

    it('not connected: nothing is sent', async () => {
      const { auth, client } = setup();
      await expect(auth.send(insert)).resolves.toEqual({ kind: 'signed-out' });
      expect(client.request).not.toHaveBeenCalled();
      expect(auth.hasAccount()).toBe(false);
    });
  });
});
