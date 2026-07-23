import crypto from 'node:crypto';
import type { CreditPack } from './pricing.js';

const API_BASE_URL = 'https://api.lemonsqueezy.com/v1';
const CHECKOUTS_API_URL = `${API_BASE_URL}/checkouts`;

interface LemonSqueezyCheckoutResponse {
  data?: {
    attributes?: {
      url?: unknown;
    };
  };
}

interface LemonSqueezyOrderResponse {
  data?: {
    attributes?: {
      urls?: {
        receipt?: unknown;
      };
    };
  };
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} environment variable is not set.`);
  return value;
}

export function isLemonSqueezyConfigured(): boolean {
  return Boolean(
    process.env.LEMON_SQUEEZY_API_KEY?.trim() &&
      process.env.LEMON_SQUEEZY_STORE_ID?.trim() &&
      process.env.LEMON_SQUEEZY_VARIANT_ID?.trim(),
  );
}

export function isLemonSqueezyWebhookConfigured(): boolean {
  return Boolean(process.env.LEMON_SQUEEZY_WEBHOOK_SECRET?.trim());
}

export function getLemonSqueezyVariantId(): string {
  return requiredEnv('LEMON_SQUEEZY_VARIANT_ID');
}

export async function createLemonSqueezyCheckout(params: {
  pack: CreditPack;
  userSub: string;
  userEmail?: string;
  origin: string;
}): Promise<string> {
  const apiKey = requiredEnv('LEMON_SQUEEZY_API_KEY');
  const storeId = requiredEnv('LEMON_SQUEEZY_STORE_ID');
  const variantId = requiredEnv('LEMON_SQUEEZY_VARIANT_ID');

  const response = await fetch(CHECKOUTS_API_URL, {
    method: 'POST',
    signal: AbortSignal.timeout(10_000),
    headers: {
      Accept: 'application/vnd.api+json',
      'Content-Type': 'application/vnd.api+json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      data: {
        type: 'checkouts',
        attributes: {
          custom_price: Math.round(params.pack.price * 100),
          product_options: {
            name: `StitchSpeak - ${params.pack.label}`,
            description: `${params.pack.credits} StitchSpeak credits`,
            redirect_url: `${params.origin}/?checkout=success`,
            receipt_button_text: 'Back to StitchSpeak',
            receipt_link_url: `${params.origin}/?checkout=success`,
            receipt_thank_you_note:
              'Thanks for supporting StitchSpeak. Your credits will be added automatically.',
            enabled_variants: [Number(variantId)],
          },
          checkout_options: {
            embed: false,
            media: false,
            discount: true,
          },
          checkout_data: {
            email: params.userEmail,
            custom: {
              sub: params.userSub,
              packId: params.pack.id,
              credits: String(params.pack.credits),
            },
          },
        },
        relationships: {
          store: {
            data: {
              type: 'stores',
              id: storeId,
            },
          },
          variant: {
            data: {
              type: 'variants',
              id: variantId,
            },
          },
        },
      },
    }),
  });

  const data = (await response.json().catch(() => null)) as LemonSqueezyCheckoutResponse | null;
  if (!response.ok) {
    throw new Error(`Lemon Squeezy checkout failed (${response.status}).`);
  }

  const url = data?.data?.attributes?.url;
  if (typeof url !== 'string' || !url) {
    throw new Error('Lemon Squeezy did not return a checkout URL.');
  }
  return url;
}

export async function getLemonSqueezyOrderReceipt(orderId: string): Promise<string> {
  const apiKey = requiredEnv('LEMON_SQUEEZY_API_KEY');
  const response = await fetch(`${API_BASE_URL}/orders/${encodeURIComponent(orderId)}`, {
    signal: AbortSignal.timeout(10_000),
    headers: {
      Accept: 'application/vnd.api+json',
      Authorization: `Bearer ${apiKey}`,
    },
  });

  const data = (await response.json().catch(() => null)) as LemonSqueezyOrderResponse | null;
  if (!response.ok) {
    throw new Error(`Lemon Squeezy order lookup failed (${response.status}).`);
  }

  const receipt = data?.data?.attributes?.urls?.receipt;
  if (typeof receipt !== 'string' || !receipt) {
    throw new Error('Lemon Squeezy did not return a receipt URL.');
  }

  const parsed = new URL(receipt);
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'app.lemonsqueezy.com') {
    throw new Error('Lemon Squeezy returned an invalid receipt URL.');
  }
  return parsed.toString();
}

export function verifyLemonSqueezySignature(rawBody: Buffer, signatureHeader: unknown): boolean {
  const secret = process.env.LEMON_SQUEEZY_WEBHOOK_SECRET?.trim();
  if (!secret || typeof signatureHeader !== 'string' || !signatureHeader) return false;

  const digest = Buffer.from(
    crypto.createHmac('sha256', secret).update(rawBody).digest('hex'),
    'utf8',
  );
  const signature = Buffer.from(signatureHeader, 'utf8');

  if (digest.length !== signature.length) return false;
  return crypto.timingSafeEqual(digest, signature);
}
