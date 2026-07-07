import { Router, type NextFunction, type Request, type Response } from 'express';
import { ZipArchive } from 'archiver';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { deleteCreditAccount, getBalance } from '../services/creditStore.js';
import { deleteEmailAccount } from '../services/emailAuth.js';
import {
  getChatState,
  getPattern,
  getSourceFile,
  getThumbnailFile,
  listPatterns,
  deleteAllPatterns,
} from '../services/patternStore.js';

const router = Router();
router.use(requireAuth);

function safeName(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'pattern';
}

router.get('/export', rateLimit({ windowMs: 60 * 60 * 1000, max: 3, name: 'account-export' }), (req: Request, res: Response, next: NextFunction) => {
  const { userSub, userEmail, identityProvider, emailVerified } = req as AuthenticatedRequest;
  const archive = new ZipArchive({ zlib: { level: 6 } });

  archive.on('warning', (err: Error) => console.warn('[account/export] archive warning:', err));
  archive.on('error', next);

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="stitchspeak-data-${new Date().toISOString().slice(0, 10)}.zip"`);
  res.setHeader('Cache-Control', 'private, no-store');
  archive.pipe(res);

  const patterns = listPatterns(userSub);
  archive.append(JSON.stringify({
    exportedAt: new Date().toISOString(),
    account: { sub: userSub, email: userEmail ?? null, identityProvider, emailVerified },
    credits: { balance: getBalance(userSub) },
    patternCount: patterns.length,
  }, null, 2), { name: 'account.json' });

  for (const pattern of patterns) {
    const full = getPattern(userSub, pattern.id);
    if (!full) continue;
    const directory = `patterns/${safeName(pattern.fileName)}-${pattern.id}`;
    const { html, ...metadata } = full;
    archive.append(JSON.stringify(metadata, null, 2), { name: `${directory}/metadata.json` });
    archive.append(html, { name: `${directory}/translation.html` });
    archive.append(JSON.stringify(getChatState(userSub, pattern.id) ?? { messages: [], extraAllowance: 0 }, null, 2), {
      name: `${directory}/chat.json`,
    });

    const source = getSourceFile(userSub, pattern.id);
    if (source) archive.append(source.data, { name: `${directory}/original${source.ext ?? ''}` });
    const thumbnail = getThumbnailFile(userSub, pattern.id);
    if (thumbnail) archive.append(thumbnail.data, { name: `${directory}/thumbnail.jpg` });
  }

  void archive.finalize();
});

router.delete('/', rateLimit({ windowMs: 60 * 60 * 1000, max: 5, name: 'account-delete' }), (req: Request, res: Response) => {
  const { userSub } = req as AuthenticatedRequest;
  if (req.body?.confirmation !== 'DELETE') {
    res.status(400).json({ error: 'Type DELETE to confirm permanent account deletion.' });
    return;
  }

  // Each operation is idempotent, so an interrupted request can be retried safely.
  // Financial ledgers are retained under an irreversible pseudonymous identifier.
  const financial = deleteCreditAccount(userSub);
  const patternsDeleted = deleteAllPatterns(userSub);
  const credentialsDeleted = deleteEmailAccount(userSub);
  res.setHeader('Cache-Control', 'no-store');
  res.json({ ok: true, patternsDeleted, credentialsDeleted, ...financial });
});

export default router;
