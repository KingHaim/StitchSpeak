import { describe, expect, it } from 'vitest';
import {
  describeActivityEvent,
  describeLedgerEntry,
  friendlyPageName,
} from '../src/services/activityHumanizer';
import type { ActivityEvent } from '../src/services/posthogActivity';

const event = (name: string, props: ActivityEvent['props'] = {}, path: string | null = null): ActivityEvent => ({
  event: name,
  timestamp: '2026-07-21T09:00:00Z',
  path,
  detail: null,
  props,
});

describe('activity humanizer', () => {
  it('describes credit movements in plain language', () => {
    expect(
      describeLedgerEntry({ id: 1, delta: -3, balanceAfter: 7, kind: 'charge:translation', reference: 'abc', createdAt: 0 }),
    ).toBe('Paid 3 credits for a translation');
    expect(
      describeLedgerEntry({ id: 2, delta: 3, balanceAfter: 10, kind: 'refund:translation', reference: 'abc', createdAt: 0 }),
    ).toBe("Got 3 credits back — a translation didn't finish");
    expect(
      describeLedgerEntry({ id: 3, delta: 50, balanceAfter: 60, kind: 'purchase', reference: 'order-9', createdAt: 0 }),
    ).toBe('Bought a credit pack (+50 credits)');
    expect(
      describeLedgerEntry({ id: 4, delta: 5, balanceAfter: 65, kind: 'admin-adjustment', reference: 'goodwill (by a@b.c)', createdAt: 0 }),
    ).toBe('The team added 5 credits — goodwill (by a@b.c)');
  });

  it('describes product events in plain language', () => {
    expect(describeActivityEvent(event('$pageview', {}, '/translate'))).toBe('Opened the Translate page');
    expect(describeActivityEvent(event('translation_started', { target_language: 'French' }))).toBe(
      'Started translating a pattern into French',
    );
    expect(describeActivityEvent(event('translation_failed', { error: 'timeout' }))).toBe(
      'A translation failed — "timeout"',
    );
    expect(describeActivityEvent(event('chat_unlock_purchased', { messages: 10 }))).toBe(
      'Unlocked 10 extra chat messages',
    );
    // Unknown events fall back to a readable version of the raw name.
    expect(describeActivityEvent(event('some_new_event'))).toBe('Some new event');
  });

  it('maps routes to page names', () => {
    expect(friendlyPageName('/patterns')).toBe('My Patterns');
    expect(friendlyPageName('/')).toBe('Home');
    expect(friendlyPageName('/unknown-route')).toBe('/unknown-route page');
    expect(friendlyPageName(null)).toBe('Unknown page');
  });
});
