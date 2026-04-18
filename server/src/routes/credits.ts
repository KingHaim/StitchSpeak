import { Router, type Response, type Request } from 'express';
import Stripe from 'stripe';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import {
  getBalance,
  addCredits,
  deductCredits,
} from '../services/creditStore.js';
import {
  createCreditCheckoutSession,
  getStripe,
  getStripeWebhookSecret,
} from '../services/stripe.js';
import type { CreditPackage } from '../types/credits.js';

const router = Router();

router.post('/webhook', expressRawBody, async (req: Request, res: Response) => {
  let event: Stripe.Event;

  try {
    const signature = req.headers['stripe-signature'];
    if (!signature || Array.isArray(signature)) {
      res.status(400).json({ error: 'Missing Stripe signature.' });
      return;
    }

    event = getStripe().webhooks.constructEvent(req.body, signature, getStripeWebhookSecret());
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid Stripe webhook signature.';
    res.status(400).json({ error: message });
    return;
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const credits = parseFloat(session.metadata?.credits || '0');
    const userSub = session.metadata?.userSub;
    const userEmail = session.metadata?.userEmail || undefined;

    if (userSub && Number.isFinite(credits) && credits > 0) {
      addCredits(userSub, credits, userEmail);
    }
  }

  res.json({ received: true });
});

router.use(requireAuth);

router.get('/', (req, res: Response) => {
  const { userSub } = req as AuthenticatedRequest;
  const balance = getBalance(userSub);
  res.json({ balance });
});

router.post('/checkout', async (req, res: Response) => {
  const { userSub, userEmail } = req as AuthenticatedRequest;
  const { credits, price } = req.body as Partial<CreditPackage>;

  if (typeof credits !== 'number' || credits <= 0 || typeof price !== 'number' || price <= 0) {
    res.status(400).json({ error: 'Invalid credit package.' });
    return;
  }

  try {
    const checkoutUrl = await createCreditCheckoutSession({
      pack: { credits, price },
      userSub,
      userEmail,
    });
    res.json({ checkoutUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create checkout session.';
    res.status(500).json({ error: message });
  }
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

function expressRawBody(req: Request, res: Response, next: (err?: unknown) => void): void {
  let data = Buffer.alloc(0);

  req.on('data', (chunk) => {
    data = Buffer.concat([data, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)]);
  });

  req.on('end', () => {
    req.body = data;
    next();
  });

  req.on('error', next);
}

export default router;
