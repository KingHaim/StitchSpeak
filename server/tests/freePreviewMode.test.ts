import { afterEach, describe, expect, it } from 'vitest';
import { canOfferFreePreview, getFreePreviewMode } from '../src/services/freePreviewMode';
import {
  createTranslationStreamToken,
  verifyTranslationStreamToken,
} from '../src/services/translationStreamToken';

const originalMode = process.env.FREE_PREVIEW_MODE;
const originalAdmins = process.env.ADMIN_EMAILS;

afterEach(() => {
  if (originalMode === undefined) delete process.env.FREE_PREVIEW_MODE;
  else process.env.FREE_PREVIEW_MODE = originalMode;
  if (originalAdmins === undefined) delete process.env.ADMIN_EMAILS;
  else process.env.ADMIN_EMAILS = originalAdmins;
});

const regular = {
  userSub: 'user-regular',
  userEmail: 'maker@example.com',
  identityProvider: 'email' as const,
  emailVerified: false,
};

const admin = {
  userSub: 'user-admin',
  userEmail: 'owner@example.com',
  identityProvider: 'google' as const,
  emailVerified: true,
};

describe('FREE_PREVIEW_MODE', () => {
  it('defaults to off, including empty and unknown values', () => {
    delete process.env.FREE_PREVIEW_MODE;
    expect(getFreePreviewMode()).toBe('off');
    process.env.FREE_PREVIEW_MODE = '';
    expect(getFreePreviewMode()).toBe('off');
    process.env.FREE_PREVIEW_MODE = 'yes';
    expect(getFreePreviewMode()).toBe('off');
    process.env.FREE_PREVIEW_MODE = 'OFF';
    expect(getFreePreviewMode()).toBe('off');
  });

  it('reads on and admins case-insensitively', () => {
    process.env.FREE_PREVIEW_MODE = 'ON';
    expect(getFreePreviewMode()).toBe('on');
    process.env.FREE_PREVIEW_MODE = 'Admins';
    expect(getFreePreviewMode()).toBe('admins');
  });

  it('off never offers preview, even to admins or a stream token', () => {
    process.env.FREE_PREVIEW_MODE = 'off';
    process.env.ADMIN_EMAILS = 'owner@example.com';
    expect(canOfferFreePreview(regular)).toBe(false);
    expect(canOfferFreePreview(admin)).toBe(false);
    expect(canOfferFreePreview({ ...admin, freePreviewEligibleFromToken: true })).toBe(false);
  });

  it('on offers preview to every signed-in identity', () => {
    process.env.FREE_PREVIEW_MODE = 'on';
    expect(canOfferFreePreview(regular)).toBe(true);
    expect(canOfferFreePreview({ userSub: 'anon' })).toBe(true);
  });

  it('admins offers preview only to verified Google ADMIN_EMAILS (or a token minted for them)', () => {
    process.env.FREE_PREVIEW_MODE = 'admins';
    process.env.ADMIN_EMAILS = 'owner@example.com';
    expect(canOfferFreePreview(regular)).toBe(false);
    expect(canOfferFreePreview({
      ...admin,
      identityProvider: 'email',
    })).toBe(false);
    expect(canOfferFreePreview({
      ...admin,
      userEmail: 'other@example.com',
    })).toBe(false);
    expect(canOfferFreePreview(admin)).toBe(true);
    expect(canOfferFreePreview({
      userSub: 'stream-admin',
      identityProvider: 'google',
      emailVerified: false,
      freePreviewEligibleFromToken: true,
    })).toBe(true);
  });

  it('stream tokens carry preview eligibility without exposing it when false', () => {
    const eligible = createTranslationStreamToken('user-admin', 'google', Date.now(), true);
    const plain = createTranslationStreamToken('user-regular', 'email');
    expect(verifyTranslationStreamToken(eligible)?.previewEligible).toBe(true);
    expect(verifyTranslationStreamToken(plain)?.previewEligible).toBe(false);
  });
});
