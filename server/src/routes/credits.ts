import { Router, type Request, type Response } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import {
  getBalance,
  listPaymentOrders,
  userOwnsPaymentOrder,
} from '../services/creditStore.js';
import { CREDIT_PACKS, getCreditPack } from '../services/pricing.js';
import { hasActiveBetaAccess } from '../services/betaApplicationStore.js';
import {
  createLemonSqueezyCheckout,
  getLemonSqueezyOrderReceipt,
  isLemonSqueezyConfigured,
} from '../services/lemonSqueezy.js';

const router = Router();

router.use(requireAuth);

// Creating a checkout session is cheap but still worth throttling.
const checkoutRateLimit = rateLimit({ windowMs: 60_000, max: 20, name: 'checkout' });
const receiptRateLimit = rateLimit({ windowMs: 60_000, max: 30, name: 'billing-receipt' });

router.get('/', (req, res: Response) => {
  const { userSub, userEmail } = req as AuthenticatedRequest;
  res.json({ balance: getBalance(userSub), betaAccess: hasActiveBetaAccess(userEmail) });
});

// Public catalogue of purchasable credit packs (server is the source of truth).
router.get('/packages', (_req: Request, res: Response) => {
  res.json({ packages: CREDIT_PACKS, paymentsEnabled: isLemonSqueezyConfigured() });
});

router.get('/orders', (req: Request, res: Response) => {
  const { userSub } = req as AuthenticatedRequest;
  res.setHeader('Cache-Control', 'no-store');
  res.json({ orders: listPaymentOrders(userSub) });
});

router.get(
  '/orders/:orderId/receipt',
  receiptRateLimit,
  async (req: Request, res: Response) => {
    const { userSub } = req as AuthenticatedRequest;
    const orderId = typeof req.params.orderId === 'string' ? req.params.orderId : '';
    if (!orderId || !userOwnsPaymentOrder(userSub, orderId)) {
      res.status(404).json({ error: 'Invoice not found.' });
      return;
    }

    try {
      const receiptUrl = await getLemonSqueezyOrderReceipt(orderId);
      res.setHeader('Cache-Control', 'no-store');
      res.redirect(receiptUrl);
    } catch (err) {
      console.error('[credits/receipt] Lemon Squeezy error:', err);
      res.status(502).json({ error: 'Could not open this invoice. Please try again.' });
    }
  },
);

/**
 * Start a Lemon Squeezy checkout for a credit pack. Credits are NOT granted
 * here — they are only added by the signature-verified webhook after Lemon Squeezy
 * confirms payment. This is what closes the "free credits" hole: the client can
 * no longer add to its own balance.
 */
router.post('/checkout', checkoutRateLimit, async (req: Request, res: Response) => {
  const { userSub, userEmail } = req as AuthenticatedRequest;
  if (!isLemonSqueezyConfigured()) {
    res.status(503).json({ error: 'Payments are not configured.' });
    return;
  }

  const packId = typeof req.body?.packId === 'string' ? req.body.packId : '';
  const pack = getCreditPack(packId);
  if (!pack) {
    res.status(400).json({ error: 'Unknown credit pack.' });
    return;
  }

  const origin = req.headers.origin || process.env.FRONTEND_URL?.split(',')[0] || '';

  try {
    const url = await createLemonSqueezyCheckout({
      pack,
      userSub,
      userEmail,
      origin,
    });
    res.json({ url });
  } catch (err) {
    console.error('[credits/checkout] Lemon Squeezy error:', err);
    res.status(502).json({ error: 'Could not start checkout. Please try again.' });
  }
});

export default router;
