import test from 'node:test';
import assert from 'node:assert/strict';
import { createWidgetSync } from '../src/widget-sync.mjs';

test('adding a widget after initial sync refreshes unchanged data without rewriting the plan', async () => {
  let placed = false, displayed = null, saved, writes = 0;
  const sync = createWidgetSync(async data => { saved = data; writes++; }, async () => { if (placed) displayed = saved; });
  const plan = { planName: '方案二', courses: ['314374'], semesterStart: '2026-08-31' };
  await sync(plan);
  placed = true;
  await sync(plan, { force: true });
  assert.deepEqual(JSON.parse(displayed), plan);
  assert.equal(writes, 1);
});

test('a foreground refresh waits for pending selection changes and browsing stays deduplicated', async () => {
  const calls = [];
  let unblock;
  const gate = new Promise(resolve => { unblock = resolve; });
  const sync = createWidgetSync(async data => { await gate; calls.push(JSON.parse(data).name); }, async () => { calls.push('refresh'); });
  const one = sync({ name: '一' }), two = sync({ name: '二' });
  const refresh = sync({ name: '二' }, { force: true });
  assert.deepEqual(calls, []);
  unblock(); await Promise.all([one, two, refresh]);
  assert.deepEqual(calls, ['一', '二', 'refresh']);
  await sync({ name: '二' });
  assert.deepEqual(calls, ['一', '二', 'refresh']);
});

test('a failed native write is retried with the same selection', async () => {
  let calls = 0;
  const sync = createWidgetSync(async () => { if (++calls === 1) throw new Error('storage failed'); }, async () => {});
  await assert.rejects(sync({ courses: ['314374'] }), /storage failed/);
  await sync({ courses: ['314374'] }, { force: true });
  assert.equal(calls, 2);
});
