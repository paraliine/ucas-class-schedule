import { matchCourseCodes, conflicts, courseFamily, hasSchedule } from './logic.mjs';

export function initBulkImport({ getCourses, getPlan, onAdd, teacher, shortTime, icons }) {
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let result = null, checked = new Set(), planId = null;
  const tabs = [...document.querySelectorAll('[data-catalog-mode]')];

  function reset() {
    result = null; checked.clear(); planId = null;
    $('bulk-results').replaceChildren();
    $('bulk-review').hidden = $('bulk-footer').hidden = true;
    $('bulk-error').textContent = '';
    $('bulk-codes').removeAttribute('aria-invalid');
  }

  function setMode(mode) {
    $('catalog-search').hidden = mode !== 'search';
    $('catalog-bulk').hidden = mode !== 'bulk';
    tabs.forEach(tab => {
      const active = tab.dataset.catalogMode === mode;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    if (mode === 'bulk') sync();
  }

  function sync() {
    if (!result) return;
    const plan = getPlan();
    if (plan.id !== planId) {
      reset(); $('bulk-error').textContent = '方案已切换，请重新匹配课程'; return;
    }
    const selectedIds = new Set(plan.ids);
    const existing = getCourses().filter(course => selectedIds.has(course.id));
    for (const id of selectedIds) checked.delete(id);
    const incoming = result.groups.flatMap(group => group.courses).filter(course => checked.has(course.id));
    const combined = [...existing, ...incoming];
    const focusedId = document.activeElement?.id;
    const missing = result.groups.filter(group => !group.courses.length).length;
    $('bulk-summary').textContent = `${result.groups.length} 个编码 · ${incoming.length} 门待添加${missing ? ` · ${missing} 个未找到` : ''}`;
    $('bulk-duplicates').textContent = result.duplicates ? `已合并 ${result.duplicates} 个重复编码` : '';
    $('bulk-results').innerHTML = result.groups.map(group => {
      if (!group.courses.length) return `<div class="bulk-missing"><code>${esc(group.code)}</code><span>未找到</span></div>`;
      const ambiguous = group.courses.length > 1;
      return `<section class="bulk-group">${ambiguous ? `<div class="bulk-ambiguous"><code>${esc(group.code)}</code><span>${group.courses.length} 条匹配，需手动勾选</span></div>` : ''}${group.courses.map(course => {
        const alreadySelected = selectedIds.has(course.id);
        const clashes = conflicts(course, combined);
        const otherClass = combined.some(other => other.id !== course.id && courseFamily(other) === courseFamily(course));
        const times = ambiguous
          ? course.sessions.map(session => `${esc(shortTime(session))}<small>${esc(session.room || '教室未公布')} · 第 ${esc(session.weeksText || '未公布')} 周</small>`)
          : [...new Set(course.sessions.map(shortTime))].map(esc);
        return `<label class="bulk-course${alreadySelected ? ' already-selected' : ''}"><input type="checkbox" id="bulk-choice-${esc(course.id)}" data-bulk-course="${esc(course.id)}" aria-label="添加 ${esc(course.name)} ${esc(course.code)}" ${alreadySelected || checked.has(course.id) ? 'checked' : ''} ${alreadySelected ? 'disabled' : ''}><span class="bulk-course-content"><span class="bulk-course-title"><strong>${esc(course.name)}</strong><span>${alreadySelected ? '已选' : `${course.credits} 学分`}</span></span><code>${esc(course.code)}</code><span class="bulk-course-meta">${esc(teacher(course))} · ${esc(course.campus || '校区未标注')}</span><span class="bulk-course-meta">${esc(course.academy)}</span><span class="bulk-times">${times.join('<br>') || '时间待定'}</span>${!alreadySelected && clashes.length ? `<span class="bulk-warning">时间冲突：${clashes.map(other => esc(other.name)).join('、')}</span>` : ''}${!alreadySelected && otherClass ? '<span class="bulk-warning">同一课程有其他班级</span>' : ''}${!hasSchedule(course) ? '<span class="bulk-warning">时间未完整公布</span>' : ''}</span></label>`;
      }).join('')}</section>`;
    }).join('');
    $('bulk-add-label').textContent = `添加 ${incoming.length} 门到${plan.name}`;
    const overLimit = selectedIds.size + incoming.length > 300;
    $('bulk-limit').textContent = overLimit ? '当前方案添加后超过 300 门，请减少勾选' : '';
    $('bulk-add').disabled = !incoming.length || overLimit;
    $('bulk-review').hidden = $('bulk-footer').hidden = false;
    if (focusedId?.startsWith('bulk-choice-')) $(focusedId)?.focus({ preventScroll: true });
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => setMode(tab.dataset.catalogMode));
    tab.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs.at(-1) : tabs[(index + 1) % tabs.length];
      setMode(next.dataset.catalogMode); next.focus();
    });
  });
  $('bulk-codes').addEventListener('input', reset);
  $('bulk-clear').addEventListener('click', () => { $('bulk-codes').value = ''; reset(); $('bulk-codes').focus(); });
  $('bulk-match-form').addEventListener('submit', event => {
    event.preventDefault(); reset();
    try {
      result = matchCourseCodes($('bulk-codes').value, getCourses());
      const plan = getPlan(); planId = plan.id;
      checked = new Set(result.groups.filter(group => group.courses.length === 1).map(group => group.courses[0].id).filter(id => !plan.ids.includes(id)));
      sync();
    } catch (error) {
      $('bulk-error').textContent = error.message;
      $('bulk-codes').setAttribute('aria-invalid', 'true'); $('bulk-codes').focus();
    }
  });
  $('bulk-results').addEventListener('change', event => {
    const id = event.target.dataset.bulkCourse;
    if (!id) return;
    if (event.target.checked) checked.add(id); else checked.delete(id);
    sync();
  });
  $('bulk-add').addEventListener('click', () => {
    if (!result || getPlan().id !== planId) { sync(); return; }
    onAdd([...checked], planId, () => { $('bulk-codes').value = ''; reset(); setMode('search'); });
  });
  icons();
  return { sync, openSearch: () => setMode('search') };
}
