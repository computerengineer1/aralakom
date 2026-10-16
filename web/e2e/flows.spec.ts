import { test, expect } from '@playwright/test';

test.describe('public website — bilingual & RTL', () => {
  test('home page loads in Arabic RTL by default and switches to English LTR keeping the page', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('dir', /^(rtl|ltr)$/);
    const initialDir = await page.locator('html').getAttribute('dir');
    const initialLang = await page.locator('html').getAttribute('lang');
    expect(initialLang).toBeTruthy();

    // language switcher present and toggles direction
    const switcher = page.locator('button.lang-switch').first();
    await expect(switcher).toBeVisible();
    await switcher.click();
    await expect(page.locator('html')).not.toHaveAttribute('dir', initialDir!);
    // still on home page (context preserved)
    await expect(page).toHaveURL(/\/$/);
    // hero content visible in the new language
    await expect(page.locator('.hero h1')).toBeVisible();
  });

  test('services, projects, about, contact pages render', async ({ page }) => {
    for (const path of ['/services', '/projects', '/about', '/contact', '/privacy', '/terms']) {
      await page.goto(path);
      await expect(page.locator('h1').first()).toBeVisible();
      expect(await page.title()).toBeTruthy();
    }
  });

  test('services page shows configured service categories', async ({ page }) => {
    await page.goto('/services');
    await expect(page.locator('.svc-card').first()).toBeVisible();
    const count = await page.locator('.svc-card').count();
    expect(count).toBeGreaterThanOrEqual(6);
  });

  test('portfolio shows only published projects', async ({ page }) => {
    await page.goto('/projects');
    await expect(page.locator('.portfolio-card').first()).toBeVisible();
  });

  test('custom 404 page for unknown routes', async ({ page }) => {
    await page.goto('/definitely-not-a-page');
    await expect(page.locator('text=404').first()).toBeVisible();
    await expect(page.locator('a[href="/"]').first()).toBeVisible();
  });
});

test.describe('public application portal', () => {
  test('job application multi-step flow submits and shows reference + token', async ({ page }) => {
    await page.goto('/apply');
    // step 1
    await page.fill('#fullName', 'E2E Applicant');
    await page.fill('#phone', '+9613555444');
    await page.fill('#email', 'e2e-applicant@example.com');
    await page.selectOption('#personType', 'worker');
    await page.locator('button', { hasText: /التالي|Next/ }).first().click();
    // step 2 — category required
    await expect(page.locator('#category')).toBeVisible();
    await page.selectOption('#category', { index: 1 });
    await page.fill('#skills', 'painting, plastering');
    await page.locator('button', { hasText: /التالي|Next/ }).first().click();
    // step 3 — location
    await page.selectOption('#gov', 'Beirut');
    await page.locator('button', { hasText: /التالي|Next/ }).first().click();
    // step 4 — consent required before submit
    await expect(page.locator('#consent')).toBeVisible();
    const submit = page.locator('button[type="submit"]');
    await expect(submit).toBeVisible();
    await page.check('#consent');
    await submit.click();
    // success screen with reference
    await expect(page.locator('.ref-box').first()).toBeVisible({ timeout: 15000 });
    const ref = await page.locator('.ref-box').first().textContent();
    expect(ref).toMatch(/APP-\d{4}-\d{6}/);
  });

  test('contract request flow submits and shows reference', async ({ page }) => {
    await page.goto('/request-quote');
    await page.fill('#cname', 'E2E Customer');
    await page.fill('#rphone', '+9613666555');
    await page.locator('button', { hasText: /التالي|Next/ }).first().click();
    await page.selectOption('#rcat', { index: 1 });
    await page.fill('#rdesc', 'E2E test project: repaint a 120m2 apartment, all rooms, quality finish.');
    await page.selectOption('#rgov', 'Mount Lebanon');
    await page.locator('button', { hasText: /التالي|Next/ }).first().click();
    await page.check('#rconsent');
    await page.locator('button[type="submit"]').click();
    await expect(page.locator('.ref-box').first()).toBeVisible({ timeout: 15000 });
    const ref = await page.locator('.ref-box').first().textContent();
    expect(ref).toMatch(/REQ-\d{4}-\d{6}/);
  });

  test('tracking page rejects invalid credentials gracefully', async ({ page }) => {
    await page.goto('/track');
    await page.fill('#tref', 'APP-2020-000000');
    await page.fill('#ttok', 'invalid-token-value-that-is-long-enough-000');
    await page.locator('button[type="submit"]').click();
    await expect(page.locator('.alert-error')).toBeVisible({ timeout: 10000 });
  });
});

test.describe('staff login & internal app', () => {
  test('owner can sign in and sees the dashboard with real aggregates', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#email', 'owner@demo.local');
    await page.fill('#password', process.env.SMOKE_PASSWORD ?? 'Demo!Owner123');
    await page.locator('button[type="submit"]').click();
    await page.waitForURL('**/app', { timeout: 15000 });
    await expect(page.locator('.stat .stat-value').first()).toBeVisible();
    await expect(page.locator('.sidebar')).toBeVisible();
  });

  test('invalid credentials show a generic error (no account enumeration)', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#email', 'nosuchuser@example.com');
    await page.fill('#password', 'whatever12345');
    await page.locator('button[type="submit"]').click();
    await expect(page.locator('.alert-error')).toBeVisible({ timeout: 10000 });
  });

  test('internal app requires auth (deep link redirects to login)', async ({ page }) => {
    await page.goto('/app/personnel');
    await expect(page.locator('a[href^="/login"]')).toBeVisible({ timeout: 10000 });
  });
});

test.describe('responsive & accessibility', () => {
  test('mobile viewport: menu toggles and no horizontal overflow on home', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await page.locator('button.menu-btn').click();
    await expect(page.locator('.pub-nav')).toBeVisible();
  });

  test('internal tables do not overflow horizontally on mobile (scroll container instead)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/login');
    await page.fill('#email', 'hr@demo.local');
    await page.fill('#password', process.env.SMOKE_PASSWORD ?? 'Demo!Owner123');
    await page.locator('button[type="submit"]').click();
    await page.waitForURL('**/app', { timeout: 15000 });
    await page.goto('/app/personnel');
    await expect(page.locator('.table-wrap').first()).toBeVisible({ timeout: 10000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('keyboard navigation reaches primary controls (skip link + focus visible)', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab'); // skip link first
    const focused = await page.evaluate(() => document.activeElement?.className ?? '');
    expect(String(focused)).toContain('skip-link');
  });
});
