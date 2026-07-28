const SITE_ORIGIN = 'https://stitchspeak.com';

type PageMetadata = {
  title: string;
  description: string;
  path: string;
  locale?: 'en' | 'es';
  index?: boolean;
  image?: string;
};

function setMeta(selector: string, attribute: 'name' | 'property', key: string, content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  element.content = content;
}

function setCanonical(href: string) {
  let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement('link');
    canonical.rel = 'canonical';
    document.head.appendChild(canonical);
  }
  canonical.href = href;
}

/** Keep route metadata accurate in this client-routed application. */
export function setPageMetadata({
  title,
  description,
  path,
  locale = 'en',
  index = true,
  image = '/images/stitchspeak-knitting-crochet-pattern-translator.jpg',
}: PageMetadata) {
  const canonicalUrl = new URL(path, SITE_ORIGIN).toString();
  const imageUrl = new URL(image, SITE_ORIGIN).toString();

  document.documentElement.lang = locale;
  document.title = title;
  setCanonical(canonicalUrl);
  setMeta('meta[name="description"]', 'name', 'description', description);
  setMeta('meta[name="robots"]', 'name', 'robots', index ? 'index, follow' : 'noindex, nofollow');
  setMeta('meta[property="og:type"]', 'property', 'og:type', 'website');
  setMeta('meta[property="og:site_name"]', 'property', 'og:site_name', 'StitchSpeak');
  setMeta('meta[property="og:title"]', 'property', 'og:title', title);
  setMeta('meta[property="og:description"]', 'property', 'og:description', description);
  setMeta('meta[property="og:url"]', 'property', 'og:url', canonicalUrl);
  setMeta('meta[property="og:image"]', 'property', 'og:image', imageUrl);
  setMeta('meta[property="og:locale"]', 'property', 'og:locale', locale === 'es' ? 'es_ES' : 'en_GB');
  setMeta('meta[name="twitter:card"]', 'name', 'twitter:card', 'summary_large_image');
  setMeta('meta[name="twitter:title"]', 'name', 'twitter:title', title);
  setMeta('meta[name="twitter:description"]', 'name', 'twitter:description', description);
  setMeta('meta[name="twitter:image"]', 'name', 'twitter:image', imageUrl);
}
