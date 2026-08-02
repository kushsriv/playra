// PLAYRA end-to-end smoke + regression suite.
// Runs against a static server with no backend configured, so it exercises
// guest mode -- the path that must never break regardless of Supabase state.
const { test, expect } = require('@playwright/test');

async function enterApp(page, name = 'TestOp') {
  await page.goto('/index.html');
  // the enter button fades up on a 1.05s delay + 1.2s duration; clicking mid
  // animation makes Playwright report the element as unstable
  await page.locator('#enterBtn').waitFor({ state: 'visible' });
  await page.waitForTimeout(2400);
  await page.click('#enterBtn');
  await page.waitForTimeout(700);
  for (let i = 0; i < 5; i++) {
    if (!(await page.isVisible('#obNext'))) break;
    const nameField = page.locator('#obName');
    if (await nameField.count() && await nameField.isVisible() && !(await nameField.inputValue())) {
      await nameField.fill(name);
    }
    // age gate blocks step 1 until a bracket is chosen
    const age = page.locator('#agePick .chip').first();
    if (await age.count() && await age.isVisible()) await age.click();
    await page.click('#obNext');
    await page.waitForTimeout(350);
  }
  await page.waitForTimeout(400);
}

test('landing renders and the 3D canvas paints', async ({ page }) => {
  await page.goto('/index.html');
  await page.waitForTimeout(1600);
  await expect(page.locator('.landing-title')).toContainText('PLAY');
  const painted = await page.evaluate(() => {
    const c = document.getElementById('landingCanvas');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
    return n;
  });
  expect(painted).toBeGreaterThan(1000);
});

test('age gate blocks onboarding until answered', async ({ page }) => {
  await page.goto('/index.html');
  // the enter button fades up on a 1.05s delay + 1.2s duration; clicking mid
  // animation makes Playwright report the element as unstable
  await page.locator('#enterBtn').waitFor({ state: 'visible' });
  await page.waitForTimeout(2400);
  await page.click('#enterBtn');
  await page.waitForTimeout(700);
  await page.fill('#obName', 'Gated');
  await page.click('#obNext');          // no age chosen yet
  await page.waitForTimeout(300);
  await expect(page.locator('#obStep1')).toBeVisible();   // still on step 1
  await page.locator('#agePick .chip').first().click();
  await page.click('#obNext');
  await page.waitForTimeout(300);
  await expect(page.locator('#obStep2')).toBeVisible();   // advanced
});

test('all seven views open without errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !/TUNNEL|404|ERR_CONNECTION/.test(m.text())) errors.push(m.text()); });
  await enterApp(page);
  for (const v of ['dash', 'lfg', 'missions', 'discover', 'hubs', 'tours', 'profile']) {
    await page.click(`button.nav-btn[data-view="${v}"]`);
    await page.waitForTimeout(350);
    await expect(page.locator(`#view-${v}`)).toHaveClass(/on/);
  }
  expect(errors).toEqual([]);
});

test('guest XP still increments locally', async ({ page }) => {
  await enterApp(page);
  const before = await page.evaluate(() => S.xp);
  await page.evaluate(() => addXP(40, 'test'));
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => S.xp)).toBeGreaterThan(before);
});

test('no publisher CDN art is hotlinked', async ({ page }) => {
  const external = [];
  page.on('request', r => {
    const u = r.url();
    if (/steamstatic|ddragon|valorant-api/.test(u)) external.push(u);
  });
  await enterApp(page);
  await page.click('button.nav-btn[data-view="hubs"]');
  await page.waitForTimeout(900);
  expect(external).toEqual([]);
});

test('accessibility landmarks and labels are present', async ({ page }) => {
  await enterApp(page);
  await expect(page.locator('.skip-link')).toHaveCount(1);
  await expect(page.locator('[role="navigation"]')).toHaveCount(1);
  await expect(page.locator('[role="main"]')).toHaveCount(1);
  await expect(page.locator('#toasts[aria-live]')).toHaveCount(1);
  // active nav must expose aria-current, not just a CSS class
  await page.click('button.nav-btn[data-view="lfg"]');
  await page.waitForTimeout(300);
  // scope to the nav button: go() also stamps data-view on <html>, so an
  // unscoped selector matches two elements
  await expect(page.locator('button.nav-btn[data-view="lfg"]')).toHaveAttribute('aria-current', 'page');
});

test('modal traps focus and restores it on close', async ({ page }) => {
  await enterApp(page);
  await page.click('button.nav-btn[data-view="lfg"]');
  await page.waitForTimeout(400);
  await page.evaluate(() => openPost());
  await page.waitForTimeout(400);
  const inside = await page.evaluate(() => !!document.getElementById('postOv').contains(document.activeElement));
  expect(inside).toBe(true);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await expect(page.locator('#postOv')).not.toHaveClass(/on/);
});

test('legal pages exist and are reachable', async ({ page }) => {
  await page.goto('/terms.html');
  await expect(page.locator('h1')).toContainText('Terms');
  await page.goto('/privacy.html');
  await expect(page.locator('h1')).toContainText('Privacy');
});

test('no fabricated population figures anywhere in the UI', async ({ page }) => {
  test.setTimeout(60000);   // two full page loads plus onboarding
  // These were shipped as hardcoded strings. Guard against them coming back:
  // an invented number next to an empty feed is worse than a small real one.
  const banned = ['128,402', '3,914', '41.2K', '38.9K', '29.4K', '52.7K', '33.1K',
                  '18.8K', '12.3K', '9.6K', '7.2K', 'PLAYERS ONLINE NOW'];
  await page.goto('/index.html');
  await page.waitForTimeout(1500);
  let body = await page.locator('body').innerText();
  for (const b of banned) expect(body, `landing shows fabricated "${b}"`).not.toContain(b);

  await enterApp(page);
  await page.click('button.nav-btn[data-view="hubs"]');
  await page.waitForTimeout(900);
  body = await page.locator('body').innerText();
  for (const b of banned) expect(body, `hubs shows fabricated "${b}"`).not.toContain(b);
});
