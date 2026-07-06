import type { PageId } from '../types';

export const PAGE_PATHS: Record<PageId, string> = {
  dashboard: '/translate',
  history: '/patterns',
  glossary: '/glossary',
};

export function pageFromPath(pathname: string): PageId {
  switch (pathname.replace(/\/+$/, '') || '/') {
    case '/patterns':
      return 'history';
    case '/glossary':
      return 'glossary';
    case '/translate':
    case '/':
    default:
      return 'dashboard';
  }
}

export function pathForPage(page: PageId): string {
  return PAGE_PATHS[page];
}
