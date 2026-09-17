import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';

const root = resolve('mobile-www');
const types = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
const server = createServer(async (request, response) => {
  try {
    const path = resolve(root, '.' + new URL(request.url, 'http://localhost').pathname.replace(/\/$/, '/index.html'));
    if (!path.startsWith(root + '/')) throw new Error('Invalid path');
    response.setHeader('Content-Type', types[extname(path)] || 'application/octet-stream');
    response.end(await readFile(path));
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await page.addInitScript(() => {
    localStorage.setItem('ucas-planner-v1-89576', JSON.stringify({ version: 1, activeId: 'saved',
      plans: [{ id: 'saved', name: '原有方案', ids: ['314374'] }], semesterStart: '2026-08-31', week: 8 }));
    window.startupFrames = [];
    const visible = selector => !!document.querySelector(selector)?.checkVisibility();
    const sample = () => {
      window.startupFrames.push({ catalog: visible('#catalog-view'), settings: visible('#semester-form'),
        unreadyHeader: document.body?.dataset.ready !== 'true' && visible('.app-header') });
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  let releaseModule, releaseCatalog, moduleRequested, catalogRequested;
  const moduleGate = new Promise(resolve => { releaseModule = resolve; });
  const catalogGate = new Promise(resolve => { releaseCatalog = resolve; });
  const sawModule = new Promise(resolve => { moduleRequested = resolve; });
  const sawCatalog = new Promise(resolve => { catalogRequested = resolve; });
  await page.route('**/app.mjs?*', async route => { moduleRequested(); await moduleGate; await route.continue(); });
  await page.route('**/data/catalog.json', async route => { catalogRequested(); await catalogGate; await route.continue(); });
  await page.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil: 'commit' });
  await sawModule;
  await page.waitForSelector('#catalog-view', { state: 'attached' });
  assert.equal(await page.locator('#catalog-view').isVisible(), false, 'Initial HTML must not flash the catalog before JavaScript runs');
  releaseModule(); await sawCatalog;
  assert.equal(await page.locator('.app-header').isVisible(), false, 'Do not display empty controls while restoring local data');
  assert.equal(await page.locator('#startup-screen').isVisible(), true);
  releaseCatalog();
  await page.waitForSelector('body[data-ready="true"]');
  assert.equal(await page.locator('#timetable-view').isVisible(), true);
  assert.equal(await page.locator('#plan-select option:checked').textContent(), '原有方案');
  assert.equal(await page.locator('#nav-selected').textContent(), '1');
  assert.equal(await page.locator('#semester-form').count(), 0);
  assert.equal(await page.locator('#startup-screen').isVisible(), false);
  const frames = await page.evaluate(() => window.startupFrames);
  assert.ok(frames.length > 0);
  assert.ok(frames.every(frame => !frame.catalog && !frame.settings && !frame.unreadyHeader), 'Only the restored timetable may be revealed');

  // A failed read must offer recovery, not leave the startup screen stuck forever.
  await page.unroute('**/data/catalog.json');
  await page.route('**/data/catalog.json', route => route.fulfill({ status: 503, body: 'Unavailable' }));
  await page.reload();
  await page.waitForSelector('body[data-ready="error"]', { state: 'attached' });
  assert.equal(await page.locator('#startup-retry').isVisible(), true);
  assert.equal(await page.locator('#catalog-view').isVisible(), false);
  await page.unroute('**/data/catalog.json');
  await page.locator('#startup-retry').click();
  await page.waitForSelector('body[data-ready="true"]');
  assert.equal(await page.locator('#plan-select option:checked').textContent(), '原有方案');
  assert.equal(await page.locator('#nav-selected').textContent(), '1');
  console.log('PASS: no catalog/settings flash before JavaScript or data restoration; saved timetable opens directly; failed startup can retry.');
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
