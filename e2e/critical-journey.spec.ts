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
