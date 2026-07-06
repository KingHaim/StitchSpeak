import { Router } from 'express';
import { authenticateEmailAccount, createEmailAccount, signEmailSession } from '../services/emailAuth.js';

const router = Router();
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post('/register', async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const name = typeof req.body?.name === 'string' ? req.body.name : undefined;
  if (!EMAIL_PATTERN.test(email) || email.length > 254) return void res.status(400).json({ error: 'Enter a valid email address.' });
  if (password.length < 10 || password.length > 128) return void res.status(400).json({ error: 'Password must be between 10 and 128 characters.' });
  try {
    const user = await createEmailAccount(email, password, name);
    res.status(201).json({ token: signEmailSession(user), user });
  } catch (err) {
    if (err instanceof Error && err.message === 'EMAIL_EXISTS') return void res.status(409).json({ error: 'An account with this email already exists.' });
    throw err;
  }
});

router.post('/login', async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const user = await authenticateEmailAccount(email, password);
  if (!user) return void res.status(401).json({ error: 'Email or password is incorrect.' });
  res.json({ token: signEmailSession(user), user });
});

export default router;
