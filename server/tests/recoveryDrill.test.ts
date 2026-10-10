import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { ZipArchive } from 'archiver';
import Database from 'better-sqlite3';
import { afterAll, describe, expect, it } from 'vitest';
import { encryptBackupFile } from '../src/services/offsiteBackup';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stitchspeak-drill-test-'));
process.env.DATA_DIR = dataDir;

const {
  compareBackupSizes,
  listBackupObjects,
  recoveryDrillHealth,
  RecoveryDrillFailure,
  REQUIRED_DATABASES,
  runRecoveryDrill,
} = await import('../src/services/recoveryDrill');
const {
  backupObjectMetadata,
  createEncryptedBackupFromDirectory,
  hashFile,
  runOffsiteBackup,
} = await import('../src/services/offsiteBackup');

const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'stitchspeak-drill-work-'));

afterAll(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
  fs.rmSync(workspace, { recursive: true, force: true });
});

interface FakeObject {
  body: Buffer;
  lastModified: Date;
  metadata?: Record<string, string>;
  reportedSize?: number;
}

function commandName(command: unknown): string {
  return String((command as { constructor?: { name?: string } }).constructor?.name ?? '');
}

function createFakeS3(
  objects: Map<string, FakeObject>,
  options: { truncateGetBy?: number } = {},
) {
  return {
    send: async (command: unknown) => {
      const name = commandName(command);
      const input = (command as { input?: Record<string, unknown> }).input ?? {};
      if (name === 'ListObjectsV2Command') {
        return {
          Contents: [...objects.entries()].map(([Key, item]) => ({
            Key,
            LastModified: item.lastModified,
            Size: item.reportedSize ?? item.body.length,
          })),
        };
      }
      if (name === 'HeadObjectCommand') {
        const item = objects.get(String(input.Key));
        if (!item) throw new Error('NotFound');
        return {
          ContentLength: item.reportedSize ?? item.body.length,
          LastModified: item.lastModified,
          Metadata: item.metadata,
        };
      }
      if (name === 'GetObjectCommand') {
        const item = objects.get(String(input.Key));
        if (!item) throw new Error('NotFound');
        const body = options.truncateGetBy
          ? item.body.subarray(0, Math.max(0, item.body.length - options.truncateGetBy))
          : item.body;
        return {
          Body: Readable.from(body),
          ContentLength: item.reportedSize ?? item.body.length,
        };
      }
      if (name === 'PutObjectCommand') {
        const chunks: Buffer[] = [];
        const body = input.Body as Readable;
        for await (const chunk of body) chunks.push(Buffer.from(chunk));
        objects.set(String(input.Key), {
          body: Buffer.concat(chunks),
          lastModified: new Date(),
          metadata: input.Metadata as Record<string, string> | undefined,
        });
        return {};
      }
      if (name === 'DeleteObjectCommand') {
        objects.delete(String(input.Key));
        return {};
      }
      throw new Error(`Unexpected command ${name}`);
    },
  };
}

function writeRequiredDatabases(directory: string, extra: Record<string, string> = {}): void {
  fs.mkdirSync(directory, { recursive: true });
  for (const name of REQUIRED_DATABASES) {
    const db = new Database(path.join(directory, name));
    db.exec('CREATE TABLE IF NOT EXISTS probe (id INTEGER PRIMARY KEY, note TEXT); INSERT INTO probe (note) VALUES (\'ok\');');
    db.close();
  }
  for (const [name, contents] of Object.entries(extra)) {
    const target = path.join(directory, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents);
  }
}

async function zipEncrypt(sourceDir: string, encryptedPath: string, key: Buffer): Promise<void> {
  const zipPath = `${encryptedPath}.zip`;
  const output = fs.createWriteStream(zipPath);
  const archive = new ZipArchive({ zlib: { level: 6 } });
  const done = new Promise<void>((resolve, reject) => {
    output.on('close', resolve);
    output.on('error', reject);
    archive.on('error', reject);
  });
  archive.pipe(output);
  archive.directory(sourceDir, false);
  await archive.finalize();
  await done;
  await encryptBackupFile(zipPath, encryptedPath, key);
}

async function expectFailedStep(step: string, run: () => Promise<unknown>) {
  try {
    await run();
    throw new Error(`expected drill to fail at ${step}`);
  } catch (error) {
    expect(error).toBeInstanceOf(RecoveryDrillFailure);
    const failure = error as InstanceType<typeof RecoveryDrillFailure>;
    expect(failure.step).toBe(step);
    expect(failure.result.failedStep).toBe(step);
    expect(failure.result.error).toBeTruthy();
    return failure;
  }
}

describe('backup size comparison', () => {
  it('flags a short download against storage size as download_truncated', () => {
    expect(compareBackupSizes({ downloadedBytes: 80, storageBytes: 100 })).toEqual({
      errorCode: 'download_truncated',
      message: 'Downloaded 80 bytes but storage reports 100.',
    });
  });

  it('flags a writer size or hash disagreement as size_mismatch', () => {
    expect(compareBackupSizes({ downloadedBytes: 100, storageBytes: 100, writerBytes: 120 })).toEqual({
      errorCode: 'size_mismatch',
      message: 'Downloaded 100 bytes but the writer recorded 120.',
    });
    expect(compareBackupSizes({
      downloadedBytes: 100,
      storageBytes: 100,
      downloadedSha256: 'aaa',
      writerSha256: 'bbb',
    })?.errorCode).toBe('size_mismatch');
  });
});

describe('recovery drill diagnostics', () => {
  it('detects a truncated download as download_truncated and records the download step', async () => {
    const source = fs.mkdtempSync(path.join(workspace, 'trunc-src-'));
    writeRequiredDatabases(source);
    const key = randomBytes(32);
    const encryptedPath = path.join(workspace, 'trunc.ssbackup');
    const artifact = await createEncryptedBackupFromDirectory(source, encryptedPath, key);
    const objectKey = 'production/2026-10-10T00-00-00-000Z.ssbackup';
    const objects = new Map<string, FakeObject>([[objectKey, {
      body: fs.readFileSync(encryptedPath),
      lastModified: new Date('2026-10-10T00:00:00.000Z'),
      metadata: backupObjectMetadata(artifact.byteSize, artifact.sha256),
    }]]);

    const failure = await expectFailedStep('download', () => runRecoveryDrill({
      client: createFakeS3(objects, { truncateGetBy: 64 }),
      encryptionKey: key,
      prefix: 'production',
      persist: true,
    }));
    expect(failure.result.errorCode).toBe('download_truncated');
    expect(failure.result.backup).toBe(objectKey);
    expect(failure.result.storageBytes).toBe(artifact.byteSize);
    expect(failure.result.downloadedBytes).toBeLessThan(artifact.byteSize);
    expect(recoveryDrillHealth().lastResult?.failedStep).toBe('download');
    expect(recoveryDrillHealth().lastResult?.errorCode).toBe('download_truncated');
    expect(recoveryDrillHealth().ok).toBe(false);
  });

  it('reports list, decrypt, unzip, and integrity failures on the matching step', async () => {
    const key = randomBytes(32);
    const prefix = 'production';

    const listFailure = await expectFailedStep('list', () => runRecoveryDrill({
      client: createFakeS3(new Map()),
      encryptionKey: key,
      prefix,
      persist: true,
    }));
    expect(listFailure.result.error).toMatch(/no encrypted backups/i);

    const garbage = randomBytes(512);
    const decryptKey = 'production/decrypt.ssbackup';
    const decryptFailure = await expectFailedStep('decrypt', () => runRecoveryDrill({
      client: createFakeS3(new Map([[decryptKey, {
        body: garbage,
        lastModified: new Date('2026-10-09T00:00:00.000Z'),
      }]])),
      encryptionKey: key,
      prefix,
      persist: true,
    }));
    expect(decryptFailure.result.failedStep).toBe('decrypt');

    const notZip = path.join(workspace, 'not-a-zip.bin');
    const encryptedNotZip = path.join(workspace, 'not-a-zip.ssbackup');
    fs.writeFileSync(notZip, 'this is not a zip archive');
    await encryptBackupFile(notZip, encryptedNotZip, key);
    const unzipKey = 'production/unzip.ssbackup';
    const unzipBody = fs.readFileSync(encryptedNotZip);
    const unzipFailure = await expectFailedStep('unzip', () => runRecoveryDrill({
      client: createFakeS3(new Map([[unzipKey, {
        body: unzipBody,
        lastModified: new Date('2026-10-08T00:00:00.000Z'),
      }]])),
      encryptionKey: key,
      prefix,
      persist: true,
    }));
    expect(unzipFailure.result.failedStep).toBe('unzip');

    const incomplete = fs.mkdtempSync(path.join(workspace, 'incomplete-'));
    writeRequiredDatabases(incomplete);
    fs.rmSync(path.join(incomplete, 'auth.db'));
    const incompleteEncrypted = path.join(workspace, 'incomplete.ssbackup');
    await zipEncrypt(incomplete, incompleteEncrypted, key);
    const integrityKey = 'production/integrity.ssbackup';
    const integrityFailure = await expectFailedStep('integrity', () => runRecoveryDrill({
      client: createFakeS3(new Map([[integrityKey, {
        body: fs.readFileSync(incompleteEncrypted),
        lastModified: new Date('2026-10-07T00:00:00.000Z'),
      }]])),
      encryptionKey: key,
      prefix,
      persist: true,
    }));
    expect(integrityFailure.result.error).toMatch(/auth\.db/);
  });

  it('drills a chosen backup key instead of the newest object', async () => {
    const source = fs.mkdtempSync(path.join(workspace, 'chosen-src-'));
    writeRequiredDatabases(source, { 'sources/note.txt': 'chosen' });
    const key = randomBytes(32);
    const olderPath = path.join(workspace, 'older.ssbackup');
    const newerPath = path.join(workspace, 'newer.ssbackup');
    await createEncryptedBackupFromDirectory(source, olderPath, key);
    await createEncryptedBackupFromDirectory(source, newerPath, key);
    const olderKey = 'production/2026-10-01T20-48-23-773Z.ssbackup';
    const newerKey = 'production/2026-10-10T20-48-23-773Z.ssbackup';
    const objects = new Map<string, FakeObject>([
      [olderKey, { body: fs.readFileSync(olderPath), lastModified: new Date('2026-10-01T20:48:36.625Z') }],
      [newerKey, { body: fs.readFileSync(newerPath), lastModified: new Date('2026-10-10T20:48:36.625Z') }],
    ]);
    const client = createFakeS3(objects);

    const listed = await listBackupObjects({ client, encryptionKey: key, prefix: 'production' });
    expect(listed.map((item) => item.key)).toEqual([newerKey, olderKey]);

    const result = await runRecoveryDrill({
      client,
      encryptionKey: key,
      prefix: 'production',
      key: olderKey,
    });
    expect(result.backup).toBe(olderKey);
    expect(result.failedStep).toBeUndefined();
    expect(result.databasesVerified).toBe(4);
    expect(result.filesRestored).toBeGreaterThanOrEqual(4);
  });

  it('writes, downloads, and restores a synthetic snapshot through the backup writer', async () => {
    const source = fs.mkdtempSync(path.join(workspace, 'roundtrip-'));
    writeRequiredDatabases(source, { 'sources/pattern.txt': 'k2tog' });
    const key = randomBytes(32);
    const objects = new Map<string, FakeObject>();
    const client = createFakeS3(objects);

    await runOffsiteBackup({
      client,
      bucket: 'test-bucket',
      prefix: 'production',
      encryptionKey: key,
      dataDir: source,
    });

    expect(objects.size).toBe(1);
    const [objectKey, stored] = [...objects.entries()][0];
    expect(stored.metadata?.['byte-size']).toBe(String(stored.body.length));
    const uploadedCopy = path.join(workspace, 'uploaded.ssbackup');
    fs.writeFileSync(uploadedCopy, stored.body);
    expect(stored.metadata?.sha256).toBe(await hashFile(uploadedCopy));
    expect(objectKey.startsWith('production/')).toBe(true);
    expect(objectKey.endsWith('.ssbackup')).toBe(true);

    const result = await runRecoveryDrill({
      client,
      encryptionKey: key,
      prefix: 'production',
      persist: true,
    });
    expect(result.backup).toBe(objectKey);
    expect(result.databasesVerified).toBe(4);
    expect(result.filesRestored).toBeGreaterThanOrEqual(5);
    expect(result.downloadedBytes).toBe(stored.body.length);
    expect(result.storageBytes).toBe(stored.body.length);
    expect(result.writerBytes).toBe(stored.body.length);
    expect(result.writerSha256).toBe(stored.metadata?.sha256);
    expect(result.failedStep).toBeUndefined();
  });
});
