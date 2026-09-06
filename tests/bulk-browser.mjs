import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
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
await new Promise(done => server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  await mkdir('outputs', { recursive: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, timezoneId: 'Asia/Shanghai' });
  const errors = [], external = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    if (!route.request().url().startsWith(base)) { external.push(route.request().url()); return route.abort(); }
    return route.continue();
  });
  await page.clock.install({ time: new Date('2026-09-14T12:00:00+08:00') });
  await page.addInitScript(() => {
    const key = 'ucas-planner-v1-89576';
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ version: 1, semesterStart: '2026-08-31', week: 3, activeId: 'test', plans: [{ id: 'test', name: '方案一', ids: ['314374'] }] }));
  });
  const state = () => page.evaluate(() => JSON.parse(localStorage.getItem('ucas-planner-v1-89576')));
  const selectedIds = async () => { const saved = await state(); return saved.plans.find(plan => plan.id === saved.activeId).ids; };
  const enter = async () => { await page.locator('#add-courses').click(); assert.ok(await page.locator('#catalog-search').isVisible()); await page.locator('#catalog-bulk-tab').click(); };
  const match = async (text, checkPosition = false) => {
    await page.locator('#bulk-codes').fill(text);
    if (checkPosition) await page.evaluate(() => scrollTo(0, 0));
    const before = await page.evaluate(() => scrollY);
    await page.locator('#bulk-match').click();
    if (checkPosition) {
      await page.evaluate(() => new Promise(done => requestAnimationFrame(done)));
      assert.equal(await page.evaluate(() => scrollY), before, 'Matching must not scroll to the results');
    }
  };
  await page.goto(base);
  await page.waitForSelector('body[data-ready="true"]');
  await enter();
  await page.locator('#bulk-match').click();
  assert.match(await page.locator('#bulk-error').innerText(), /请输入课程编码/);
  await match('180080025200m3001h，180080070100M1001H\n180080070100M1003H;180080070100M1001H\tNOT-A-CODE', true);
  assert.equal(await page.locator('#bulk-choice-314374').isDisabled(), true);
  assert.equal(await page.locator('#bulk-choice-314431').isChecked(), true);
  assert.equal(await page.locator('#bulk-choice-314438').isChecked(), true);
  assert.match(await page.locator('#bulk-summary').innerText(), /4 个编码 · 2 门待添加 · 1 个未找到/);
  assert.match(await page.locator('#bulk-duplicates').innerText(), /1 个重复编码/);
  await page.locator('#bulk-choice-314438').uncheck();
  assert.match(await page.locator('#bulk-add-label').innerText(), /添加 1 门到方案一/);
  assert.deepEqual(await selectedIds(), ['314374']);
  for (const width of [360, 390, 412, 844]) {
    await page.setViewportSize({ width, height: width === 844 ? 390 : 844 });
    await page.evaluate(() => scrollTo(0, 0));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: `outputs/bulk-review-${width}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    document.documentElement.style.setProperty('--safe-area-inset-top', '34px');
    document.documentElement.style.setProperty('--safe-area-inset-bottom', '24px');
    document.getElementById('bulk-review').scrollIntoView({ block: 'start' });
  });
  const addBounds = await page.locator('#bulk-add').boundingBox();
  assert.ok(addBounds.y + addBounds.height <= 844 - 24);
  await page.screenshot({ path: 'outputs/bulk-review-safe-area.png' });
  await page.evaluate(() => {
    document.documentElement.style.removeProperty('--safe-area-inset-top');
    document.documentElement.style.removeProperty('--safe-area-inset-bottom');
  });
  await page.locator('#bulk-add').click();
  assert.equal(await page.locator('body').getAttribute('data-view'), 'timetable');
  assert.deepEqual(await selectedIds(), ['314374', '314431']);
  assert.ok(await page.locator('[data-detail="314431"].schedule-event').count() > 0);
  await page.reload(); await page.waitForSelector('body[data-ready="true"]');
  assert.deepEqual(await selectedIds(), ['314374', '314431']);

  await enter();
  await match('180081070200P1001H-1 180081070200P1001H-2');
  assert.equal(await page.locator('#bulk-results input').count(), 2);
  assert.ok(await page.locator('#bulk-choice-315721').isChecked());
  assert.match(await page.locator('#bulk-results').innerText(), /同一课程有其他班级/);
  await page.locator('#bulk-add').click();
  assert.match(await page.locator('.modal-message').innerText(), /时间冲突/);
  assert.match(await page.locator('.modal-message').innerText(), /不同记录或班级/);
  await page.locator('#confirm-form [data-close]').click();
  assert.deepEqual(await selectedIds(), ['314374', '314431']);
  assert.ok(await page.locator('#bulk-choice-315721').isChecked());
  await page.locator('#bulk-add').click();
  await page.locator('#confirm-form button[type="submit"]').click();
  assert.equal((await selectedIds()).length, 4);
  assert.equal(await page.locator('body').getAttribute('data-view'), 'timetable');

  await enter();
  await match('380308050200DB001');
  assert.equal(await page.locator('#bulk-results input').count(), 2);
  assert.equal(await page.locator('#bulk-results input:checked').count(), 0);
  assert.ok(await page.locator('#bulk-add').isDisabled());
  await page.locator('#bulk-choice-318692').check();
  assert.match(await page.locator('#bulk-add-label').innerText(), /添加 1 门/);
  await page.evaluate(() => document.getElementById('bulk-review').scrollIntoView({ block: 'start' }));
  await page.screenshot({ path: 'outputs/bulk-ambiguous.png' });
  await page.locator('#bulk-add').click();
  if (await page.locator('#modal').isVisible()) await page.locator('#confirm-form button[type="submit"]').click();
  assert.ok((await selectedIds()).includes('318692'));
  assert.ok(!(await selectedIds()).includes('318691'));

  await enter();
  await match('180089050200MB001H-201');
  await page.locator('#bulk-add').click();
  assert.match(await page.locator('.modal-message').innerText(), /时间未完整公布/);
  await page.locator('#confirm-form button[type="submit"]').click();
  assert.ok((await selectedIds()).includes('316122'));

  await enter();
  await match('180080070100M1003H');
  await page.locator('#bulk-codes').fill('NOT-FOUND');
  assert.ok(await page.locator('#bulk-footer').isHidden());
  await page.locator('#bulk-match').click();
  assert.ok(await page.locator('#bulk-add').isDisabled());
  await match('<img/src=x/onerror=alert(1)>');
  assert.equal(await page.locator('#bulk-results img').count(), 0);
  await match('180080070100M1003H');
  await page.locator('#plan-menu summary').click();
  await page.locator('#new-plan').click();
  await page.locator('#modal-input').fill('另一个方案');
  await page.locator('#confirm-form button[type="submit"]').click();
  assert.match(await page.locator('#bulk-error').innerText(), /方案已切换/);
  assert.ok(await page.locator('#bulk-footer').isHidden());
  assert.deepEqual(await selectedIds(), []);
  await page.locator('#bulk-match').click();
  assert.match(await page.locator('#bulk-add-label').innerText(), /另一个方案/);
  await page.locator('#bulk-clear').click();
  assert.equal(await page.locator('#bulk-codes').inputValue(), '');
  assert.ok(await page.locator('#bulk-footer').isHidden());

  const catalog = JSON.parse(await readFile('mobile-www/data/catalog.json', 'utf8')).courses;
  const { conflicts } = await import('../src/logic.mjs');
  const pair = catalog.find(course => course.id !== '314374' && conflicts(course, [catalog.find(c => c.id === '314374')]).length);
  await match(`180080025200M3001H\n${pair.code}`);
  await page.locator('#bulk-add').click();
  assert.match(await page.locator('.modal-message').innerText(), /时间冲突/);
  assert.deepEqual(await selectedIds(), []);
  await page.locator('#confirm-form button[type="submit"]').click();
  assert.equal((await selectedIds()).length, 2);
  await enter();
  await match(Array.from({ length: 301 }, (_, i) => `CODE${i}`).join('\n'));
  assert.match(await page.locator('#bulk-error').innerText(), /300/);

  await page.evaluate(ids => {
    const key = 'ucas-planner-v1-89576', saved = JSON.parse(localStorage.getItem(key));
    saved.plans.find(plan => plan.id === saved.activeId).ids = ids;
    localStorage.setItem(key, JSON.stringify(saved));
  }, catalog.slice(0, 300).map(course => course.id));
  await page.reload(); await page.waitForSelector('body[data-ready="true"]'); await enter();
  await match(catalog[300].code);
  for (const checkbox of await page.locator('#bulk-results input:not(:disabled)').all()) await checkbox.check();
  assert.ok(await page.locator('#bulk-add').isDisabled());
  assert.match(await page.locator('#bulk-limit').innerText(), /超过 300/);
  assert.equal((await selectedIds()).length, 300);
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  console.log('PASS: offline batch matching, duplicates, ambiguity, conflicts, cancellation, plan isolation, persistence, escaping, limits and mobile layouts.');
} finally { await browser.close(); server.close(); }
