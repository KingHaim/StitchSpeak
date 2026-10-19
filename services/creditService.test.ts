import { describe, expect, it } from 'vitest';
import { parseFreePreviewMode } from './creditService';

describe('parseFreePreviewMode', () => {
  it('only accepts the server modes and never invents on', () => {
    expect(parseFreePreviewMode('off')).toBe('off');
    expect(parseFreePreviewMode('admins')).toBe('admins');
    expect(parseFreePreviewMode('on')).toBe('on');
    expect(parseFreePreviewMode(undefined)).toBe('off');
    expect(parseFreePreviewMode(true)).toBe('off');
    expect(parseFreePreviewMode('ON')).toBe('off');
    expect(parseFreePreviewMode('yes')).toBe('off');
  });
});
