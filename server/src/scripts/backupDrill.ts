import {
  BACKUP_OBJECT_KEY_PATTERN,
  listBackupObjects,
  publicDrillErrorMessage,
  RecoveryDrillFailure,
  runRecoveryDrill,
} from '../services/recoveryDrill.js';

function parseArgs(argv: string[]): { list: boolean; key?: string } {
  const list = argv.includes('--list');
  const keyFlag = argv.indexOf('--key');
  if (keyFlag >= 0) {
    const key = argv[keyFlag + 1];
    if (!key || key.startsWith('--')) {
      throw new Error('Usage: npm run backup:drill -- [--list] [--key <object-key>]');
    }
    if (!BACKUP_OBJECT_KEY_PATTERN.test(key)) {
      throw new Error('Backup key must be an object key ending in .ssbackup.');
    }
    return { list, key };
  }
  return { list };
}

const { list, key } = parseArgs(process.argv.slice(2));

if (list) {
  const backups = await listBackupObjects();
  console.log(JSON.stringify({ backups }, null, 2));
} else {
  try {
    const result = await runRecoveryDrill({ key });
    console.log(JSON.stringify({ status: 'ok', ...result }));
  } catch (error) {
    const result = error instanceof RecoveryDrillFailure ? error.result : undefined;
    console.error(JSON.stringify({
      status: 'failed',
      ...(result ?? {}),
      error: publicDrillErrorMessage(error),
    }));
    process.exitCode = 1;
  }
}
