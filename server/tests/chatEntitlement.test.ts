import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stitchspeak-chat-test-'));
process.env.DATA_DIR = dataDir;

let store: typeof import('../src/services/patternStore');

beforeAll(async () => {
  store = await import('../src/services/patternStore');
});

afterAll(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe('chat entitlement reservation', () => {
  it('atomically stops at the free allowance and reopens after a paid unlock', () => {
    const pattern = store.savePattern('user-1', {
      fileName: 'pattern.pdf',
      targetLanguage: 'Spanish',
      html: '<p>Pattern</p>',
    });

    const first = store.reserveChatMessage('user-1', pattern.id, 'one', 3);
    const second = store.reserveChatMessage('user-1', pattern.id, 'two', 3);
    const third = store.reserveChatMessage('user-1', pattern.id, 'three', 3);
    const blocked = store.reserveChatMessage('user-1', pattern.id, 'four', 3);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(third.ok).toBe(true);
    expect(blocked).toMatchObject({
      ok: false,
      reason: 'allowance_exhausted',
      messageCount: 3,
      maxMessages: 3,
    });

    expect(store.bumpChatAllowance('user-1', pattern.id, 20)).toEqual({ extraAllowance: 20 });
    expect(store.reserveChatMessage('user-1', pattern.id, 'four', 3)).toMatchObject({
      ok: true,
      messageCount: 4,
      maxMessages: 23,
    });
  });

  it('releases a reserved slot when the AI call fails', () => {
    const pattern = store.savePattern('user-2', {
      fileName: 'pattern.pdf',
      targetLanguage: 'German',
      html: '<p>Pattern</p>',
    });

    const reservation = store.reserveChatMessage('user-2', pattern.id, 'question', 1);
    expect(reservation.ok).toBe(true);
    if (!reservation.ok) throw new Error('Expected a reservation');

    store.rollbackChatReservation('user-2', pattern.id, reservation.messageId);
    expect(store.reserveChatMessage('user-2', pattern.id, 'retry', 1)).toMatchObject({
      ok: true,
      messageCount: 1,
      maxMessages: 1,
    });
  });
});
