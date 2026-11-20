import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTokenStore, SecureStorageError, type Encryptor } from '../tokenStore';

/** Stands in for Electron's safeStorage: reversible, but the file never holds plain text. */
function fakeSafeStorage(available = true): Encryptor {
  return {
    isEncryptionAvailable: () => available,
    encryptString: (text) => Buffer.from(`enc:${Buffer.from(text).toString('base64')}`),
    decryptString: (data) => {
      const text = data.toString();
      if (!text.startsWith('enc:')) throw new Error('Not ours');
      return Buffer.from(text.slice(4), 'base64').toString();
    },
  };
}

let dir: string;
let file: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'awaken-token-'));
  file = path.join(dir, 'google-account.bin');
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('token store', () => {
  it('round-trips the account through an encrypted file', () => {
    const store = createTokenStore(file, fakeSafeStorage());
    expect(store.load()).toBeNull();

    store.save({ email: 'me@example.com', refreshToken: '1//secret-refresh' });
    expect(store.load()).toEqual({ email: 'me@example.com', refreshToken: '1//secret-refresh' });
    // A fresh store (an app restart) reads the same file.
    expect(createTokenStore(file, fakeSafeStorage()).load()).toEqual({
      email: 'me@example.com',
      refreshToken: '1//secret-refresh',
    });

    const onDisk = fs.readFileSync(file, 'utf8');
    expect(onDisk).not.toContain('secret-refresh');
    expect(onDisk).not.toContain('me@example.com');
    expect(fs.existsSync(`${file}.tmp`)).toBe(false);
  });

  it('keeps an account that needs reconnecting (no refresh token)', () => {
    const store = createTokenStore(file, fakeSafeStorage());
    store.save({ email: 'me@example.com', refreshToken: null });
    expect(store.load()).toEqual({ email: 'me@example.com', refreshToken: null });
  });

  it('clear() deletes the file, and is fine to call twice', () => {
    const store = createTokenStore(file, fakeSafeStorage());
    store.save({ email: 'me@example.com', refreshToken: 'r' });
    store.clear();
    store.clear();
    expect(fs.existsSync(file)).toBe(false);
    expect(store.load()).toBeNull();
  });

  it('refuses to save without secure storage, and writes nothing', () => {
    const store = createTokenStore(file, fakeSafeStorage(false));
    expect(() => store.save({ email: 'me@example.com', refreshToken: 'r' })).toThrow(SecureStorageError);
    expect(fs.existsSync(file)).toBe(false);
  });

  it('treats an unreadable or malformed file as not connected', () => {
    const store = createTokenStore(file, fakeSafeStorage());
    fs.writeFileSync(file, 'garbage');
    expect(store.load()).toBeNull();
    fs.writeFileSync(file, fakeSafeStorage().encryptString(JSON.stringify({ email: '', refreshToken: 5 })));
    expect(store.load()).toBeNull();
  });
});
