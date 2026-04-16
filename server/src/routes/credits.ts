import { Router, type Response } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import {
  getBalance,
  addCredits,
  deductCredits,
} from '../services/creditStore.js';

const router = Router();

router.use(requireAuth);

router.get('/', (req, res: Response) => {
  const { userSub } = req as AuthenticatedRequest;
  const balance = getBalance(userSub);
  res.json({ balance });
});

router.post('/add', (req, res: Response) => {
  const { userSub, userEmail } = req as AuthenticatedRequest;
  const { amount } = req.body;

  if (typeof amount !== 'number' || amount <= 0) {
    res.status(400).json({ error: 'Invalid amount.' });
    return;
  }

  const balance = addCredits(userSub, amount, userEmail);
  res.json({ balance });
});

router.post('/deduct', (req, res: Response) => {
  const { userSub } = req as AuthenticatedRequest;
  const { amount } = req.body;

  if (typeof amount !== 'number' || amount <= 0) {
    res.status(400).json({ error: 'Invalid amount.' });
    return;
  }

  const { ok, balance } = deductCredits(userSub, amount);
  if (!ok) {
    res.status(402).json({ error: 'Insufficient credits.', balance });
    return;
  }

  res.json({ balance });
});

export default router;
