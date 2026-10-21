import { websiteCopy, type WebsiteLocale } from './websiteLocalization';

/** Exact confirm copy: quoted cost and the balance after the charge. */
export function formatUnlockConfirm(
  cost: number,
  balance: number,
  locale?: WebsiteLocale,
): string {
  return websiteCopy(locale).unlockConfirm.message
    .replace('{cost}', cost.toFixed(1))
    .replace('{balance}', balance.toFixed(1))
    .replace('{after}', (balance - cost).toFixed(1));
}
