import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';

const DATA_DIR = process.env.DATA_DIR || path.resolve(process.cwd(), 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'beta-applications.db'));
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS beta_applications (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    instagram_handle TEXT NOT NULL DEFAULT '',
    source_language TEXT NOT NULL DEFAULT '',
    target_language TEXT NOT NULL DEFAULT '',
    pattern_type TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    personal_use_confirmed INTEGER NOT NULL DEFAULT 0,
    promotion_confirmed INTEGER NOT NULL DEFAULT 0,
    audience_size TEXT NOT NULL DEFAULT '',
    content_focus TEXT NOT NULL DEFAULT '',
    pattern_rights_confirmed INTEGER NOT NULL DEFAULT 0,
    pattern_to_translate TEXT NOT NULL DEFAULT '',
    target_language_market TEXT NOT NULL DEFAULT '',
    sales_channels TEXT NOT NULL DEFAULT '',
    promotion_plan TEXT NOT NULL DEFAULT '',
    testing_interest TEXT NOT NULL DEFAULT '',
    utm_source TEXT NOT NULL DEFAULT '',
    utm_medium TEXT NOT NULL DEFAULT '',
    utm_campaign TEXT NOT NULL DEFAULT '',
    utm_content TEXT NOT NULL DEFAULT '',
    utm_term TEXT NOT NULL DEFAULT '',
    landing_page TEXT NOT NULL DEFAULT '',
    referrer TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'new',
    created_at TEXT NOT NULL
  )
`);

const columns = db.prepare('PRAGMA table_info(beta_applications)').all() as { name: string }[];
const columnNames = new Set(columns.map((column) => column.name));
if (!columnNames.has('reviewed_at')) db.exec('ALTER TABLE beta_applications ADD COLUMN reviewed_at TEXT');
if (!columnNames.has('reviewed_by')) db.exec('ALTER TABLE beta_applications ADD COLUMN reviewed_by TEXT');
if (!columnNames.has('instagram_handle')) db.exec("ALTER TABLE beta_applications ADD COLUMN instagram_handle TEXT NOT NULL DEFAULT ''");
if (!columnNames.has('promotion_confirmed')) db.exec('ALTER TABLE beta_applications ADD COLUMN promotion_confirmed INTEGER NOT NULL DEFAULT 0');
if (!columnNames.has('audience_size')) db.exec("ALTER TABLE beta_applications ADD COLUMN audience_size TEXT NOT NULL DEFAULT ''");
if (!columnNames.has('content_focus')) db.exec("ALTER TABLE beta_applications ADD COLUMN content_focus TEXT NOT NULL DEFAULT ''");
if (!columnNames.has('pattern_rights_confirmed')) db.exec('ALTER TABLE beta_applications ADD COLUMN pattern_rights_confirmed INTEGER NOT NULL DEFAULT 0');
if (!columnNames.has('pattern_to_translate')) db.exec("ALTER TABLE beta_applications ADD COLUMN pattern_to_translate TEXT NOT NULL DEFAULT ''");
if (!columnNames.has('target_language_market')) db.exec("ALTER TABLE beta_applications ADD COLUMN target_language_market TEXT NOT NULL DEFAULT ''");
if (!columnNames.has('sales_channels')) db.exec("ALTER TABLE beta_applications ADD COLUMN sales_channels TEXT NOT NULL DEFAULT ''");
if (!columnNames.has('promotion_plan')) db.exec("ALTER TABLE beta_applications ADD COLUMN promotion_plan TEXT NOT NULL DEFAULT ''");
if (!columnNames.has('testing_interest')) db.exec("ALTER TABLE beta_applications ADD COLUMN testing_interest TEXT NOT NULL DEFAULT ''");
if (!columnNames.has('utm_source')) db.exec("ALTER TABLE beta_applications ADD COLUMN utm_source TEXT NOT NULL DEFAULT ''");
if (!columnNames.has('utm_medium')) db.exec("ALTER TABLE beta_applications ADD COLUMN utm_medium TEXT NOT NULL DEFAULT ''");
if (!columnNames.has('utm_campaign')) db.exec("ALTER TABLE beta_applications ADD COLUMN utm_campaign TEXT NOT NULL DEFAULT ''");
if (!columnNames.has('utm_content')) db.exec("ALTER TABLE beta_applications ADD COLUMN utm_content TEXT NOT NULL DEFAULT ''");
if (!columnNames.has('utm_term')) db.exec("ALTER TABLE beta_applications ADD COLUMN utm_term TEXT NOT NULL DEFAULT ''");
if (!columnNames.has('landing_page')) db.exec("ALTER TABLE beta_applications ADD COLUMN landing_page TEXT NOT NULL DEFAULT ''");
if (!columnNames.has('referrer')) db.exec("ALTER TABLE beta_applications ADD COLUMN referrer TEXT NOT NULL DEFAULT ''");

const insertApplication = db.prepare(`
  INSERT INTO beta_applications (
    id, name, email, instagram_handle, source_language, target_language, pattern_type,
    note, personal_use_confirmed, promotion_confirmed, audience_size, content_focus,
    pattern_rights_confirmed, pattern_to_translate, target_language_market, sales_channels,
    promotion_plan, testing_interest, utm_source, utm_medium, utm_campaign, utm_content,
    utm_term, landing_page, referrer, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

export type BetaApplication = {
  name: string;
  email: string;
  instagramHandle: string;
  audienceSize: string;
  contentFocus: string;
  patternRightsConfirmed: boolean;
  patternToTranslate: string;
  targetLanguageMarket: string;
  salesChannels: string;
  promotionPlan: string;
  testingInterest: string;
  promotionConfirmed: boolean;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  utmContent: string;
  utmTerm: string;
  landingPage: string;
  referrer: string;
};

export function createBetaApplication(input: BetaApplication): {
  id: string;
  created: boolean;
} {
  const id = crypto.randomUUID();
  try {
    insertApplication.run(
      id,
      input.name,
      input.email.toLowerCase(),
      input.instagramHandle,
      '',
      '',
      '',
      '',
      0,
      input.promotionConfirmed ? 1 : 0,
      input.audienceSize,
      input.contentFocus,
      input.patternRightsConfirmed ? 1 : 0,
      input.patternToTranslate,
      input.targetLanguageMarket,
      input.salesChannels,
      input.promotionPlan,
      input.testingInterest,
      input.utmSource,
      input.utmMedium,
      input.utmCampaign,
      input.utmContent,
      input.utmTerm,
      input.landingPage,
      input.referrer,
      new Date().toISOString(),
    );
    return { id, created: true };
  } catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
      return { id: '', created: false };
    }
    throw error;
  }
}

export type BetaApplicationStatus = 'new' | 'approved' | 'rejected';

export type BetaApplicationAdmin = BetaApplication & {
  id: string;
  status: BetaApplicationStatus;
  createdAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
};

export function listBetaApplications(status?: BetaApplicationStatus): BetaApplicationAdmin[] {
  const where = status ? 'WHERE status = ?' : '';
  const rows = db.prepare(`
    SELECT id, name, email, instagram_handle instagramHandle, promotion_confirmed promotionConfirmed,
           audience_size audienceSize, content_focus contentFocus, promotion_plan promotionPlan,
           pattern_rights_confirmed patternRightsConfirmed, pattern_to_translate patternToTranslate,
           target_language_market targetLanguageMarket, sales_channels salesChannels,
           testing_interest testingInterest,
           utm_source utmSource, utm_medium utmMedium, utm_campaign utmCampaign,
           utm_content utmContent, utm_term utmTerm, landing_page landingPage, referrer,
           status, created_at createdAt, reviewed_at reviewedAt, reviewed_by reviewedBy
    FROM beta_applications ${where}
    ORDER BY CASE status WHEN 'new' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, created_at DESC
  `).all(...(status ? [status] : [])) as Array<Record<string, unknown>>;

  return rows.map((row) => ({
    ...row,
    patternRightsConfirmed: Boolean(row.patternRightsConfirmed),
    promotionConfirmed: Boolean(row.promotionConfirmed),
  })) as BetaApplicationAdmin[];
}

export function reviewBetaApplication(
  id: string,
  status: Exclude<BetaApplicationStatus, 'new'>,
  reviewedBy: string,
): BetaApplicationAdmin | null {
  const result = db.prepare(`
    UPDATE beta_applications SET status = ?, reviewed_at = ?, reviewed_by = ? WHERE id = ?
  `).run(status, new Date().toISOString(), reviewedBy, id);
  if (result.changes === 0) return null;
  return listBetaApplications().find((application) => application.id === id) ?? null;
}

export function hasActiveBetaAccess(email?: string): boolean {
  if (!email) return false;
  return Boolean(db.prepare(`
    SELECT 1 FROM beta_applications WHERE email = ? COLLATE NOCASE AND status = 'approved' LIMIT 1
  `).get(email.trim()));
}
