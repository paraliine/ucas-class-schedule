import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';

// Accept extracted APK assets as well as the prepared app directory.
const root = resolve(process.argv[2] || 'mobile-www');
const catalog = JSON.parse(await readFile(resolve(root, 'data/catalog.json'), 'utf8'));
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
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
// DOMContentLoaded is intentionally held; document.fonts.ready would wait on it.
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1';
const gate = () => { let release; const promise = new Promise(resolve => { release = resolve; }); return { promise, release }; };
const frames = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
try {
  await mkdir('outputs', { recursive: true });
  for (const saved of [true, false]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, timezoneId: 'Asia/Shanghai' });
    try {
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(({ saved, termId, courseId }) => {
        if (saved) localStorage.setItem(`ucas-planner-v1-${termId}`, JSON.stringify({
          version: 1, plans: [{ id: 'existing', name: '我的方案', ids: [courseId] }], activeId: 'existing', week: 2, semesterStart: '2026-08-31',
        }));
        window.startupFrames = [];
        window.recordStartup = true;
        const visible = selector => [...document.querySelectorAll(selector)].some(el => el.getClientRects().length && getComputedStyle(el).visibility === 'visible');
        const sample = () => {
          if (!window.recordStartup) return;
          if (document.body) window.startupFrames.push({
            catalog: visible('#catalog-view'), selected: visible('#selected-view'),
            earlyDialog: document.body.dataset.ready !== 'true' && visible('dialog[open]'),
            overlay: visible('#startup-screen'),
          });
          requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      }, { saved, termId: catalog.meta.termId, courseId: catalog.courses[0].id });
      const script = gate(), data = gate(), scriptRequested = gate(), dataRequested = gate();
      await page.route('**/app.mjs*', async route => { scriptRequested.release(); await script.promise; await route.continue(); });
      await page.route('**/data/catalog.json', async route => { dataRequested.release(); await data.promise; await route.continue(); });
      await page.goto(base, { waitUntil: 'commit' });
      await scriptRequested.promise;
      await page.waitForSelector('#catalog-view', { state: 'attached' });
      await page.waitForFunction(() => document.styleSheets.length >= 5);
      await frames(page);
      await page.screenshot({ path: `outputs/startup-${saved ? 'saved' : 'new'}-before-script.png` });
      assert.equal(await page.locator('#catalog-view').isVisible(), false, 'Catalog must be hidden before app JavaScript executes');
      assert.equal(await page.locator('#timetable-view').isVisible(), true, 'The initial document must show the timetable');
      assert.equal(await page.locator('#mobile-back').isVisible(), false);
      script.release();
      await dataRequested.promise;
      await frames(page);
      await page.screenshot({ path: `outputs/startup-${saved ? 'saved' : 'new'}-before-data.png` });
      assert.equal(await page.locator('#catalog-view').isVisible(), false, 'Catalog must stay hidden while the database is pending');
      assert.equal(await page.locator('dialog[open]').count(), 0, 'No settings dialog before restoring the saved plan');
      assert.equal(await page.locator('#startup-screen').count(), 0, 'Do not add a loading overlay');
      assert.equal(await page.locator('#week option[value="0"]').count(), 0, 'No all-semester placeholder during Android startup');
      data.release();
      await page.waitForSelector('body[data-ready="true"]');
      await frames(page);
      const recorded = await page.evaluate(() => { window.recordStartup = false; return window.startupFrames; });
      assert.ok(recorded.length > 0);
      assert.equal(recorded.some(frame => Object.values(frame).some(Boolean)), false, 'A non-home screen was visible in a startup frame');
      if (saved) {
        assert.equal(await page.locator('dialog[open]').count(), 0);
        assert.match(await page.locator('#plan-select-trigger').innerText(), /我的方案/);
      } else {
        assert.equal(await page.locator('#semester-form').isVisible(), true, 'First install still asks for the semester date after initialization');
        await page.locator('#modal [data-close]').first().click();
      }
      await page.locator('#add-courses').click();
      assert.equal(await page.locator('#catalog-view').isVisible(), true, 'Catalog must still open through +');
      await page.locator('#mobile-back').click();
      assert.equal(await page.locator('#catalog-view').isVisible(), false);
      assert.equal(await page.locator('#timetable-view').isVisible(), true);
      assert.deepEqual(errors, []);
      console.log(`PASS: ${saved ? 'saved plan' : 'first install'} startup, before JS, before data, every sampled frame, + and back.`);
    } finally { await context.close(); }
  }
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  try {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/data/catalog.json', route => route.fulfill({ status: 503, body: 'Unavailable' }));
    await page.goto(base);
    await page.locator('#retry-catalog').waitFor();
    assert.equal(await page.locator('#catalog-view').isVisible(), false, 'A failed load must not expose the catalog');
    assert.match(await page.locator('#timetable-status').innerText(), /课程加载失败/);
    await page.unroute('**/data/catalog.json');
    await page.locator('#retry-catalog').click();
    await page.waitForSelector('body[data-ready="true"]');
    assert.equal(await page.locator('#retry-catalog').count(), 0);
    assert.equal(await page.locator('#catalog-view').isVisible(), false);
    assert.equal(await page.locator('#semester-form').isVisible(), true);
    assert.deepEqual(errors, []);
    console.log('PASS: failed offline data load stays on the timetable and retry recovers.');
  } finally { await context.close(); }
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
