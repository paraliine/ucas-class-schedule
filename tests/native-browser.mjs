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
  const choose = async (id, value) => {
    await page.locator(`#${id}-trigger`).click();
    await page.locator('#control-picker').locator(`[data-value="${value}"]`).click();
  };
  const chooseDate = async date => {
    const [year, month] = date.split('-').map(Number);
    await page.locator('#semester-start').click();
    await page.locator('#calendar-year').click();
    await page.locator(`#control-picker [data-value="${year}"]`).click();
    await page.locator('#calendar-month').click();
    await page.locator(`#control-picker [data-value="${month - 1}"]`).click();
    await page.locator(`#control-picker [data-date="${date}"]`).click();
  };
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
  await page.locator('#semester-start').click();
  await page.screenshot({ path: 'outputs/android-date-picker.png' });
  await page.keyboard.press('Escape');
  assert.ok(await page.locator('#semester-form').isVisible());
  await chooseDate('2026-09-07');
  await page.locator('#semester-form button[type="submit"]').click();
  assert.equal(await page.locator('#week option[value="0"]').count(), 0);
  assert.equal(await page.locator('#week option').count(), 22);
  assert.equal(await page.locator('#week').inputValue(), '2');
  assert.match(await page.locator('#semester-status').innerText(), /当前第 2 周/);
  assert.equal(await page.locator('select:visible, input[type="date"]:visible').count(), 0);
  await page.locator('#week-trigger').click();
  assert.equal(await page.locator('#control-picker [role="option"]').count(), 22);
  assert.equal(await page.locator('#control-picker [aria-selected="true"]').getAttribute('data-value'), '2');
  await page.screenshot({ path: 'outputs/android-week-picker.png' });
  await page.keyboard.press('Escape');
  assert.ok(await page.locator('#week-trigger').evaluate(el => el === document.activeElement));
  assert.equal(await page.locator('body').getAttribute('data-view'), 'timetable');
  assert.ok(await page.locator('body').evaluate(e => e.classList.contains('native-app')));
  assert.equal(await page.locator('.app-header nav').isVisible(), false);
  assert.equal(await page.locator('#catalog-view').isVisible(), false);
  await page.locator('#add-courses').click();
  assert.ok(await page.locator('#catalog-view').isVisible());
  assert.equal(await page.locator('#timetable-view').isVisible(), false);
  await choose('campus', '玉泉路');
  assert.ok((await page.locator('#course-rows tr td:nth-child(2)').allTextContents()).every(text => text.includes('玉泉路')));
  await choose('campus', '');
  await page.locator('#academy-trigger').click();
  await page.locator('#picker-search').fill('数学');
  await page.screenshot({ path: 'outputs/android-filter-picker.png' });
  await page.locator('#control-picker [data-value="数学科学学院"]').click();
  await choose('attribute', '专业课');
  await choose('day', '2');
  await choose('sort', 'credits-desc');
  assert.match(await page.locator('#sort-trigger').innerText(), /学分从高到低/);
  await page.locator('#noConflict').check();
  assert.equal(await page.locator('#noConflict').evaluate(el => getComputedStyle(el).appearance), 'none');
  await page.locator('#reset-filters').click();
  assert.match(await page.locator('#academy-trigger').innerText(), /全部院系/);
  await choose('sort', 'default');
  await page.locator('#search').fill('180080025200M3001H');
  await page.locator('#course-rows [data-toggle="314374"]').click();
  await page.screenshot({ path: 'outputs/android-add-course.png' });
  await page.locator('#mobile-back').click();
  await choose('week', '2');
  assert.equal(await page.locator('#timetable .schedule-event').count(), 2);
  assert.equal(await page.locator('.schedule-label').count(), 13);
  assert.match(await page.locator('.schedule-label').first().innerText(), /08:30\s+09:15/);
  assert.match(await page.locator('.schedule-label').last().innerText(), /21:05\s+21:50/);
  await page.locator('#week-next').tap();
  await page.waitForFunction(() => !document.getElementById('week-next').matches(':active'), null, { timeout: 2000 });
  assert.equal(await page.locator('#week-next').evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)');
  await page.locator('#week-prev').tap();
  await page.waitForFunction(() => !document.getElementById('week-prev').matches(':active'), null, { timeout: 2000 });
  assert.equal(await page.locator('#week-prev').evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)');
  await page.locator('#week-next').tap();
  assert.equal(await page.locator('#timetable .schedule-event').count(), 3);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));
    delete document.hidden;
  });
  assert.equal(await page.locator('#week').inputValue(), '3');
  assert.equal(await page.locator('#timetable .schedule-event').count(), 3);
  await page.reload();
  await page.waitForSelector('body[data-ready="true"]');
  assert.equal(await page.locator('#semester-form').count(), 0);
  assert.equal(await page.locator('#week').inputValue(), '2');
  assert.equal(await page.locator('#timetable .schedule-event').count(), 2);
  await choose('week', '22');
  assert.ok(await page.locator('#week-next').isDisabled());
  await page.locator('#week-today').click();
  assert.equal(await page.locator('#week').inputValue(), '2');
  await page.clock.setSystemTime(new Date('2026-09-21T00:01:00+08:00'));
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  assert.equal(await page.locator('#week').inputValue(), '2');
  assert.equal(await page.locator('#semester-status').innerText(), '当前第 3 周');
  assert.equal(await page.locator('.schedule-header.is-today').count(), 0);
  await page.locator('#week-today').click();
  assert.equal(await page.locator('#week').inputValue(), '3');
  assert.match(await page.locator('.schedule-header.is-today').innerText(), /9\/21/);
  for (const [date, expectedWeek, status] of [['2026-10-05', '1', '尚未开学'], ['2026-01-05', '22', '本学期已结束'], ['2026-09-07', '3', '当前第 3 周']]) {
    await page.locator('#plan-menu summary').click();
    await page.locator('#semester-settings').click();
    await chooseDate(date);
    await page.locator('#semester-form button[type="submit"]').click();
    assert.equal(await page.locator('#week').inputValue(), expectedWeek);
    assert.equal(await page.locator('#semester-status').innerText(), status);
  }
  await page.locator('#plan-menu summary').click();
  await page.locator('[data-command="export-html"]').click();
  assert.equal(await page.locator('#export-week option').count(), 22);
  assert.equal(await page.locator('#export-week option[value="22"]').count(), 1);
  await choose('export-week', '22');
  assert.ok(await page.locator('#export-html-form').isVisible());
  assert.match(await page.locator('#export-week-trigger').innerText(), /22/);
  await page.locator('[data-close]').first().click();
  await page.locator('#timetable .schedule-event').first().click();
  assert.match(await page.locator('.session-clock').first().innerText(), /08:30 - 10:05/);
  await page.locator('[data-detail-tab="syllabus"]').click();
  await page.waitForFunction(() => document.getElementById('detail-syllabus').textContent.includes('教学目的要求'));
  assert.ok(await page.locator('#detail-overview').isHidden());
  assert.ok(await page.locator('#detail-syllabus h4').count() > 0);
  for (const width of [360, 390, 412]) {
    await page.setViewportSize({ width, height: 844 });
    const alignment = await page.locator('.modal-footer a.button').evaluate(link => {
      const box = link.getBoundingClientRect(), icon = link.querySelector('svg').getBoundingClientRect(), label = link.querySelector('span').getBoundingClientRect();
      return { horizontal: Math.abs((icon.left + label.right) / 2 - (box.left + box.right) / 2), vertical: Math.abs((icon.top + icon.bottom) / 2 - (label.top + label.bottom) / 2) };
    });
    assert.ok(alignment.horizontal < 1 && alignment.vertical < 1, JSON.stringify(alignment));
    await page.screenshot({ path: `outputs/android-syllabus-${width}.png` });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-detail-tab="time"]').click();
  assert.ok(await page.locator('#detail-overview').isVisible());
  await page.locator('[data-close]').click();
  const originalPlan = await page.locator('#plan-select').inputValue();
  await page.locator('#plan-menu summary').click();
  await page.locator('#new-plan').click();
  assert.equal(await page.locator('#modal-input').inputValue(), '方案二');
  await page.locator('#modal-input').fill('');
  await page.locator('#confirm-form button[type="submit"]').click();
  assert.match(await page.locator('#form-error').innerText(), /请输入方案名称/);
  assert.ok(await page.locator('#confirm-form').evaluate(form => form.noValidate));
  await page.locator('#modal-input').fill('临时方案');
  await page.locator('#confirm-form button[type="submit"]').click();
  const temporaryPlan = await page.locator('#plan-select').inputValue();
  assert.equal(await page.locator('#timetable .schedule-event').count(), 0);
  await page.locator('#plan-select-trigger').click();
  await page.screenshot({ path: 'outputs/android-plan-picker.png' });
  await page.locator(`#control-picker [data-value="${originalPlan}"]`).click();
  assert.equal(await page.locator('#timetable .schedule-event').count(), 3);
  await choose('plan-select', temporaryPlan);
  await page.locator('#plan-menu summary').click();
  await page.locator('#delete-plan').click();
  await page.locator('#confirm-form button[type="submit"]').click();
  assert.equal(await page.locator('#plan-select option').count(), 1);
  for (const width of [360, 390, 412, 844]) {
    await page.setViewportSize({ width, height: width === 844 ? 390 : 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Overflow at ${width}px`);
    const overlaps = await page.locator('.header-actions').evaluate(el => el.getBoundingClientRect().left < document.querySelector('.brand-group').getBoundingClientRect().right);
    assert.equal(overlaps, false, `Header overlap at ${width}px`);
    assert.ok(await page.locator('#timetable').evaluate(el => el.getBoundingClientRect().height > 600));
    await page.screenshot({ path: `outputs/android-timetable-${width}.png`, fullPage: true });
  }
  for (const [width, height, top, right, bottom, left] of [[390, 844, 34, 0, 24, 0], [844, 390, 24, 16, 24, 44], [390, 500, 34, 0, 0, 0]]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(({ top, right, bottom, left }) => {
      window.scrollTo(0, 0);
      for (const [side, value] of Object.entries({ top, right, bottom, left })) document.documentElement.style.setProperty(`--safe-area-inset-${side}`, `${value}px`);
    }, { top, right, bottom, left });
    const header = await page.locator('.app-header').boundingBox();
    const add = await page.locator('#add-courses').boundingBox();
    assert.equal(header.y, 0);
    assert.ok(add.y >= top && add.x >= left && add.x + add.width <= width - right);
    await page.locator('#week-trigger').click();
    const sheet = await page.locator('#control-picker').boundingBox();
    assert.ok(sheet.y >= top && sheet.y + sheet.height <= height - bottom + 1);
    assert.ok(sheet.x >= left && sheet.x + sheet.width <= width - right);
    await page.locator('#control-picker [data-value="22"]').click();
    assert.equal(await page.locator('#week').inputValue(), '22');
    await page.locator('#week-today').click();
    await page.locator('#plan-menu summary').click();
    await page.locator('#semester-settings').click();
    const dialog = await page.locator('#modal').boundingBox();
    assert.ok(dialog.y >= top && dialog.y + dialog.height <= height - bottom);
    assert.ok(dialog.x >= left && dialog.x + dialog.width <= width - right);
    await page.locator('[data-close]').first().click();
    await page.screenshot({ path: `outputs/android-safe-area-${width}-${height}.png` });
  }
  await page.evaluate(() => {
    for (const side of ['top', 'right', 'bottom', 'left']) document.documentElement.style.removeProperty(`--safe-area-inset-${side}`);
  });
  await page.clock.setSystemTime(new Date('2026-09-28T00:01:00+08:00'));
  await page.clock.runFor(30001);
  assert.equal(await page.locator('#week').inputValue(), '3');
  assert.equal(await page.locator('#semester-status').innerText(), '当前第 4 周');
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
  await chooseDate('2026-09-07');
  await page.locator('#semester-form button[type="submit"]').click();
  assert.equal(await page.locator('#week').inputValue(), '4');
  assert.equal(await page.locator('#timetable .schedule-event').count(), 2);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#add-courses').click();
  await page.locator('#reset-filters').click();
  await page.locator('#search').fill('180203083900P1002H-2');
  await page.locator('.course-name[data-detail="316019"]').click();
  await page.locator('[data-detail-tab="syllabus"]').click();
  await page.waitForFunction(() => document.querySelectorAll('#detail-syllabus h4').length === 10);
  await page.screenshot({ path: 'outputs/android-machine-learning-syllabus.png' });
  await page.locator('#detail-syllabus h4').first().evaluate(element => element.scrollIntoView({ block: 'center' }));
  await page.screenshot({ path: 'outputs/android-machine-learning-outline.png' });
  await page.locator('#detail-syllabus section').last().evaluate(element => element.scrollIntoView({ block: 'center' }));
  assert.ok(await page.locator('.modal-footer a.button').isVisible());
  assert.ok(await page.locator('#detail-syllabus').evaluate(element => element.scrollWidth <= element.clientWidth));
  await page.locator('[data-close]').click();
  assert.deepEqual(forbiddenRequests, []);
  // A refreshed catalog may remove a previously selected course.
  await page.evaluate(() => {
    localStorage.setItem('ucas-planner-v1-89576', JSON.stringify({ version: 1, semesterStart: '2026-09-07', activeId: 'keep', plans: [
      { id: 'empty', name: '备用方案', ids: ['removed-from-catalog'] },
      { id: 'keep', name: '原有方案', ids: ['314374', 'removed-from-catalog'] }
    ] }));
  });
  await page.reload();
  await page.waitForSelector('body[data-ready="true"]');
  assert.match(await page.locator('#plan-select-trigger').innerText(), /原有方案/);
  const restored = await page.evaluate(() => JSON.parse(localStorage.getItem('ucas-planner-v1-89576')));
  assert.deepEqual(restored.plans.map(({ name, ids }) => ({ name, ids })), [{ name: '备用方案', ids: [] }, { name: '原有方案', ids: ['314374'] }]);
  assert.equal(restored.semesterStart, '2026-09-07');
  assert.deepEqual(errors, []);
  console.log('PASS: Android timetable homepage, no all-semester mode, semester date settings, current week on launch, preserved browsing week on resume/day rollover, current-week action, all 22 export weeks, offline enrollment/syllabus and 360/390/412/844px layout.');
} finally {
  await browser.close();
  server.close();
}
