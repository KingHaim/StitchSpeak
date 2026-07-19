import type { PageId } from '../types';

export const PAGE_PATHS: Record<PageId, string> = {
  dashboard: '/translate',
  history: '/patterns',
  glossary: '/glossary',
  settings: '/settings',
};

export function pageFromPath(pathname: string): PageId {
  switch (pathname.replace(/\/+$/, '') || '/') {
    case '/patterns':
      return 'history';
    case '/glossary':
      return 'glossary';
    case '/settings':
      return 'settings';
    case '/translate':
    case '/':
    default:
      return 'dashboard';
  }
}

export function pathForPage(page: PageId): string {
  return PAGE_PATHS[page];
}
