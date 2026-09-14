import { expect, test, type Page } from '@playwright/test';

function emailSessionToken(): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
    iss: 'stitchspeak',
    sub: 'email:e2e-user',
    email: 'maker@example.com',
    name: 'Test Maker',
    exp: Math.floor(Date.now() / 1000) + 3600,
  })}.e2e-signature`;
}

async function mockAccountApi(page: Page): Promise<void> {
  await page.route('**/api/auth/login', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        token: emailSessionToken(),
        user: { sub: 'email:e2e-user', email: 'maker@example.com', name: 'Test Maker' },
      }),
    });
  });
  await page.route('**/api/credits', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ balance: 24, betaAccess: false }),
    });
  });
  await page.route('**/api/patterns', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ patterns: [] }),
    });
  });
}

async function signIn(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByLabel('Email').fill('maker@example.com');
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: 'Sign in with email' }).click();
  await expect(page).toHaveURL(/\/translate$/);
}

test('mobile user can sign in and navigate the primary workspace', async ({ page }) => {
  await mockAccountApi(page);
  await signIn(page);
  await expect(page.getByRole('heading', { name: 'Pattern Translator' })).toBeVisible();

  await page.getByRole('button', { name: 'Patterns', exact: true }).click();
  await expect(page).toHaveURL(/\/patterns$/);
  await expect(page.getByRole('heading', { name: 'Your Tactile Collection' })).toBeVisible();

  await page.getByRole('button', { name: 'Glossary', exact: true }).click();
  await expect(page).toHaveURL(/\/glossary$/);
  await expect(page.getByRole('heading', { name: 'Knitting & Crochet Glossary' })).toBeVisible();
});

test('signed-in user can upload a pattern and review its translation estimate', async ({ page }) => {
  await mockAccountApi(page);
  await signIn(page);

  await page.locator('#file-upload').setInputFiles({
    name: 'weekend-scarf.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Cast on 24 stitches. Knit every row until the scarf measures 120 cm.'),
  });

  const dialog = page.getByRole('dialog', { name: 'Select translation language' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('weekend-scarf.txt')).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Translation estimate' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: /Start translation/ })).toBeDisabled();
  await dialog.getByRole('checkbox').check();
  await expect(dialog.getByRole('button', { name: /Start translation/ })).toBeEnabled();
});

test('translation happy path surfaces review mismatches and exports cleanly', async ({ page }) => {
  const translatedHtml =
    '<h1 data-seg="1" data-o="Bufanda de fin de semana">Weekend Scarf</h1>' +
    '<p data-seg="2" data-o="Montar 24 puntos.">Cast on 24 stitches.</p>' +
    '<p data-seg="3" data-o="Tejer hasta 120 cm y cerrar.">Knit until 120 cm, then cast off loosely.</p>';

  await mockAccountApi(page);
  // Deterministic translation result: aligned HTML plus one residual
  // segment-level number mismatch, one document-level glossary variant mix,
  // and one already-resolved number restore (older saved patterns still carry
  // these) that must stay OFF the loud review strip.
  await page.route('**/api/translate', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        html: translatedHtml,
        usage: null,
        cost: 1,
        balance: 23,
        reviewWarnings: [
          {
            code: 'NUMBER_RESTORED',
            sourceId: 'seg-3',
            message: 'In "Tejer hasta 120 cm y cerrar.": restored numbers [110] → [120] to match the source.',
          },
          {
            code: 'NUMBER_UNRESTORABLE',
            sourceId: 'seg-2',
            message:
              'In "Montar 24 puntos.": the translated numbers [24, 2] do not match the source numbers [24] and could not be restored automatically — check this section against the original pattern.',
          },
          {
            code: 'GLOSSARY_VARIANT_MIX',
            message:
              'The English translation mixes "bind off" and "cast off" — pick one regional variant family (US or UK) and use it consistently.',
          },
        ],
      }),
    });
  });
  // Registered after mockAccountApi so this handler wins: saving the pattern
  // POSTs to the same /api/patterns endpoint the dashboard lists from.
  await page.route('**/api/patterns', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          pattern: {
            id: 'pat-e2e-1',
            timestamp: Date.now(),
            fileName: 'bufanda.txt',
            fileType: 'text/plain',
            sourceLanguage: 'Spanish',
            targetLanguage: 'English',
            pdfMetrics: null,
            cost: 1,
            reviewWarnings: [],
            hasSource: false,
          },
        }),
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ patterns: [] }) });
  });
  await page.route('**/api/patterns/*/source', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });
  await page.route('**/api/chat/start', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sessionId: 'chat-e2e-1' }) });
  });

  await signIn(page);

  // Upload → estimate → confirm.
  await page.locator('#file-upload').setInputFiles({
    name: 'bufanda.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Montar 24 puntos. Tejer hasta 120 cm y cerrar.'),
  });
  const dialog = page.getByRole('dialog', { name: 'Select translation language' });
  await expect(dialog.getByRole('heading', { name: 'Translation estimate' })).toBeVisible();
  await dialog.getByRole('checkbox').check();
  await dialog.getByRole('button', { name: /Start translation/ }).click();

  // Bilingual review: only residual mismatches surface in-context — the
  // already-resolved number restore is quiet (2 loud items, not 3).
  const reviewStrip = page.getByTestId('bilingual-review-strip');
  await expect(reviewStrip).toBeVisible();
  await expect(reviewStrip.getByText('2 automated checks flagged items for review')).toBeVisible();
  await expect(reviewStrip.getByText(/mixes "bind off" and "cast off"/)).toBeVisible();
  await expect(reviewStrip.getByText(/restored numbers/)).toHaveCount(0);

  // The flagged segment is marked in the panes, and clicking the warning
  // jumps to (activates) that block. The restored (quiet) segment is not
  // flagged at all.
  await expect(page.locator('.bilingual-pane [data-seg="2"].seg-flagged').first()).toBeAttached();
  await expect(page.locator('.bilingual-pane [data-seg="3"].seg-flagged')).toHaveCount(0);
  await reviewStrip.getByRole('button', { name: /could not be restored automatically/ }).click();
  await expect(page.locator('.bilingual-pane [data-seg="2"].seg-active').first()).toBeAttached();

  // Automated-draft ≠ published tech edit disclaimer is visible on the review
  // surface. Patterns locked this copy verbatim (source of truth:
  // components/AiTechEditNotice.tsx) — do not edit the string.
  const notice = page.getByTestId('ai-tech-edit-notice');
  await expect(notice).toBeVisible();
  await expect(notice).toContainText(
    'This is an automated draft translation, not a published tech edit. Number and glossary checks are automated — have a human tech editor review the pattern before publication.',
  );

  // Export completes the happy path.
  await page.getByRole('button', { name: 'Export this file' }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Text (.txt)' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.txt$/);
});

test('beta form requires the participation agreement before submitting', async ({ page }) => {
  let submissions = 0;
  await page.route('**/api/beta-applications', async (route) => {
    submissions += 1;
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ ok: true, applicationId: 'e2e', message: 'Received.' }) });
  });
  await page.goto('/beta');

  await page.getByLabel('Name').fill('Jaime');
  await page.getByLabel('Email').fill('jaime@example.com');
  await page.getByLabel('Instagram handle').fill('@haimganancia');
  await page.locator('#beta-form').getByRole('button', { name: 'Apply for beta access' }).click();

  const agreement = page.getByLabel(/Beta participation agreement/);
  await expect(agreement).toHaveJSProperty('validity.valueMissing', true);
  await expect(page.getByText('Your application is in review.')).not.toBeVisible();
  expect(submissions).toBe(0);
});

test('beta form submits UTM attribution automatically', async ({ page }) => {
  let payload: Record<string, unknown> | null = null;
  await page.route('**/api/beta-applications', async (route) => {
    payload = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ ok: true, applicationId: 'e2e', message: 'Received.' }) });
  });
  await page.goto('/beta?utm_source=instagram&utm_medium=dm&utm_campaign=designer-beta-2026&utm_content=designer-outreach&utm_term=personalized-dm');

  await page.getByLabel('Name').fill('Jaime');
  await page.getByLabel('Email').fill('jaime@example.com');
  await page.getByLabel('Instagram handle').fill('@haimganancia');
  await page.getByLabel(/Beta participation agreement/).check();
  await page.locator('#beta-form').getByRole('button', { name: 'Apply for beta access' }).click();

  await expect(page.getByText('Your application is in review.')).toBeVisible();
  const submitted = payload as unknown as { attribution: { landingPage?: string } & Record<string, string> };
  expect(submitted.attribution).toMatchObject({
    utmSource: 'instagram',
    utmMedium: 'dm',
    utmCampaign: 'designer-beta-2026',
    utmContent: 'designer-outreach',
    utmTerm: 'personalized-dm',
  });
  expect(submitted.attribution.landingPage).toContain('/beta?utm_source=instagram');
});
