import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import { mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { DeleteObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { ZipArchive } from 'archiver';
import Database from 'better-sqlite3';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const STATE_PATH = path.join(DATA_DIR, '.backup-state.json');
const MAGIC = Buffer.from('SSBACKUP1');
const BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const MAX_BACKUP_AGE_MS = 36 * 60 * 60 * 1000;
const RETENTION_DAYS = 30;

interface BackupConfig {
  bucket: string;
  prefix: string;
  encryptionKey: Buffer;
  client: S3Client;
}

interface BackupState {
  lastSuccessAt?: string;
  lastFailureAt?: string;
  lastError?: string;
  objectKey?: string;
}

function config(): BackupConfig | null {
  const endpoint = process.env.BACKUP_S3_ENDPOINT?.trim();
  const region = process.env.BACKUP_S3_REGION?.trim();
  const bucket = process.env.BACKUP_S3_BUCKET?.trim();
  const accessKeyId = process.env.BACKUP_S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.BACKUP_S3_SECRET_ACCESS_KEY?.trim();
  const encodedKey = process.env.BACKUP_ENCRYPTION_KEY?.trim();
  if (!endpoint || !region || !bucket || !accessKeyId || !secretAccessKey || !encodedKey) return null;
  const encryptionKey = Buffer.from(encodedKey, 'base64');
  if (encryptionKey.length !== 32) throw new Error('BACKUP_ENCRYPTION_KEY must be a base64-encoded 32-byte key.');
  return {
    bucket,
    prefix: (process.env.BACKUP_S3_PREFIX?.trim() || 'stitchspeak').replace(/^\/+|\/+$/g, ''),
    encryptionKey,
    client: new S3Client({
      endpoint,
      region,
      forcePathStyle: process.env.BACKUP_S3_FORCE_PATH_STYLE === 'true',
      credentials: { accessKeyId, secretAccessKey },
    }),
  };
}

function readState(): BackupState {
  try { return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')) as BackupState; } catch { return {}; }
}

function writeState(state: BackupState): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), { mode: 0o600 });
}

async function snapshotData(target: string): Promise<void> {
  const entries = await readdir(DATA_DIR, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (entry.name === '.backup-state.json' || entry.name.endsWith('-wal') || entry.name.endsWith('-shm')) continue;
    const source = path.join(DATA_DIR, entry.name);
    const destination = path.join(target, entry.name);
    if (entry.isDirectory()) {
      fs.cpSync(source, destination, { recursive: true });
    } else if (entry.name.endsWith('.db')) {
      const sourceDb = new Database(source, { readonly: true });
      try {
        await sourceDb.backup(destination);
        const snapshotDb = new Database(destination, { readonly: true });
        try {
          const row = snapshotDb.pragma('integrity_check', { simple: true });
          if (row !== 'ok') throw new Error(`${entry.name} failed SQLite integrity_check.`);
        } finally {
          snapshotDb.close();
        }
      } finally {
        sourceDb.close();
      }
    } else {
      fs.copyFileSync(source, destination);
    }
  }
}

async function createZip(sourceDir: string, outputPath: string): Promise<void> {
  const output = fs.createWriteStream(outputPath, { mode: 0o600 });
  const archive = new ZipArchive({ zlib: { level: 6 } });
  const completed = new Promise<void>((resolve, reject) => {
    output.on('close', resolve);
    output.on('error', reject);
    archive.on('error', reject);
  });
  archive.pipe(output);
  archive.directory(sourceDir, false);
  await archive.finalize();
  await completed;
}

async function hashFile(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  await new Promise<void>((resolve, reject) => {
    const input = fs.createReadStream(filePath);
    input.on('data', (chunk) => hash.update(chunk));
    input.on('end', resolve);
    input.on('error', reject);
  });
  return hash.digest('hex');
}

export async function encryptBackupFile(inputPath: string, outputPath: string, key: Buffer): Promise<void> {
  if (key.length !== 32) throw new Error('Backup encryption key must be 32 bytes.');
  const iv = randomBytes(12);
  fs.writeFileSync(outputPath, Buffer.concat([MAGIC, iv]), { mode: 0o600 });
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  await pipeline(fs.createReadStream(inputPath), cipher, fs.createWriteStream(outputPath, { flags: 'a' }));
  fs.appendFileSync(outputPath, cipher.getAuthTag());
}

export async function decryptBackupFile(inputPath: string, outputPath: string, key: Buffer): Promise<void> {
  if (key.length !== 32) throw new Error('Backup encryption key must be 32 bytes.');
  const encryptedSize = (await stat(inputPath)).size;
  const header = Buffer.alloc(MAGIC.length + 12);
  const tag = Buffer.alloc(16);
  const fd = fs.openSync(inputPath, 'r');
  try {
    fs.readSync(fd, header, 0, header.length, 0);
    fs.readSync(fd, tag, 0, 16, encryptedSize - 16);
  } finally { fs.closeSync(fd); }
  if (!header.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('Unsupported backup format.');
  const decipher = createDecipheriv('aes-256-gcm', key, header.subarray(MAGIC.length));
  decipher.setAuthTag(tag);
  await pipeline(
    fs.createReadStream(inputPath, { start: header.length, end: encryptedSize - 17 }),
    decipher,
    fs.createWriteStream(outputPath, { mode: 0o600 }),
  );
}

async function encryptAndVerify(inputPath: string, outputPath: string, key: Buffer): Promise<void> {
  await encryptBackupFile(inputPath, outputPath, key);
  const verificationPath = `${outputPath}.verify`;
  await decryptBackupFile(outputPath, verificationPath, key);
  const [expected, actual] = await Promise.all([hashFile(inputPath), hashFile(verificationPath)]);
  fs.rmSync(verificationPath, { force: true });
  if (actual !== expected) throw new Error('Encrypted backup verification failed.');
}

async function pruneOldBackups(cfg: BackupConfig): Promise<void> {
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const listed = await cfg.client.send(new ListObjectsV2Command({ Bucket: cfg.bucket, Prefix: `${cfg.prefix}/` }));
  const expired = (listed.Contents ?? []).filter((item) => item.Key && item.LastModified && item.LastModified.getTime() < cutoff);
  await Promise.all(expired.map((item) => cfg.client.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: item.Key! }))));
}

let running: Promise<void> | null = null;

export function runOffsiteBackup(): Promise<void> {
  if (running) return running;
  running = (async () => {
    const cfg = config();
    if (!cfg) throw new Error('Offsite backup is not configured.');
    const workspace = await mkdtemp(path.join(os.tmpdir(), 'stitchspeak-backup-'));
    try {
      const snapshotDir = path.join(workspace, 'snapshot');
      fs.mkdirSync(snapshotDir);
      const zipPath = path.join(workspace, 'snapshot.zip');
      const encryptedPath = path.join(workspace, 'snapshot.ssbackup');
      await snapshotData(snapshotDir);
      await createZip(snapshotDir, zipPath);
      await encryptAndVerify(zipPath, encryptedPath, cfg.encryptionKey);
      const now = new Date();
      const objectKey = `${cfg.prefix}/${now.toISOString().replace(/[:.]/g, '-')}.ssbackup`;
      const size = (await stat(encryptedPath)).size;
      await cfg.client.send(new PutObjectCommand({
        Bucket: cfg.bucket,
        Key: objectKey,
        Body: fs.createReadStream(encryptedPath),
        ContentLength: size,
        ContentType: 'application/octet-stream',
        Metadata: { encryption: 'aes-256-gcm', format: 'SSBACKUP1' },
      }));
      await pruneOldBackups(cfg);
      writeState({ lastSuccessAt: now.toISOString(), objectKey });
      console.log(`[backup] encrypted offsite backup uploaded: ${objectKey} (${size} bytes)`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown backup failure';
      writeState({ ...readState(), lastFailureAt: new Date().toISOString(), lastError: message });
      throw error;
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  })().finally(() => { running = null; });
  return running;
}

export function backupHealth(): { configured: boolean; ok: boolean; running: boolean; lastSuccessAt?: string; lastError?: string } {
  let configured = false;
  try { configured = config() !== null; } catch { configured = true; }
  const state = readState();
  const fresh = state.lastSuccessAt ? Date.now() - Date.parse(state.lastSuccessAt) < MAX_BACKUP_AGE_MS : false;
  return {
    configured,
    ok: configured && fresh,
    running: running !== null,
    ...(state.lastSuccessAt ? { lastSuccessAt: state.lastSuccessAt } : {}),
    ...(state.lastError ? { lastError: state.lastError } : {}),
  };
}

export function scheduleOffsiteBackups(): void {
  if (!config()) {
    console.warn('[backup] offsite backups are not configured');
    return;
  }
  const run = () => void runOffsiteBackup().catch((error) => console.error('[backup] failed:', error));
  const initial = setTimeout(run, 60_000);
  initial.unref();
  const interval = setInterval(run, BACKUP_INTERVAL_MS);
  interval.unref();
}
