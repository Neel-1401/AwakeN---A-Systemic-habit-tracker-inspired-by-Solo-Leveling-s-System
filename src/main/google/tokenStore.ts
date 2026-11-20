import fs from 'node:fs';

/** The part of Electron's safeStorage this uses, so tests can pass a fake. */
export interface Encryptor {
  isEncryptionAvailable(): boolean;
  encryptString(plainText: string): Buffer;
  decryptString(encrypted: Buffer): string;
}

/** safeStorage isn't available, so the sign-in can't be saved. Its message is shown in Settings. */
export class SecureStorageError extends Error {
  constructor() {
    super('This computer can’t store the Google sign-in securely, so AwakeN won’t save it.');
    this.name = 'SecureStorageError';
  }
}

export interface StoredGoogleAccount {
  /** Shown in Settings so you can see which account is connected. */
  email: string;
  /** null once Google has refused it: the account needs reconnecting. */
  refreshToken: string | null;
}

export interface TokenStore {
  /** null when nothing is stored or the file can't be decrypted. */
  load(): StoredGoogleAccount | null;
  save(account: StoredGoogleAccount): void;
  clear(): void;
}

/**
 * Keeps the Google account in one file, encrypted with safeStorage (on Windows that's DPAPI, tied
 * to your Windows user). Never in SQLite. The access token isn't stored at all.
 */
export function createTokenStore(filePath: string, encryptor: Encryptor): TokenStore {
  const tempPath = `${filePath}.tmp`;

  return {
    load() {
      let encrypted: Buffer;
      try {
        encrypted = fs.readFileSync(filePath);
      } catch {
        return null;
      }
      if (!encryptor.isEncryptionAvailable()) return null;
      try {
        return parseAccount(JSON.parse(encryptor.decryptString(encrypted)));
      } catch {
        // Unreadable (say, copied from another Windows user): treat it as not connected.
        return null;
      }
    },

    save(account) {
      if (!encryptor.isEncryptionAvailable()) throw new SecureStorageError();
      const encrypted = encryptor.encryptString(JSON.stringify(account));
      // Write then rename, so a crash mid-write never leaves half a file.
      fs.writeFileSync(tempPath, encrypted, { mode: 0o600 });
      fs.renameSync(tempPath, filePath);
    },

    clear() {
      fs.rmSync(filePath, { force: true });
      fs.rmSync(tempPath, { force: true });
    },
  };
}

function parseAccount(value: unknown): StoredGoogleAccount | null {
  if (typeof value !== 'object' || value === null) return null;
  const { email, refreshToken } = value as Record<string, unknown>;
  if (typeof email !== 'string' || email === '') return null;
  if (refreshToken !== null && (typeof refreshToken !== 'string' || refreshToken === '')) return null;
  return { email, refreshToken };
}
