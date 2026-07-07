import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { decryptBackupFile, encryptBackupFile } from '../src/services/offsiteBackup';

const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'stitchspeak-backup-test-'));

afterEach(() => {
  for (const name of fs.readdirSync(workspace)) fs.rmSync(path.join(workspace, name), { force: true });
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
});
