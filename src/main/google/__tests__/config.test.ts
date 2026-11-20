import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadGoogleConfig } from '../config';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'awaken-env-'));
const envFile = path.join(dir, '.env');
afterEach(() => fs.rmSync(envFile, { force: true }));

describe('loadGoogleConfig', () => {
  it('reads both values from .env without touching process.env', () => {
    fs.writeFileSync(envFile, '# comment\nGOOGLE_CLIENT_ID=id.apps.googleusercontent.com\nGOOGLE_CLIENT_SECRET="s3cret"\n');
    expect(loadGoogleConfig(envFile)).toEqual({ clientId: 'id.apps.googleusercontent.com', clientSecret: 's3cret' });
    expect(process.env.GOOGLE_CLIENT_SECRET).toBeUndefined();
  });

  it('returns null when the file is missing or a value is empty (like .env.example)', () => {
    expect(loadGoogleConfig(envFile)).toBeNull();
    fs.writeFileSync(envFile, 'GOOGLE_CLIENT_ID=\nGOOGLE_CLIENT_SECRET=\n');
    expect(loadGoogleConfig(envFile)).toBeNull();
  });
});
