import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { Open } from 'unzipper';
import Database from 'better-sqlite3';
import {
  createEncryptedBackupFromDirectory,
  decryptBackupFile,
  encryptBackupFile,
} from '../src/services/offsiteBackup';

const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'stitchspeak-backup-test-'));

afterEach(() => {
  for (const name of fs.readdirSync(workspace)) {
    fs.rmSync(path.join(workspace, name), { recursive: true, force: true });
  }
});
afterAll(() => fs.rmSync(workspace, { recursive: true, force: true }));

describe('offsite backup encryption', () => {
  it('authenticates and restores the exact original bytes', async () => {
    const source = path.join(workspace, 'source.zip');
    const encrypted = path.join(workspace, 'backup.ssbackup');
    const restored = path.join(workspace, 'restored.zip');
    const bytes = randomBytes(256 * 1024);
    const key = randomBytes(32);
    fs.writeFileSync(source, bytes);

    await encryptBackupFile(source, encrypted, key);
    expect(fs.readFileSync(encrypted).includes(bytes.subarray(0, 64))).toBe(false);
    await decryptBackupFile(encrypted, restored, key);
    expect(fs.readFileSync(restored)).toEqual(bytes);
  });

  it('rejects restoration with the wrong key', async () => {
    const source = path.join(workspace, 'source.zip');
    const encrypted = path.join(workspace, 'backup.ssbackup');
    fs.writeFileSync(source, 'private customer data');
    await encryptBackupFile(source, encrypted, randomBytes(32));
    await expect(decryptBackupFile(encrypted, path.join(workspace, 'bad.zip'), randomBytes(32))).rejects.toThrow();
  });

  it('round-trips snapshot, encrypt, decrypt, unzip, and SQLite integrity', async () => {
    const sourceDir = path.join(workspace, 'data');
    fs.mkdirSync(path.join(sourceDir, 'sources'), { recursive: true });
    for (const name of ['patterns.db', 'credits.db', 'auth.db', 'beta-applications.db']) {
      const db = new Database(path.join(sourceDir, name));
      db.exec('CREATE TABLE probe (id INTEGER PRIMARY KEY, note TEXT); INSERT INTO probe (note) VALUES (\'writer\');');
      db.close();
    }
    fs.writeFileSync(path.join(sourceDir, 'sources', 'pattern.txt'), 'k2tog');

    const encrypted = path.join(workspace, 'roundtrip.ssbackup');
    const zipPath = path.join(workspace, 'roundtrip.zip');
    const restoredDir = path.join(workspace, 'restored');
    fs.mkdirSync(restoredDir);
    const key = randomBytes(32);
    const artifact = await createEncryptedBackupFromDirectory(sourceDir, encrypted, key);
    expect(artifact.byteSize).toBe(fs.statSync(encrypted).size);
    expect(artifact.sha256).toMatch(/^[0-9a-f]{64}$/);

    await decryptBackupFile(encrypted, zipPath, key);
    await (await Open.file(zipPath)).extract({ path: restoredDir });
    for (const name of ['patterns.db', 'credits.db', 'auth.db', 'beta-applications.db']) {
      const db = new Database(path.join(restoredDir, name), { readonly: true, fileMustExist: true });
      try {
        expect(db.pragma('integrity_check', { simple: true })).toBe('ok');
        expect(db.prepare('SELECT note FROM probe').get()).toEqual({ note: 'writer' });
      } finally {
        db.close();
      }
    }
    expect(fs.readFileSync(path.join(restoredDir, 'sources', 'pattern.txt'), 'utf8')).toBe('k2tog');
  });
});
