import fs from 'node:fs';
import path from 'node:path';
import { decryptBackupFile } from '../services/offsiteBackup.js';

const [, , input, output = 'stitchspeak-restored.zip'] = process.argv;
const encodedKey = process.env.BACKUP_ENCRYPTION_KEY?.trim();

if (!input || !encodedKey) {
  console.error('Usage: BACKUP_ENCRYPTION_KEY=<base64-key> npm run backup:restore -- <backup.ssbackup> [output.zip]');
  process.exitCode = 1;
} else {
  const key = Buffer.from(encodedKey, 'base64');
  await decryptBackupFile(path.resolve(input), path.resolve(output), key);
  console.log(`Backup decrypted and authenticated: ${path.resolve(output)} (${fs.statSync(output).size} bytes)`);
}
