import { test, expect } from '@playwright/test';

test('separate portal popup waits through busy frames and displays the authenticated browser', async ({ page, context }) => {
  await context.route('**/api/me', route => route.fulfill({ json: { user: { id: 'popup-operator' }, workerRuntime: 'hosted' } }));
  await context.route('**/api/jobs/popup-fixture', route => route.fulfill({ json: { job: { id: 'popup-fixture', status: 'awaiting_otp', stage: 'Portal opened' } } }));
  let frames = 0, ready = false;
  await context.route('**/api/jobs/popup-fixture/browser/frame', route => {
    frames++;
    return !ready ? route.fulfill({ status: 204 }) : route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1ZkAAAAASUVORK5CYII=', 'base64') });
  });
  await page.goto('/portal-browser');
  const popupEvent = page.waitForEvent('popup');
  await page.evaluate(() => window.open('/portal-browser/popup-fixture', 'portal-test', 'popup,width=1000,height=800'));
  const popup = await popupEvent;
  await expect(popup.getByRole('heading', { name: 'CPCB portal browser' })).toBeVisible();
  await expect(popup.getByRole('status')).toContainText('Opening CPCB portal');
  ready = true;
  await expect(popup.getByAltText('Live private portal browser')).toBeVisible({ timeout: 12000 });
  expect(frames).toBeGreaterThanOrEqual(2);
  await expect(page.getByAltText('Live private portal browser')).toHaveCount(0);
  await popup.close();
});
