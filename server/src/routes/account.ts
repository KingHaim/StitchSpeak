import { Router, type NextFunction, type Request, type Response } from 'express';
import { ZipArchive } from 'archiver';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { getBalance } from '../services/creditStore.js';
import {
  getChatState,
  getPattern,
  getSourceFile,
  getThumbnailFile,
  listPatterns,
} from '../services/patternStore.js';

const router = Router();
router.use(requireAuth);
router.use(rateLimit({ windowMs: 60 * 60 * 1000, max: 3, name: 'account-export' }));

function safeName(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'pattern';
}

router.get('/export', (req: Request, res: Response, next: NextFunction) => {
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

export default router;
