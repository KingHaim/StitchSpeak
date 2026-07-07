import { GetObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Extract } from 'unzipper';
import { decryptBackupFile } from '../services/offsiteBackup.js';

const REQUIRED_DATABASES = ['patterns.db', 'credits.db', 'auth.db', 'beta-applications.db'];

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

async function main(): Promise<void> {
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
        const result = db.pragma('integrity_check', { simple: true });
        if (result !== 'ok') throw new Error(`${databaseName} failed integrity_check.`);
      } finally {
        db.close();
      }
    }

    const fileCount = await countFiles(restoredDir);
    console.log(JSON.stringify({
      status: 'ok',
      backup: latest.Key,
      createdAt: latest.LastModified?.toISOString(),
      databasesVerified: REQUIRED_DATABASES.length,
      filesRestored: fileCount,
    }));
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

await main();
