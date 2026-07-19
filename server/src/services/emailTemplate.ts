/**
 * Shared HTML email layout for StitchSpeak transactional mail.
 * Table-based + inline styles for broad client compatibility.
 */

export function appUrl(): string {
  return (process.env.APP_URL || process.env.FRONTEND_URL?.split(',')[0] || 'http://localhost:5173').replace(/\/$/, '');
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const COLORS = {
  background: '#fef9f1',
  surface: '#ffffff',
  primary: '#50604a',
  onPrimary: '#ffffff',
  onSurface: '#1d1c17',
  muted: '#444841',
  outline: '#c4c8be',
  brandBar: '#697962',
} as const;

export type EmailCta = {
  label: string;
  href: string;
};

export type EmailTemplateOptions = {
  /** Visible heading inside the card */
  heading: string;
  /** Optional inbox preview text */
  preheader?: string;
  /** Main HTML body (already escaped where needed) */
  bodyHtml: string;
  /** Primary call-to-action button */
  cta?: EmailCta;
  /** Small muted lines under the CTA / body */
  footnotes?: string[];
};

export function emailButton(cta: EmailCta): string {
  const href = escapeHtml(cta.href);
  const label = escapeHtml(cta.label);
  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 8px;">
  <tr>
    <td align="center" bgcolor="${COLORS.primary}" style="border-radius:8px;background-color:${COLORS.primary};">
      <a href="${href}" target="_blank" rel="noopener noreferrer"
        style="display:inline-block;padding:14px 28px;font-family:Georgia,'Times New Roman',serif;font-size:16px;line-height:1.2;font-weight:600;color:${COLORS.onPrimary};text-decoration:none;border-radius:8px;">
        ${label}
      </a>
    </td>
  </tr>
</table>`.trim();
}

export function renderEmailHtml(options: EmailTemplateOptions): string {
  const base = appUrl();
  const logoUrl = `${base}/logo-optimized.png`;
  const preheader = options.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${COLORS.background};opacity:0;">${escapeHtml(options.preheader)}</div>`
    : '';
  const ctaHtml = options.cta ? emailButton(options.cta) : '';
  const footnotesHtml = (options.footnotes ?? [])
    .map(
      (note) =>
        `<p style="margin:16px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;line-height:1.5;color:${COLORS.muted};">${note}</p>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<title>${escapeHtml(options.heading)}</title>
</head>
<body style="margin:0;padding:0;background-color:${COLORS.background};">
${preheader}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${COLORS.background};">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background-color:${COLORS.surface};border:1px solid ${COLORS.outline};border-radius:12px;overflow:hidden;">
        <tr>
          <td style="height:6px;background-color:${COLORS.brandBar};font-size:0;line-height:0;">&nbsp;</td>
        </tr>
        <tr>
          <td style="padding:28px 32px 8px;text-align:center;">
            <a href="${escapeHtml(base)}" target="_blank" rel="noopener noreferrer" style="text-decoration:none;color:${COLORS.onSurface};">
              <img src="${escapeHtml(logoUrl)}" width="48" height="48" alt="StitchSpeak" style="display:block;margin:0 auto 12px;border:0;width:48px;height:48px;">
              <span style="font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:700;letter-spacing:-0.02em;color:${COLORS.onSurface};">StitchSpeak</span>
            </a>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px 32px;">
            <h1 style="margin:0 0 16px;font-family:Georgia,'Times New Roman',serif;font-size:24px;line-height:1.3;font-weight:700;color:${COLORS.onSurface};">${escapeHtml(options.heading)}</h1>
            <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6;color:${COLORS.onSurface};">
              ${options.bodyHtml}
            </div>
            ${ctaHtml}
            ${footnotesHtml}
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px;border-top:1px solid ${COLORS.outline};background-color:${COLORS.background};">
            <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:${COLORS.muted};text-align:center;">
              Pattern translation for makers &middot; <a href="${escapeHtml(base)}" style="color:${COLORS.primary};text-decoration:underline;">stitchspeak.com</a>
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

/** Strip tags for a plain-text fallback. */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/h1>/gi, '\n\n')
    .replace(/<\/ol>/gi, '\n')
    .replace(/<\/ul>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href: string, label: string) => {
      const text = label.replace(/<[^>]+>/g, '').trim();
      return text && text !== href ? `${text} (${href})` : href;
    })
    .replace(/<[^>]+>/g, '')
    .replace(/&middot;/g, '·')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function paragraph(text: string): string {
  return `<p style="margin:0 0 16px;">${text}</p>`;
}

export function orderedList(items: string[]): string {
  const lis = items
    .map((item) => `<li style="margin:0 0 10px;">${item}</li>`)
    .join('');
  return `<ol style="margin:0 0 16px;padding-left:1.25em;">${lis}</ol>`;
}
