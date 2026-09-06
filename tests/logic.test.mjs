import test from 'node:test';
import assert from 'node:assert/strict';
import { overlaps, conflicts, conflictPairs, filterCourses, validateImport, csvCell, nextPlanName } from '../src/logic.mjs';
import { buildTimetableHtml } from '../src/export.mjs';
import { layoutSchedule } from '../src/schedule.mjs';
import { calendarDay, currentTeachingWeek, weekDates } from '../src/semester.mjs';
import { PERIOD_TIMES, formatPeriodTimes } from '../src/periods.mjs';

test('lesson clock times preserve gaps and cover the last evening period', () => {
  assert.equal(PERIOD_TIMES.length, 13);
  assert.equal(formatPeriodTimes([2, 1, 2]), '08:30 - 10:05');
  assert.equal(formatPeriodTimes([1, 3]), '08:30 - 09:15 / 10:25 - 11:10');
  assert.equal(formatPeriodTimes([9]), '17:05 - 17:50');
  assert.equal(formatPeriodTimes([10, 11, 12, 13]), '18:30 - 21:50');
  assert.equal(formatPeriodTimes([]), '');
  assert.equal(formatPeriodTimes([14]), '');
  const html = buildTimetableHtml({ name: 'test', term: 'fall', courses: [], week: 3 });
  const data = JSON.parse(html.match(/id="schedule-data">(.*?)<\/script>/s)[1]);
  assert.deepEqual(data.periodTimes, PERIOD_TIMES);
});

const session = (weeks, periods = [1, 2], day = 2) => ({ weeks, periods, day });
const course = (id, weeks = [2, 3]) => ({ id, name: `课程${id}`, code: id, academy: '数学科学学院', campus: '雁栖湖', attribute: '专业课', chief: '张老师', teachers: '', capacity: 30, enrolled: 20, sessions: [session(weeks)], credits: 2 });

test('automatic plan names use Chinese numbers and reuse gaps without renaming existing plans', () => {
  const plans = [];
  for (let i = 0; i < 20; i++) plans.push({ name: nextPlanName(plans) });
  assert.equal(plans[0].name, '方案一');
  assert.equal(plans[1].name, '方案二');
  assert.equal(plans[9].name, '方案十');
  assert.equal(plans[10].name, '方案十一');
  assert.equal(plans[19].name, '方案二十');
  const remaining = plans.filter(plan => plan.name !== '方案二');
  remaining.push({ name: '我的方案' });
  const before = structuredClone(remaining);
  assert.equal(nextPlanName(remaining), '方案二');
  assert.deepEqual(remaining, before);
});

test('conflicts require shared weekday, period and teaching week', () => {
  assert.equal(overlaps(session([2, 4]), session([1, 3])), false);
  assert.equal(overlaps(session([2]), session([2], [3, 4])), false);
  assert.equal(overlaps(session([2]), session([2], [1, 2], 3)), false);
  assert.equal(overlaps(session([2]), session([2], [2, 3])), true);
  assert.equal(overlaps(session([]), session([2])), false);
});

test('self-selection is excluded and course pairs are counted once', () => {
  const a = course('a'), b = course('b'), c = course('c', [5]);
  assert.deepEqual(conflicts(a, [a, b, c]), [b]);
  assert.deepEqual(conflictPairs([a, b, c]), [[a, b]]);
});

test('simulation filtering includes full and over-enrolled courses', () => {
  const full = { ...course('full'), capacity: 20, enrolled: 20 };
  const over = { ...course('over'), capacity: 20, enrolled: 23 };
  const unknown = { ...course('unknown'), capacity: null, enrolled: 30 };
  assert.deepEqual(filterCourses([full, over, unknown], { query: '张老师' }, []), [full, over, unknown]);
});

test('filters combine keyword, campus and known conflict-free times', () => {
  const a = course('a'), b = course('b', [6]);
  const unknown = { ...course('c'), sessions: [] };
  assert.deepEqual(filterCourses([a, b, unknown], { query: '张老师 数学', campus: '雁栖湖', noConflict: true }, [a]), [a, b]);
  assert.deepEqual(filterCourses([a], { campus: '玉泉路' }, []), []);
});

test('import rejects wrong semester and unknown courses without partial import', () => {
  const map = new Map([['a', course('a')]]);
  const value = { version: 1, termId: '89576', plans: [{ name: '方案', ids: ['a', 'a'] }] };
  assert.deepEqual(validateImport(value, map, '89576')[0].ids, ['a']);
  assert.throws(() => validateImport(value, map, 'other'));
  assert.throws(() => validateImport({ ...value, plans: [{ name: 'x', ids: ['missing'] }] }, map, '89576'));
});

test('CSV escapes cells and neutralizes spreadsheet formulas', () => {
  assert.equal(csvCell('a,"b"'), '"a,""b"""');
  assert.equal(csvCell('=1+1'), '"\'=1+1"');
});

test('HTML export escapes embedded data and contains offline week controls', () => {
  const html = buildTimetableHtml({ name: '</script><script>alert(1)</script>', term: '秋季', courses: [course('a')], week: 0 });
  assert.ok(!html.includes('</script><script>alert(1)'));
  assert.ok(html.includes('id="week"'));
  assert.ok(html.includes('"week":0'));
  assert.ok(!/<script[^>]*\ssrc=/.test(html));
  assert.ok(!/<link[^>]*\shref=/.test(html));
});

test('timetable merges consecutive periods and separates nonconsecutive periods', () => {
  const a = { ...course('a'), sessions: [session([2], [1, 2, 4]), session([3], [1, 2, 4])] };
  const events = layoutSchedule([a], 0)[1];
  assert.deepEqual(events.map(e => [e.start, e.end, e.weeks]), [[1, 2, [2, 3]], [4, 4, [2, 3]]]);
  assert.equal(layoutSchedule([a], 1)[1].length, 0);
  assert.equal(layoutSchedule([a], 2)[1].length, 2);
});

test('overlapping blocks have separate lanes; alternating weeks are not conflicts', () => {
  const a = course('a', [2]), b = course('b', [3]), c = course('c', [2]);
  const events = layoutSchedule([a, b, c], 0)[1];
  assert.deepEqual(events.map(e => [e.lane, e.lanes, e.conflict]), [[0, 3, true], [1, 3, false], [2, 3, true]]);
  assert.deepEqual(layoutSchedule([a, b, c], 3)[1].map(e => [e.id, e.lanes, e.conflict]), [['b', 1, false]]);
});

test('teaching weeks change on Monday and retain the Sunday in its current week', () => {
  assert.deepEqual(currentTeachingWeek('2026-09-07', 22, '2026-09-13'), { week: 1, state: 'during' });
  assert.deepEqual(currentTeachingWeek('2026-09-07', 22, '2026-09-14'), { week: 2, state: 'during' });
  assert.deepEqual(weekDates('2026-09-09', 1), weekDates('2026-09-07', 1));
  assert.equal(weekDates('2026-09-07', 22)[6], '2027-02-07');
});

test('semester boundaries and missing or invalid dates are explicit', () => {
  assert.deepEqual(currentTeachingWeek('', 22, '2026-09-07'), { week: 1, state: 'unset' });
  assert.deepEqual(currentTeachingWeek('2026-09-07', 22, '2026-09-06'), { week: 1, state: 'before' });
  assert.deepEqual(currentTeachingWeek('2026-09-07', 22, '2027-02-07'), { week: 22, state: 'during' });
  assert.deepEqual(currentTeachingWeek('2026-09-07', 22, '2027-02-08'), { week: 22, state: 'after' });
  assert.equal(calendarDay('2026-02-29'), null);
  assert.notEqual(calendarDay('2024-02-29'), null);
  assert.deepEqual(currentTeachingWeek('2026-03-02', 22, '2026-03-09'), { week: 2, state: 'during' });
});
