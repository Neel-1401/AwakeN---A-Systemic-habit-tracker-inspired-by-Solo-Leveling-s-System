import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

export interface GoogleClientConfig {
  clientId: string;
  clientSecret: string;
}

/**
 * Reads GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET from the .env file at `envFile`.
 * Returns null if the file is missing or either value is empty. The values are parsed into this
 * object only: never copied into process.env, logged or sent to the renderer.
 *
 * Phase 8 note: a packaged app has no .env next to it; the installer step decides where these come from.
 */
export function loadGoogleConfig(envFile: string): GoogleClientConfig | null {
  let text: string;
  try {
    text = readFileSync(envFile, 'utf8');
  } catch {
    return null;
  }
  const env = parseEnv(text);
  const clientId = env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}
