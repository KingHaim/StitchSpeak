import { describe, expect, it } from 'vitest';
import { pageFromPath, pathForPage } from './navigation';

describe('application navigation', () => {
  it('maps durable URLs to app sections', () => {
    expect(pageFromPath('/translate')).toBe('dashboard');
    expect(pageFromPath('/patterns')).toBe('history');
    expect(pageFromPath('/glossary/')).toBe('glossary');
  });

  it('falls back safely for the homepage and unknown paths', () => {
    expect(pageFromPath('/')).toBe('dashboard');
    expect(pageFromPath('/not-a-route')).toBe('dashboard');
  });

  it('provides a canonical URL for every section', () => {
    expect(pathForPage('dashboard')).toBe('/translate');
    expect(pathForPage('history')).toBe('/patterns');
    expect(pathForPage('glossary')).toBe('/glossary');
  });
});
