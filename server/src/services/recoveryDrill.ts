import { GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, type S3Client } from '@aws-sdk/client-s3';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import { mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Open } from 'unzipper';
import {
  decryptBackupFile,
  getBackupConfig,
  hashFile,
  parseBackupWriterMetadata,
  type BackupConfig,
} from './offsiteBackup.js';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const STATE_PATH = path.join(DATA_DIR, '.recovery-drill-state.json');
const DRILL_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
const HEALTH_MAX_AGE_MS = 8 * 24 * 60 * 60 * 1000;
const SCHEDULER_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const REQUIRED_DATABASES = ['patterns.db', 'credits.db', 'auth.db', 'beta-applications.db'];
export const BACKUP_OBJECT_KEY_PATTERN = /^[A-Za-z0-9._/-]+\.ssbackup$/;

export type RecoveryDrillStep = 'list' | 'download' | 'decrypt' | 'unzip' | 'integrity';
export type RecoveryDrillErrorCode = 'download_truncated' | 'size_mismatch';

export interface RecoveryDrillResult {
  backup: string;
  backupCreatedAt?: string;
  completedAt: string;
  attemptedAt: string;
  databasesVerified: number;
  filesRestored: number;
  downloadedBytes?: number;
  storageBytes?: number;
  writerBytes?: number;
  writerSha256?: string;
  downloadedSha256?: string;
  failedStep?: RecoveryDrillStep;
  error?: string;
  errorCode?: RecoveryDrillErrorCode;
}

export interface BackupObjectInfo {
  key: string;
  lastModified?: string;
  size?: number;
}

export interface RecoveryDrillOptions {
  now?: Date;
  key?: string;
  persist?: boolean;
  client?: Pick<S3Client, 'send'>;
  bucket?: string;
  prefix?: string;
  encryptionKey?: Buffer;
}

interface RecoveryDrillState {
  lastResult?: RecoveryDrillResult;
  lastError?: string;
  lastSuccessAt?: string;
}

export class RecoveryDrillFailure extends Error {
  readonly step: RecoveryDrillStep;
  readonly result: RecoveryDrillResult;
  readonly errorCode?: RecoveryDrillErrorCode;

  constructor(step: RecoveryDrillStep, result: RecoveryDrillResult, cause?: unknown) {
    super(result.error ?? (cause instanceof Error ? cause.message : 'Recovery drill failed'));
    this.name = 'RecoveryDrillFailure';
    this.step = step;
    this.result = result;
    this.errorCode = result.errorCode;
    if (cause instanceof Error && cause.stack) this.stack = cause.stack;
  }
}

let state: RecoveryDrillState = readState();
let running = false;

function readState(): RecoveryDrillState {
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')) as RecoveryDrillState;
  } catch {
    return {};
  }
}

function writeState(): void {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const temporary = `${STATE_PATH}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(state), { mode: 0o600 });
    fs.renameSync(temporary, STATE_PATH);
  } catch (error) {
    console.error('[recovery-drill] could not persist drill state:', error);
  }
}

export function publicDrillErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : 'Unknown recovery drill failure';
  return raw
    .replace(/AKIA[0-9A-Z]{16}/g, '[redacted]')
    .replace(/\b(?:AWS|BACKUP)_[A-Z0-9_]+\b/g, '[redacted]')
    .replace(/(?:secretAccessKey|accessKeyId|sessionToken|BACKUP_ENCRYPTION_KEY)\s*[:=]\s*\S+/gi, '[redacted]');
}

export function compareBackupSizes(input: {
  downloadedBytes: number;
  storageBytes?: number;
  writerBytes?: number;
  downloadedSha256?: string;
  writerSha256?: string;
}): { errorCode: RecoveryDrillErrorCode; message: string } | null {
  const { downloadedBytes, storageBytes, writerBytes, downloadedSha256, writerSha256 } = input;

  if (typeof storageBytes === 'number' && downloadedBytes < storageBytes) {
    return {
      errorCode: 'download_truncated',
      message: `Downloaded ${downloadedBytes} bytes but storage reports ${storageBytes}.`,
    };
  }
  if (typeof storageBytes === 'number' && downloadedBytes !== storageBytes) {
    return {
      errorCode: 'size_mismatch',
      message: `Downloaded ${downloadedBytes} bytes but storage reports ${storageBytes}.`,
    };
  }
  if (typeof writerBytes === 'number' && downloadedBytes !== writerBytes) {
    return {
      errorCode: storageBytes == null && downloadedBytes < writerBytes ? 'download_truncated' : 'size_mismatch',
      message: `Downloaded ${downloadedBytes} bytes but the writer recorded ${writerBytes}.`,
    };
  }
  if (writerSha256 && downloadedSha256 && writerSha256 !== downloadedSha256) {
    return {
      errorCode: 'size_mismatch',
      message: 'Downloaded backup hash does not match the hash recorded by the writer.',
    };
  }
  return null;
}

async function countFiles(directory: string): Promise<number> {
  let count = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    count += entry.isDirectory() ? await countFiles(path.join(directory, entry.name)) : 1;
  }
  return count;
}

function resolveDrillConfig(options: RecoveryDrillOptions = {}): BackupConfig {
  if (options.client) {
    return {
      client: options.client as S3Client,
      bucket: options.bucket ?? 'test-bucket',
      prefix: (options.prefix ?? 'stitchspeak').replace(/^\/+|\/+$/g, ''),
      encryptionKey: options.encryptionKey ?? Buffer.alloc(32),
    };
  }
  const cfg = getBackupConfig();
  if (!cfg) throw new Error('Offsite backup is not configured.');
  return cfg;
}

export async function listBackupObjects(options: RecoveryDrillOptions = {}): Promise<BackupObjectInfo[]> {
  const cfg = resolveDrillConfig(options);
  const items: BackupObjectInfo[] = [];
  let token: string | undefined;
  do {
    const listed = await cfg.client.send(new ListObjectsV2Command({
      Bucket: cfg.bucket,
      Prefix: `${cfg.prefix}/`,
      ContinuationToken: token,
    }));
    for (const item of listed.Contents ?? []) {
      if (!item.Key?.endsWith('.ssbackup')) continue;
      items.push({
        key: item.Key,
        lastModified: item.LastModified?.toISOString(),
        size: item.Size,
      });
    }
    token = listed.IsTruncated ? listed.NextContinuationToken : undefined;
  } while (token);
  return items.sort((a, b) => (b.lastModified ?? '').localeCompare(a.lastModified ?? ''));
}

function lastSuccessTimestamp(current: RecoveryDrillState): string | undefined {
  if (current.lastSuccessAt) return current.lastSuccessAt;
  if (current.lastResult && !current.lastResult.failedStep) return current.lastResult.completedAt;
  return undefined;
}

function shouldPersist(options: RecoveryDrillOptions): boolean {
  if (typeof options.persist === 'boolean') return options.persist;
  return !options.key;
}

function recordAttempt(result: RecoveryDrillResult, persist: boolean, error?: string): void {
  if (!persist) return;
  const lastSuccessAt = result.failedStep ? lastSuccessTimestamp(state) : result.completedAt;
  state = {
    lastResult: result,
    lastSuccessAt,
    ...(error ? { lastError: error } : {}),
  };
  writeState();
}

async function verifyRestoredDatabases(restoredDir: string): Promise<void> {
  for (const databaseName of REQUIRED_DATABASES) {
    const databasePath = path.join(restoredDir, databaseName);
    if (!fs.existsSync(databasePath)) throw new Error(`Restored snapshot is missing ${databaseName}.`);
    const db = new Database(databasePath, { readonly: true, fileMustExist: true });
    try {
      if (db.pragma('integrity_check', { simple: true }) !== 'ok') {
        throw new Error(`${databaseName} failed integrity_check.`);
      }
    } finally {
      db.close();
    }
  }
}

export async function runRecoveryDrill(options: RecoveryDrillOptions = {}): Promise<RecoveryDrillResult> {
  if (running) throw new Error('A recovery drill is already running.');
  running = true;
  const now = options.now ?? new Date();
  const persist = shouldPersist(options);
  const attemptedAt = now.toISOString();
  let backup = options.key ?? '';
  let backupCreatedAt: string | undefined;
  let downloadedBytes: number | undefined;
  let storageBytes: number | undefined;
  let writerBytes: number | undefined;
  let writerSha256: string | undefined;
  let downloadedSha256: string | undefined;
  let failedStep: RecoveryDrillStep = 'list';

  const fail = (step: RecoveryDrillStep, error: unknown, extras: Partial<RecoveryDrillResult> = {}): never => {
    const message = publicDrillErrorMessage(error);
    const result: RecoveryDrillResult = {
      backup,
      backupCreatedAt,
      completedAt: attemptedAt,
      attemptedAt,
      databasesVerified: 0,
      filesRestored: 0,
      downloadedBytes,
      storageBytes,
      writerBytes,
      writerSha256,
      downloadedSha256,
      failedStep: step,
      error: message,
      ...extras,
    };
    recordAttempt(result, persist, message);
    throw new RecoveryDrillFailure(step, result, error);
  };

  try {
    const cfg = resolveDrillConfig(options);
    let selected: BackupObjectInfo | undefined;

    try {
      const listed = await listBackupObjects(options);
      if (options.key) {
        if (!BACKUP_OBJECT_KEY_PATTERN.test(options.key)) {
          throw new Error('Backup key must be an object key ending in .ssbackup.');
        }
        selected = listed.find((item) => item.key === options.key);
        if (!selected) {
          const head = await cfg.client.send(new HeadObjectCommand({ Bucket: cfg.bucket, Key: options.key }));
          selected = {
            key: options.key,
            lastModified: head.LastModified?.toISOString(),
            size: head.ContentLength,
          };
          const writer = parseBackupWriterMetadata(head.Metadata);
          writerBytes = writer.writerBytes;
          writerSha256 = writer.writerSha256;
        }
      } else {
        selected = listed[0];
      }
      if (!selected?.key) throw new Error('No encrypted backups were found in the configured bucket.');
      backup = selected.key;
      backupCreatedAt = selected.lastModified;
      storageBytes = selected.size;
    } catch (error) {
      if (error instanceof RecoveryDrillFailure) throw error;
      fail('list', error);
    }

    const workspace = await mkdtemp(path.join(os.tmpdir(), 'stitchspeak-recovery-drill-'));
    try {
      const encryptedPath = path.join(workspace, 'backup.ssbackup');
      const zipPath = path.join(workspace, 'restored.zip');
      const restoredDir = path.join(workspace, 'restored');
      fs.mkdirSync(restoredDir);

      try {
        failedStep = 'download';
        const [object, head] = await Promise.all([
          cfg.client.send(new GetObjectCommand({ Bucket: cfg.bucket, Key: backup })),
          cfg.client.send(new HeadObjectCommand({ Bucket: cfg.bucket, Key: backup })).catch(() => undefined),
        ]);
        if (!object.Body || typeof (object.Body as Readable).pipe !== 'function') {
          throw new Error('Backup object did not provide a readable body.');
        }
        storageBytes = object.ContentLength ?? head?.ContentLength ?? storageBytes;
        const writer = parseBackupWriterMetadata(head?.Metadata);
        writerBytes = writer.writerBytes ?? writerBytes;
        writerSha256 = writer.writerSha256 ?? writerSha256;
        await pipeline(object.Body as Readable, fs.createWriteStream(encryptedPath, { mode: 0o600 }));
        downloadedBytes = (await stat(encryptedPath)).size;
        downloadedSha256 = await hashFile(encryptedPath);
        const mismatch = compareBackupSizes({
          downloadedBytes,
          storageBytes,
          writerBytes,
          downloadedSha256,
          writerSha256,
        });
        if (mismatch) {
          fail('download', new Error(mismatch.message), { errorCode: mismatch.errorCode });
        }
      } catch (error) {
        if (error instanceof RecoveryDrillFailure) throw error;
        fail('download', error);
      }

      try {
        failedStep = 'decrypt';
        await decryptBackupFile(encryptedPath, zipPath, cfg.encryptionKey);
      } catch (error) {
        fail('decrypt', error);
      }

      try {
        failedStep = 'unzip';
        // Open.file reads the central directory from the end of a finished zip.
        // Streaming Extract() is the usual source of "unexpected end of file"
        // once an archive has more entries or data descriptors.
        const directory = await Open.file(zipPath);
        await directory.extract({ path: restoredDir });
      } catch (error) {
        fail('unzip', error);
      }

      let filesRestored = 0;
      try {
        failedStep = 'integrity';
        await verifyRestoredDatabases(restoredDir);
        filesRestored = await countFiles(restoredDir);
      } catch (error) {
        fail('integrity', error);
      }

      const result: RecoveryDrillResult = {
        backup,
        backupCreatedAt,
        completedAt: attemptedAt,
        attemptedAt,
        databasesVerified: REQUIRED_DATABASES.length,
        filesRestored,
        downloadedBytes,
        storageBytes,
        writerBytes,
        writerSha256,
        downloadedSha256,
      };
      recordAttempt(result, persist);
      return result;
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  } catch (error) {
    if (error instanceof RecoveryDrillFailure) throw error;
    const message = publicDrillErrorMessage(error);
    const result: RecoveryDrillResult = {
      backup,
      backupCreatedAt,
      completedAt: attemptedAt,
      attemptedAt,
      databasesVerified: 0,
      filesRestored: 0,
      downloadedBytes,
      storageBytes,
      writerBytes,
      writerSha256,
      downloadedSha256,
      failedStep,
      error: message,
    };
    recordAttempt(result, persist, message);
    throw new RecoveryDrillFailure(failedStep, result, error);
  } finally {
    running = false;
  }
}

export function recoveryDrillHealth(now = Date.now()): {
  ok: boolean;
  running: boolean;
  lastResult: RecoveryDrillResult | null;
  lastError: string | null;
} {
  const lastResult = state.lastResult ?? null;
  const successAt = lastSuccessTimestamp(state);
  const fresh = successAt ? now - Date.parse(successAt) <= HEALTH_MAX_AGE_MS : false;
  return {
    ok: fresh && !state.lastError && !lastResult?.failedStep,
    running,
    lastResult,
    lastError: state.lastError ?? null,
  };
}

export function scheduleRecoveryDrills(): void {
  const runIfDue = () => {
    const completedAt = lastSuccessTimestamp(state);
    if (running || (completedAt && Date.now() - Date.parse(completedAt) < DRILL_INTERVAL_MS)) return;
    void runRecoveryDrill()
      .then((result) => console.log(JSON.stringify({ event: 'recovery_drill', status: 'ok', ...result })))
      .catch((error) => console.error('[recovery-drill] failed:', error));
  };
  runIfDue();
  const interval = setInterval(runIfDue, SCHEDULER_INTERVAL_MS);
  interval.unref();
}
