import DOMPurify from 'dompurify';

const ALLOWED_TAGS = [
  'a',
  'b',
  'blockquote',
  'br',
  'caption',
  'col',
  'colgroup',
  'div',
  'em',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'i',
  'img',
  'li',
  'ol',
  'p',
  'small',
  'span',
  'strong',
  'sub',
  'sup',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
  'u',
  'ul',
];

const ALLOWED_ATTR = [
  'alt',
  'aria-label',
  'border',
  'class',
  'colspan',
  'data-full',
  'data-o',
  'data-seg',
  'height',
  'href',
  'loading',
  'rowspan',
  'src',
  'style',
  'title',
  'width',
];

const ALLOWED_STYLE_PROPERTIES = new Set([
  'background-color',
  'border',
  'border-bottom',
  'border-collapse',
  'border-left',
  'border-right',
  'border-top',
  'color',
  'display',
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'height',
  'line-height',
  'margin',
  'margin-bottom',
  'margin-left',
  'margin-right',
  'margin-top',
  'max-width',
  'padding',
  'padding-bottom',
  'padding-left',
  'padding-right',
  'padding-top',
  'text-align',
  'text-decoration',
  'vertical-align',
  'white-space',
  'width',
]);

function stripCodeFences(html: string): string {
  return html.replace(/^```html\n?/, '').replace(/\n?```$/, '');
}

function sanitizeStyleValue(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 160) return null;
  if (/url\s*\(|expression\s*\(|@import|javascript:/i.test(trimmed)) return null;
  return trimmed;
}

function sanitizeInlineStyle(style: string): string {
  return style
    .split(';')
    .map((declaration) => {
      const separator = declaration.indexOf(':');
      if (separator === -1) return '';
      const property = declaration.slice(0, separator).trim().toLowerCase();
      if (!ALLOWED_STYLE_PROPERTIES.has(property)) return '';
      const value = sanitizeStyleValue(declaration.slice(separator + 1));
      return value ? `${property}: ${value}` : '';
    })
    .filter(Boolean)
    .join('; ');
}

function constrainLinks(root: ParentNode): void {
  root.querySelectorAll('a[href]').forEach((anchor) => {
    const href = anchor.getAttribute('href') ?? '';
    if (!/^(https?:|mailto:|#)/i.test(href)) {
      anchor.removeAttribute('href');
      return;
    }
    anchor.setAttribute('rel', 'noopener noreferrer');
    anchor.setAttribute('target', '_blank');
  });
}

function sanitizeInlineStyles(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>('[style]').forEach((element) => {
    const style = sanitizeInlineStyle(element.getAttribute('style') ?? '');
    if (style) {
      element.setAttribute('style', style);
    } else {
      element.removeAttribute('style');
    }
  });
}

export function sanitizePatternHtml(html: string): string {
  if (!html.trim()) return '';

  const sanitized = DOMPurify.sanitize(stripCodeFences(html), {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ADD_DATA_URI_TAGS: ['img'],
    ALLOW_DATA_ATTR: true,
  });

  const template = document.createElement('template');
  template.innerHTML = sanitized;
  sanitizeInlineStyles(template.content);
  constrainLinks(template.content);
  return template.innerHTML;
}

