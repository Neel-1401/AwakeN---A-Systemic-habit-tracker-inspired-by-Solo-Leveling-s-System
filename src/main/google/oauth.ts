import { randomBytes, timingSafeEqual } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { OAuth2Client } from 'google-auth-library';

export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
/** openid + email only so Settings can show which account is connected. */
export const GOOGLE_SCOPES = ['openid', 'email', CALENDAR_SCOPE];
export const SIGN_IN_TIMEOUT_MS = 5 * 60_000;
const CALLBACK_PATH = '/oauth2callback';

/** One sign-in attempt's secrets. They live only in memory for the length of the attempt. */
export interface AuthRequest {
  /** Random value Google sends back unchanged, so we only accept the reply to our own request. */
  state: string;
  /** PKCE: kept here, only its SHA-256 (the challenge) goes into the sign-in URL. */
  codeVerifier: string;
  codeChallenge: string;
}

export async function createAuthRequest(
  client: Pick<OAuth2Client, 'generateCodeVerifierAsync'>,
): Promise<AuthRequest> {
  // The library's verifier is 128 random URL-safe characters and its challenge is S256.
  const { codeVerifier, codeChallenge } = await client.generateCodeVerifierAsync();
  if (!codeChallenge) throw new Error('Couldn’t create the PKCE challenge');
  return { state: randomBytes(32).toString('base64url'), codeVerifier, codeChallenge };
}

export type CallbackResult =
  | { kind: 'code'; code: string }
  /** The user pressed Cancel on Google's page or refused access. */
  | { kind: 'denied' }
  | { kind: 'error'; message: string };

export type SignInOutcome = CallbackResult | { kind: 'timeout' } | { kind: 'cancelled' };

/** Reads Google's redirect. A reply with the wrong state is rejected before anything else. */
export function parseCallback(url: URL, expectedState: string): CallbackResult {
  if (!sameString(url.searchParams.get('state') ?? '', expectedState)) {
    return { kind: 'error', message: 'The sign-in reply didn’t match this request, so it was ignored. Try again.' };
  }
  const error = url.searchParams.get('error');
  if (error === 'access_denied') return { kind: 'denied' };
  if (error) return { kind: 'error', message: 'Google couldn’t complete the sign-in. Try again.' };
  const code = url.searchParams.get('code');
  if (!code) return { kind: 'error', message: 'Google’s reply had no sign-in code. Try again.' };
  return { kind: 'code', code };
}

/** Constant-time compare, so the state can't be guessed one character at a time. */
function sameString(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export interface Loopback {
  /** http://127.0.0.1:<port>/oauth2callback, passed to Google as redirect_uri. */
  redirectUri: string;
  /** Settles once: Google's reply, the timeout, or cancel(). The server is closed by then. */
  result: Promise<SignInOutcome>;
  cancel(): void;
}

/**
 * Listens on a random free port on 127.0.0.1 for Google's one redirect back. It handles one
 * request to the callback path (anything else gets a 404) and closes after it, after
 * `timeoutMs`, or when cancelled, whichever comes first.
 */
export function startLoopback(expectedState: string, timeoutMs = SIGN_IN_TIMEOUT_MS): Promise<Loopback> {
  return new Promise((resolveStart, rejectStart) => {
    let settle!: (outcome: SignInOutcome) => void;
    const result = new Promise<SignInOutcome>((resolve) => {
      settle = resolve;
    });
    let finished = false;

    const server = http.createServer((request, response) => {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      if (finished || request.method !== 'GET' || url.pathname !== CALLBACK_PATH) {
        response.writeHead(404).end();
        return;
      }
      const outcome = parseCallback(url, expectedState);
      response.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        Connection: 'close',
      });
      response.end(replyPage(outcome));
      finish(outcome);
    });

    const timer = setTimeout(() => finish({ kind: 'timeout' }), timeoutMs);
    timer.unref();

    function finish(outcome: SignInOutcome) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      server.close();
      // A reply being sent finishes first (Connection: close); idle keep-alive sockets go now.
      server.closeIdleConnections();
      settle(outcome);
    }

    server.on('error', (error) => {
      if (server.listening) finish({ kind: 'error', message: 'The sign-in listener stopped unexpectedly.' });
      else rejectStart(error);
    });

    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolveStart({
        redirectUri: `http://127.0.0.1:${port}${CALLBACK_PATH}`,
        result,
        cancel: () => finish({ kind: 'cancelled' }),
      });
    });
  });
}

/** The page the browser tab shows after Google sends it back. Fixed text only. */
function replyPage(outcome: CallbackResult): string {
  const message =
    outcome.kind === 'code'
      ? 'Signed in. You can close this tab and go back to AwakeN.'
      : outcome.kind === 'denied'
        ? 'Sign-in cancelled. You can close this tab.'
        : 'Sign-in didn’t work. Close this tab and try again from AwakeN.';
  return `<!doctype html><meta charset="utf-8"><title>AwakeN</title>
<body style="font:14px system-ui,sans-serif;color:#1a1a1a;background:#fafafa;display:grid;place-items:center;height:90vh;margin:0">
<p>${message}</p></body>`;
}
