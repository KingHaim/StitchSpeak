import { GetObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Extract } from 'unzipper';
import { decryptBackupFile } from './offsiteBackup.js';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const STATE_PATH = path.join(DATA_DIR, '.recovery-drill-state.json');
const DRILL_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
const HEALTH_MAX_AGE_MS = 8 * 24 * 60 * 60 * 1000;
const SCHEDULER_INTERVAL_MS = 24 * 60 * 60 * 1000;
const REQUIRED_DATABASES = ['patterns.db', 'credits.db', 'auth.db', 'beta-applications.db'];

interface RecoveryDrillResult {
  backup: string;
  backupCreatedAt?: string;
  completedAt: string;
  databasesVerified: number;
  filesRestored: number;
}

interface RecoveryDrillState {
  lastResult?: RecoveryDrillResult;
  lastError?: string;
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

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for the recovery drill.`);
  return value;
}

async function countFiles(directory: string): Promise<number> {
  let count = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    count += entry.isDirectory() ? await countFiles(path.join(directory, entry.name)) : 1;
  }
  return count;
}

export async function runRecoveryDrill(now = new Date()): Promise<RecoveryDrillResult> {
  if (running) throw new Error('A recovery drill is already running.');
  running = true;
  try {
    const endpoint = required('BACKUP_S3_ENDPOINT');
    const region = required('BACKUP_S3_REGION');
    const bucket = required('BACKUP_S3_BUCKET');
    const prefix = (process.env.BACKUP_S3_PREFIX?.trim() || 'stitchspeak').replace(/^\/+|\/+$/g, '');
    const encryptionKey = Buffer.from(required('BACKUP_ENCRYPTION_KEY'), 'base64');
    if (encryptionKey.length !== 32) throw new Error('BACKUP_ENCRYPTION_KEY must decode to 32 bytes.');

    const client = new S3Client({
      endpoint,
      region,
      forcePathStyle: process.env.BACKUP_S3_FORCE_PATH_STYLE === 'true',
      credentials: {
        accessKeyId: required('BACKUP_S3_ACCESS_KEY_ID'),
        secretAccessKey: required('BACKUP_S3_SECRET_ACCESS_KEY'),
      },
    });
    const listed = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: `${prefix}/` }));
    const latest = (listed.Contents ?? [])
      .filter((item) => item.Key?.endsWith('.ssbackup') && item.LastModified)
      .sort((a, b) => b.LastModified!.getTime() - a.LastModified!.getTime())[0];
    if (!latest?.Key) throw new Error('No encrypted backups were found in the configured bucket.');

    const workspace = await mkdtemp(path.join(os.tmpdir(), 'stitchspeak-recovery-drill-'));
    try {
      const encryptedPath = path.join(workspace, 'backup.ssbackup');
      const zipPath = path.join(workspace, 'restored.zip');
      const restoredDir = path.join(workspace, 'restored');
      fs.mkdirSync(restoredDir);

      const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: latest.Key }));
      if (!object.Body || typeof (object.Body as Readable).pipe !== 'function') {
        throw new Error('Backup object did not provide a readable body.');
      }
      await pipeline(object.Body as Readable, fs.createWriteStream(encryptedPath, { mode: 0o600 }));
      await decryptBackupFile(encryptedPath, zipPath, encryptionKey);
      await fs.createReadStream(zipPath).pipe(Extract({ path: restoredDir })).promise();

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

      const result: RecoveryDrillResult = {
        backup: latest.Key,
        backupCreatedAt: latest.LastModified?.toISOString(),
        completedAt: now.toISOString(),
        databasesVerified: REQUIRED_DATABASES.length,
        filesRestored: await countFiles(restoredDir),
      };
      state = { lastResult: result };
      writeState();
      return result;
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  } catch (error) {
    state.lastError = error instanceof Error ? error.message : 'Unknown recovery drill failure';
    writeState();
    throw error;
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
  const fresh = lastResult ? now - Date.parse(lastResult.completedAt) <= HEALTH_MAX_AGE_MS : false;
  return { ok: fresh && !state.lastError, running, lastResult, lastError: state.lastError ?? null };
}

export function scheduleRecoveryDrills(): void {
  const runIfDue = () => {
    const completedAt = state.lastResult?.completedAt;
    if (running || (completedAt && Date.now() - Date.parse(completedAt) < DRILL_INTERVAL_MS)) return;
    void runRecoveryDrill()
      .then((result) => console.log(JSON.stringify({ event: 'recovery_drill', status: 'ok', ...result })))
      .catch((error) => console.error('[recovery-drill] failed:', error));
  };
  runIfDue();
  const interval = setInterval(runIfDue, SCHEDULER_INTERVAL_MS);
  interval.unref();
}
