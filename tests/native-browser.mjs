import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';

const root = resolve('mobile-www');
const types = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
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
try {
  await mkdir('outputs', { recursive: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, timezoneId: 'Asia/Shanghai' });
  const page = await context.newPage();
  await page.clock.install({ time: new Date('2026-09-20T12:00:00+08:00') });
  const errors = [], forbiddenRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    const url = route.request().url();
    if (!url.startsWith(base) || url.includes('/api/')) { forbiddenRequests.push(url); return route.abort(); }
    return route.continue();
  });
  await page.goto(base);
  await page.waitForSelector('body[data-ready="true"]');
  assert.ok(await page.locator('#semester-form').isVisible());
  await page.locator('#semester-start').fill('2026-09-07');
  await page.locator('#semester-form button[type="submit"]').click();
  assert.equal(await page.locator('#week option[value="0"]').count(), 0);
  assert.equal(await page.locator('#week option').count(), 22);
  assert.equal(await page.locator('#week').inputValue(), '2');
  assert.match(await page.locator('#semester-status').innerText(), /当前第 2 周/);
  assert.equal(await page.locator('body').getAttribute('data-view'), 'timetable');
  assert.ok(await page.locator('body').evaluate(e => e.classList.contains('native-app')));
  assert.equal(await page.locator('.app-header nav').isVisible(), false);
  assert.equal(await page.locator('#catalog-view').isVisible(), false);
  await page.locator('#add-courses').click();
  assert.ok(await page.locator('#catalog-view').isVisible());
  assert.equal(await page.locator('#timetable-view').isVisible(), false);
  await page.locator('#search').fill('180080025200M3001H');
  await page.locator('#course-rows [data-toggle="314374"]').click();
  await page.screenshot({ path: 'outputs/android-add-course.png' });
  await page.locator('#mobile-back').click();
  await page.locator('#week').selectOption('2');
  assert.equal(await page.locator('#timetable .schedule-event').count(), 2);
  await page.locator('#week-next').click();
  assert.equal(await page.locator('#timetable .schedule-event').count(), 3);
  await page.reload();
  await page.waitForSelector('body[data-ready="true"]');
  assert.equal(await page.locator('#semester-form').count(), 0);
  assert.equal(await page.locator('#week').inputValue(), '2');
  assert.equal(await page.locator('#timetable .schedule-event').count(), 2);
  await page.locator('#week').selectOption('22');
  assert.ok(await page.locator('#week-next').isDisabled());
  await page.locator('#week-today').click();
  assert.equal(await page.locator('#week').inputValue(), '2');
  await page.clock.setSystemTime(new Date('2026-09-21T00:01:00+08:00'));
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  assert.equal(await page.locator('#week').inputValue(), '3');
  assert.match(await page.locator('.schedule-header.is-today').innerText(), /9\/21/);
  for (const [date, expectedWeek, status] of [['2026-10-05', '1', '尚未开学'], ['2026-01-05', '22', '本学期已结束'], ['2026-09-07', '3', '当前第 3 周']]) {
    await page.locator('#plan-menu summary').click();
    await page.locator('#semester-settings').click();
    await page.locator('#semester-start').fill(date);
    await page.locator('#semester-form button[type="submit"]').click();
    assert.equal(await page.locator('#week').inputValue(), expectedWeek);
    assert.equal(await page.locator('#semester-status').innerText(), status);
  }
  await page.locator('#plan-menu summary').click();
  await page.locator('[data-command="export-html"]').click();
  assert.equal(await page.locator('#export-week option').count(), 22);
  assert.equal(await page.locator('#export-week option[value="22"]').count(), 1);
  await page.locator('[data-close]').first().click();
  await page.locator('#timetable .schedule-event').first().click();
  await page.locator('[data-detail-tab="syllabus"]').click();
  await page.waitForFunction(() => document.getElementById('detail-syllabus').textContent.includes('教学目的要求'));
  await page.locator('[data-close]').click();
  for (const width of [360, 390, 412, 844]) {
    await page.setViewportSize({ width, height: width === 844 ? 390 : 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Overflow at ${width}px`);
    const overlaps = await page.locator('.header-actions').evaluate(el => el.getBoundingClientRect().left < document.querySelector('.brand-group').getBoundingClientRect().right);
    assert.equal(overlaps, false, `Header overlap at ${width}px`);
    assert.ok(await page.locator('#timetable').evaluate(el => el.getBoundingClientRect().height > 600));
    await page.screenshot({ path: `outputs/android-timetable-${width}.png`, fullPage: true });
  }
  await page.clock.setSystemTime(new Date('2026-09-28T00:01:00+08:00'));
  await page.clock.runFor(30001);
  assert.equal(await page.locator('#week').inputValue(), '4');
  // An existing 1.0 plan has no semester date and may have saved all-semester mode.
  await page.evaluate(() => {
    const key = 'ucas-planner-v1-89576';
    const saved = JSON.parse(localStorage.getItem(key));
    delete saved.semesterStart;
    saved.week = 0;
    localStorage.setItem(key, JSON.stringify(saved));
  });
  await page.reload();
  await page.waitForSelector('body[data-ready="true"]');
  assert.ok(await page.locator('#semester-form').isVisible());
  await page.locator('#semester-start').fill('2026-09-07');
  await page.locator('#semester-form button[type="submit"]').click();
  assert.equal(await page.locator('#week').inputValue(), '4');
  assert.equal(await page.locator('#timetable .schedule-event').count(), 2);
  assert.deepEqual(forbiddenRequests, []);
  assert.deepEqual(errors, []);
  console.log('PASS: Android timetable homepage, no all-semester mode, semester date settings, automatic week on launch/resume, Monday boundary, before/after semester, current-week action, all 22 export weeks, offline enrollment/syllabus and 360/390/412/844px layout. Native file picker requires device verification.');
} finally {
  await browser.close();
  server.close();
}
