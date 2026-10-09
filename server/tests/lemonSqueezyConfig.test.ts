import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createLemonSqueezyCheckout,
  isLemonSqueezyConfigured,
  isLemonSqueezyWebhookConfigured,
  missingLemonSqueezyConfig,
} from '../src/services/lemonSqueezy';
import { CREDIT_PACKS } from '../src/services/pricing';

const original = {
  apiKey: process.env.LEMON_SQUEEZY_API_KEY,
  storeId: process.env.LEMON_SQUEEZY_STORE_ID,
  variantId: process.env.LEMON_SQUEEZY_VARIANT_ID,
  webhookSecret: process.env.LEMON_SQUEEZY_WEBHOOK_SECRET,
};

afterEach(() => {
  const restore = (name: keyof typeof original, env: string) => {
    if (original[name] === undefined) delete process.env[env];
    else process.env[env] = original[name];
  };
  restore('apiKey', 'LEMON_SQUEEZY_API_KEY');
  restore('storeId', 'LEMON_SQUEEZY_STORE_ID');
  restore('variantId', 'LEMON_SQUEEZY_VARIANT_ID');
  restore('webhookSecret', 'LEMON_SQUEEZY_WEBHOOK_SECRET');
  vi.unstubAllGlobals();
});

describe('Lemon Squeezy checkout configuration', () => {
  it('refuses checkout when the webhook secret is missing', () => {
    process.env.LEMON_SQUEEZY_API_KEY = 'key';
    process.env.LEMON_SQUEEZY_STORE_ID = '1';
    process.env.LEMON_SQUEEZY_VARIANT_ID = '2';
    delete process.env.LEMON_SQUEEZY_WEBHOOK_SECRET;

    expect(isLemonSqueezyWebhookConfigured()).toBe(false);
    expect(isLemonSqueezyConfigured()).toBe(false);
    expect(missingLemonSqueezyConfig()).toContain('LEMON_SQUEEZY_WEBHOOK_SECRET');
  });

  it('is configured only when API, store, variant, and webhook secret are present', () => {
    process.env.LEMON_SQUEEZY_API_KEY = 'key';
    process.env.LEMON_SQUEEZY_STORE_ID = '1';
    process.env.LEMON_SQUEEZY_VARIANT_ID = '2';
    process.env.LEMON_SQUEEZY_WEBHOOK_SECRET = 'secret';
    expect(isLemonSqueezyConfigured()).toBe(true);
  });

  it('keeps discount codes enabled on hosted checkout', async () => {
    process.env.LEMON_SQUEEZY_API_KEY = 'key';
    process.env.LEMON_SQUEEZY_STORE_ID = '1';
    process.env.LEMON_SQUEEZY_VARIANT_ID = '2';
    process.env.LEMON_SQUEEZY_WEBHOOK_SECRET = 'secret';

    let body: { data?: { attributes?: { checkout_options?: { discount?: boolean } } } } | undefined;
    vi.stubGlobal('fetch', (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).toContain('https://api.lemonsqueezy.com/v1/checkouts');
      body = JSON.parse(String(init?.body)) as typeof body;
      return Promise.resolve(
        new Response(JSON.stringify({ data: { attributes: { url: 'https://checkout.lemonsqueezy.com/buy/test' } } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });

    const pack = CREDIT_PACKS[0];
    const url = await createLemonSqueezyCheckout({
      pack,
      userSub: 'user-1',
      userEmail: 'buyer@example.com',
      origin: 'https://stitchspeak.com',
    });
    expect(url).toContain('checkout.lemonsqueezy.com');
    expect(body?.data?.attributes?.checkout_options?.discount).toBe(true);
  });
});
