import { hasSchedule, conflicts, courseFamily, summary, filterCourses, csvCell, validateImport, nextPlanName } from './logic.mjs';
import { buildTimetableHtml } from './export.mjs';
import { layoutSchedule } from './schedule.mjs';
import { calendarDay, localDate, weekDates, currentTeachingWeek } from './semester.mjs';
import { initControls, syncControls, closePicker } from './controls.mjs';
import { isNative, getCatalog, getCourse, saveFile, printPage, setupPlatform } from './platform.mjs';

const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = name => `<i data-lucide="${name}"></i>`;
const icons = () => { syncControls(); window.lucide?.createIcons(); };
const days = ['一', '二', '三', '四', '五', '六', '日'];
let courses = [], meta = {}, courseMap = new Map(), plans = [], activePlan, storageKey;
let view = 'catalog', page = 1, teachingWeek = 0, saveFailed = false, toastTimer;
let semesterStart = '', termWeeks = 22, lastCalendarDate = localDate();
const PAGE_SIZE = 20;
const filters = { query: '', academy: '', campus: '', attribute: '', day: '', noConflict: false };
const selected = () => (activePlan?.ids || []).map(id => courseMap.get(id)).filter(Boolean);
const teacher = c => [...new Set([c.chief, c.teachers].filter(Boolean))].join(' / ') || '教师未标注';
const shortTime = s => s.day && s.periods.length ? `周${days[s.day - 1]} ${s.periods.join('、')} 节` : s.time || '时间待定';
document.body.classList.toggle('native-app', isNative);

function toast(message) {
  clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3500);
}

function persist() {
  try {
    localStorage.setItem(storageKey, JSON.stringify({ version: 1, plans, activeId: activePlan.id, week: teachingWeek, semesterStart }));
    saveFailed = false;
  } catch { saveFailed = true; toast('浏览器存储不可用，请备份方案'); }
}

function restore() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (saved) {
      if (saved.version !== 1 || !Array.isArray(saved.plans) || !saved.plans.length) throw new Error();
      const validated = validateImport({ ...saved, termId: meta.termId }, courseMap, meta.termId);
      const index = saved.plans.findIndex(p => p.id === saved.activeId);
      plans = validated;
      activePlan = plans[Math.max(0, index)];
      teachingWeek = Number.isInteger(saved.week) && saved.week >= 0 ? saved.week : 0;
      semesterStart = calendarDay(saved.semesterStart) !== null ? saved.semesterStart : '';
    }
  } catch { toast('已存方案无法读取，已创建新方案'); }
  if (!activePlan) { activePlan = { id: crypto.randomUUID(), name: nextPlanName([]), ids: [] }; plans = [activePlan]; }
}

async function download(content, filename, type) {
  try { return await saveFile(content, filename, type); }
  catch { toast('文件未能保存，请重试'); return false; }
}

function modal(html) {
  closePicker();
  $('modal-content').innerHTML = html;
  if (!$('modal').open) $('modal').showModal();
  icons();
}

function modalHead(title, subtitle = '') {
  return `<div class="modal-header"><div><h2>${esc(title)}</h2>${subtitle ? `<p>${esc(subtitle)}</p>` : ''}</div><button class="icon-button" data-close aria-label="关闭" title="关闭">${icon('x')}</button></div>`;
}

function confirmAction(title, message, label, action, { input = null, danger = false } = {}) {
  modal(`${modalHead(title)}<form id="confirm-form"><div class="modal-body"><p class="modal-message">${esc(message)}</p>${input !== null ? `<input id="modal-input" class="modal-input" aria-label="方案名称" aria-describedby="form-error" required maxlength="40" value="${esc(input)}"><p id="form-error" class="form-error" role="status"></p>` : ''}</div><div class="modal-footer"><button type="button" class="button secondary" data-close>取消</button><button type="submit" class="button ${danger ? 'danger' : 'primary'}">${esc(label)}</button></div></form>`);
  $('confirm-form').addEventListener('submit', event => {
    event.preventDefault();
    const value = $('modal-input')?.value.trim();
    if (input !== null && !value) { $('form-error').textContent = '请输入方案名称'; $('modal-input').setAttribute('aria-invalid', 'true'); $('modal-input').focus(); return; }
    $('modal').close(); action(value);
  });
  if (input !== null) { $('modal-input').focus(); $('modal-input').select(); $('modal-input').addEventListener('input', () => { $('form-error').textContent = ''; $('modal-input').removeAttribute('aria-invalid'); }); }
}

function toggleCourse(id) {
  const c = courseMap.get(id); if (!c) return;
  if (activePlan.ids.includes(id)) {
    activePlan.ids = activePlan.ids.filter(value => value !== id); persist(); render(); toast(`已退选 ${c.name}`); return;
  }
  if (activePlan.ids.length >= 300) { toast('每个方案最多保留 300 门课程'); return; }
  const clashes = conflicts(c, selected());
  const duplicates = selected().filter(other => courseFamily(other) === courseFamily(c));
  const messages = [];
  if (clashes.length) messages.push('时间冲突：\n' + clashes.map(other => `• ${other.name}`).join('\n'));
  if (duplicates.length) messages.push('同一课程的其他班级已在方案中：\n' + duplicates.map(other => `• ${other.name} (${other.code})`).join('\n'));
  if (!hasSchedule(c)) messages.push('这门课程的时间信息未完整公布，无法完成全部冲突检查。');
  const add = () => { activePlan.ids.push(id); persist(); render(); toast(`已选 ${c.name}`); };
  if (messages.length) confirmAction('加入选课方案', messages.join('\n\n'), '仍然加入', add);
  else add();
}

function renderPlans() {
  $('plan-select').innerHTML = plans.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
  $('plan-select').value = activePlan.id;
  $('delete-plan').disabled = plans.length === 1;
  $('panel-plan-name').textContent = activePlan.name;
}

function renderStats() {
  const items = selected(), info = summary(items);
  for (const [key, value, unit] of [['count', info.count, '门'], ['credits', info.credits, '学分'], ['hours', info.hours, '学时'], ['conflicts', info.conflicts.length, '组冲突']]) {
    $(`stat-${key}`).innerHTML = `${value}<small> ${unit}</small>`;
  }
  $('stat-conflicts').classList.toggle('has-conflict', info.conflicts.length > 0);
  $('nav-selected').textContent = info.count;
  $('panel-count').textContent = `${info.count} 门`;
  $('conflict-summary').innerHTML = info.conflicts.length ? `<div class="conflict-notice">全学期 ${info.conflicts.length} 组时间冲突：${info.conflicts.slice(0, 3).map(pair => pair.map(c => esc(c.name)).join(' / ')).join('；')}</div>` : '';
  $('save-state').innerHTML = `${icon(saveFailed ? 'triangle-alert' : 'hard-drive')}${saveFailed ? '未能保存，请备份方案' : '已保存在本机'}`;
  $('export-html').disabled = !items.length;
}

function courseRow(c, chosen) {
  const isSelected = activePlan.ids.includes(c.id), clashes = conflicts(c, chosen);
  const times = [...new Set(c.sessions.map(shortTime))];
  return `<tr class="${isSelected ? 'is-selected' : ''}" data-course-row="${c.id}"><td><button class="course-name" data-detail="${c.id}">${esc(c.name)}</button><div class="course-meta course-code">${esc(c.code)}</div><div class="course-meta">${esc(c.academy)}</div><span class="course-tag">${esc(c.attribute)}</span></td><td>${esc(teacher(c))}<div class="course-meta">${esc(c.campus || '校区未标注')}</div></td><td>${c.credits}</td><td>${times.slice(0, 2).map(time => `<div class="time-line">${esc(time)}</div>`).join('') || '<span class="course-meta">时间待定</span>'}${times.length > 2 ? `<button class="text-button" data-detail="${c.id}">另 ${times.length - 2} 个时段</button>` : ''}${clashes.length ? `<div><span class="tag red">${clashes.length} 门冲突</span></div>` : ''}</td><td class="action-col"><button class="enroll-button ${isSelected ? 'selected' : ''}" data-toggle="${c.id}" aria-label="${isSelected ? '退选' : '选课'} ${esc(c.name)}">${icon(isSelected ? 'check' : 'plus')}${isSelected ? '已选' : '选课'}</button></td></tr>`;
}

function renderCatalog() {
  const chosen = selected();
  let filtered = filterCourses(courses, filters, chosen);
  const sort = $('sort').value;
  if (sort === 'credits-desc') filtered.sort((a, b) => b.credits - a.credits);
  if (sort === 'credits-asc') filtered.sort((a, b) => a.credits - b.credits);
  if (sort === 'name') filtered.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)); page = Math.min(page, pages);
  $('result-count').innerHTML = `共 <strong>${filtered.length.toLocaleString()}</strong> 门课程`;
  $('course-rows').innerHTML = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(c => courseRow(c, chosen)).join('');
  $('empty-state').hidden = filtered.length > 0;
  document.querySelector('.table-wrap').hidden = !filtered.length;
  $('page-summary').textContent = filtered.length ? `第 ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, filtered.length)} 项，共 ${filtered.length} 项` : '0 项';
  $('page-number').textContent = `${page} / ${pages}`;
  $('prev-page').disabled = page === 1; $('next-page').disabled = page === pages;
}

function renderSelected() {
  const items = selected(); $('selected-heading').textContent = `${activePlan.name} · ${items.length} 门`;
  $('clear-plan').disabled = $('export-csv').disabled = !items.length;
  $('selected-list').innerHTML = items.length ? items.map(c => {
    const clash = conflicts(c, items);
    return `<article class="selected-course"><div class="selected-course-main"><button class="course-name" data-detail="${c.id}">${esc(c.name)}</button><div class="course-meta">${esc(c.code)} · ${esc(teacher(c))}</div><span class="course-tag">${esc(c.attribute)}</span><span class="course-tag">${c.credits} 学分 · ${c.hours} 学时</span><div class="course-meta">${esc(c.academy)} · ${esc(c.campus || '校区未标注')}</div>${c.sessions.map(s => `<div class="time-line">${esc(shortTime(s))} · ${esc(s.room || '教室未公布')}<div class="course-meta">第 ${esc(s.weeksText || '未公布')} 周</div></div>`).join('') || '<div class="unknown-notice">上课时间未公布</div>'}${clash.length ? `<div class="conflict-notice">冲突：${clash.map(c => esc(c.name)).join('、')}</div>` : ''}</div><button class="button secondary" data-toggle="${c.id}">${icon('minus')}退选</button></article>`;
  }).join('') : `<div class="empty-state">${icon('notebook-pen')}<h3>当前方案尚未选择课程</h3><button class="button primary" data-view="catalog">浏览课程库</button></div>`;
}

function renderTimetable() {
  const items = selected(), week = Number($('week').value);
  const maxPeriod = Math.max(13, ...items.flatMap(c => c.sessions.flatMap(s => s.periods)));
  const layout = layoutSchedule(items, week);
  const dates = isNative ? weekDates(semesterStart, week) : [];
  let html = '<div class="schedule-header"></div>' + days.map((day, i) => `<div class="schedule-header${dates[i] === localDate() ? ' is-today' : ''}">周${day}${dates[i] ? `<small>${Number(dates[i].slice(5, 7))}/${Number(dates[i].slice(8))}</small>` : ''}</div>`).join('');
  html += `<div class="period-column">${Array.from({ length: maxPeriod }, (_, i) => `<div class="schedule-label">${i + 1}</div>`).join('')}</div>`;
  html += layout.map(events => `<div class="day-column" style="height:calc(${maxPeriod} * var(--slot-height))">${events.map(event => {
    const rooms = event.rooms.join(' / ') || '教室未公布';
    const weeks = [...event.weeks].sort((a, b) => a - b).join('、');
    const position = `top:calc(${event.start - 1} * var(--slot-height) + 2px);height:calc(${event.end - event.start + 1} * var(--slot-height) - 4px);left:calc(${event.lane / event.lanes * 100}% + 2px);width:calc(${100 / event.lanes}% - 4px)`;
    return `<button class="schedule-event ${event.conflict ? 'conflict' : `color-${event.color % 6}`}" style="${position}" data-detail="${event.id}" title="${esc(event.course.name)} · ${esc(teacher(event.course))} · ${esc(rooms)} · 第 ${weeks} 周${event.conflict ? ' · 时间冲突' : ''}"><strong>${esc(event.course.name)}</strong><small>${esc(rooms)}</small>${event.conflict ? '<small>冲突</small>' : ''}</button>`;
  }).join('')}</div>`).join('');
  $('timetable').innerHTML = html;
  const active = items.filter(c => c.sessions.some(s => s.day && s.periods.length && (!week || s.weeks.includes(week))));
  $('timetable-status').textContent = !items.length ? '尚未选择课程' : active.length ? `${week ? `第 ${week} 周` : '全学期'} · ${active.length} 门排课` : week ? `第 ${week} 周暂无排课` : '上课时间待定';
  $('week-prev').disabled = week <= 1;
  $('week-next').disabled = week >= termWeeks;
  if (isNative) {
    const current = currentTeachingWeek(semesterStart, termWeeks);
    $('semester-status').textContent = current.state === 'unset' ? '设置开学日期' : current.state === 'before' ? '尚未开学' : current.state === 'after' ? '本学期已结束' : `当前第 ${current.week} 周`;
    $('week-today').disabled = current.state !== 'unset' && week === current.week;
  }
  const unknown = items.filter(c => !hasSchedule(c));
  $('unscheduled').innerHTML = unknown.length ? `<div class="unknown-notice">时间未完整公布：${unknown.map(c => esc(c.name)).join('、')}</div>` : '';
  syncControls();
}

function render() {
  renderPlans(); renderStats();
  if (view === 'catalog') renderCatalog();
  if (view === 'selected') renderSelected();
  renderTimetable();
  icons();
}

function changeView(next) {
  if (!['catalog', 'selected', 'timetable'].includes(next)) return;
  view = next;
  document.body.dataset.view = view;
  for (const key of ['catalog', 'selected']) $(`${key}-view`).hidden = key !== view;
  document.querySelector('.primary-content').hidden = view === 'timetable';
  document.querySelector('.content-layout').classList.toggle('timetable-focus', view === 'timetable');
  $('expand-timetable').dataset.view = view === 'timetable' ? 'catalog' : 'timetable';
  $('expand-timetable').title = view === 'timetable' ? '返回选课' : '放大课表';
  $('expand-timetable').setAttribute('aria-label', $('expand-timetable').title);
  $('expand-timetable').innerHTML = icon(view === 'timetable' ? 'minimize-2' : 'maximize-2');
  document.querySelectorAll('nav [data-view]').forEach(button => button.classList.toggle('active', button.dataset.view === view));
  $('app-title').textContent = isNative && view === 'catalog' ? '添加课程' : '国科大课表';
  document.title = `${view === 'catalog' ? '选课' : view === 'selected' ? '已选课程' : '课表'} · 国科大`;
  render();
  if (isNative) window.scrollTo(0, 0);
}

async function showDetail(id) {
  const c = courseMap.get(id); if (!c) return;
  modal(`${modalHead(c.name, c.code)}<div class="modal-body"><dl class="detail-grid">${[['开课院系', c.academy], ['教师', teacher(c)], ['校区', c.campus || '未标注'], ['课程属性', c.attribute], ['学分', c.credits], ['学时', c.hours]].map(([key, value]) => `<div><dt>${key}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl><div class="detail-tabs"><button class="active" data-detail-tab="time">时间与地点</button><button data-detail-tab="syllabus">教学大纲</button></div><div id="detail-time">${c.sessions.map(s => `<div class="session-row"><strong>${esc(shortTime(s))}</strong><div>${esc(s.room || '教室未公布')}<small>第 ${esc(s.weeksText || '未公布')} 周</small></div></div>`).join('') || '<p class="unknown-notice">上课时间未公布</p>'}</div><pre id="detail-syllabus" class="syllabus" hidden>正在读取大纲…</pre></div><div class="modal-footer"><a class="button secondary" href="${esc(c.planUrl)}" target="_blank" rel="noreferrer">${icon('external-link')}原始页面</a><button class="button primary" id="detail-enroll">${icon(activePlan.ids.includes(id) ? 'minus' : 'plus')}${activePlan.ids.includes(id) ? '退选课程' : '加入方案'}</button></div>`);
  $('detail-enroll').addEventListener('click', () => { $('modal').close(); toggleCourse(id); });
  const target = $('detail-syllabus');
  try { const detail = await getCourse(id); target.textContent = detail.syllabus || '教学大纲未公布'; }
  catch { target.textContent = '无法读取本地大纲，请关闭后重试。'; }
}

function jumpToCurrentWeek() {
  if (!isNative) return;
  lastCalendarDate = localDate();
  teachingWeek = currentTeachingWeek(semesterStart, termWeeks).week;
  $('week').value = String(teachingWeek);
  persist(); renderTimetable();
}

function editSemester() {
  const range = value => {
    const dates = weekDates(value, 1);
    return dates.length ? `第 1 周：${dates[0]} 至 ${dates[6]}` : '';
  };
  modal(`${modalHead('学期设置', meta.term)}<form id="semester-form"><div class="modal-body"><label class="semester-date-field" for="semester-start">学期开始日期<input class="modal-input" id="semester-start" type="date" min="1900-01-01" max="2100-12-31" required value="${esc(semesterStart)}"></label><p id="semester-preview">${range(semesterStart)}</p></div><div class="modal-footer"><button type="button" class="button secondary" data-close>取消</button><button type="submit" class="button primary">保存</button></div></form>`);
  $('semester-start').addEventListener('input', () => { $('semester-preview').textContent = range($('semester-start').value); });
  $('semester-form').addEventListener('submit', event => {
    event.preventDefault();
    if (calendarDay($('semester-start').value) === null) { $('semester-preview').textContent = '请选择学期开始日期'; $('semester-start').setAttribute('aria-invalid', 'true'); return; }
    semesterStart = $('semester-start').value;
    jumpToCurrentWeek(); $('modal').close();
  });
}

function exportHtml() {
  if (!selected().length) { toast('请先选择课程'); return; }
  modal(`${modalHead('导出 HTML 课表', activePlan.name)}<form id="export-html-form"><div class="modal-body"><dl class="detail-grid"><div><dt>文件格式</dt><dd>独立 HTML 网页</dd></div><div><dt>课程数</dt><dd>${selected().length} 门</dd></div><div><dt>默认教学周</dt><dd><select id="export-week" aria-label="导出默认教学周">${$('week').innerHTML}</select></dd></div></dl></div><div class="modal-footer"><button type="button" class="button secondary" data-close>取消</button><button class="button primary" type="submit">${icon('download')}导出 HTML</button></div></form>`);
  $('export-week').value = $('week').value;
  icons();
  $('export-html-form').addEventListener('submit', async event => {
    event.preventDefault();
    const html = buildTimetableHtml({ name: activePlan.name, term: meta.term, courses: selected(), week: Number($('export-week').value), termWeeks });
    const saved = await download(html, `${activePlan.name.replace(/[\\/:*?"<>|]/g, '_')}-课表.html`, 'text/html');
    if (saved) { $('modal').close(); toast('课表已导出'); }
  });
}

function bindEvents() {
  document.addEventListener('click', event => {
    if (!event.target.closest('#plan-menu')) $('plan-menu').open = false;
    const button = event.target.closest('button'); if (!button) return;
    if (button.closest('.menu-content')) $('plan-menu').open = false;
    if (button.dataset.command === 'export-html') exportHtml();
    if (button.hasAttribute('data-close')) $('modal').close();
    if (button.dataset.view) changeView(button.dataset.view);
    if (button.dataset.toggle) toggleCourse(button.dataset.toggle);
    if (button.dataset.detail) showDetail(button.dataset.detail);
    if (button.dataset.detailTab) {
      const tab = button.dataset.detailTab;
      $('detail-time').hidden = tab !== 'time'; $('detail-syllabus').hidden = tab !== 'syllabus';
      document.querySelectorAll('[data-detail-tab]').forEach(b => b.classList.toggle('active', b.dataset.detailTab === tab));
    }
  });
  $('modal').addEventListener('click', event => { if (event.target === $('modal')) $('modal').close(); });
  $('search').addEventListener('input', () => { filters.query = $('search').value; page = 1; renderCatalog(); icons(); });
  for (const key of ['academy', 'campus', 'attribute', 'day', 'noConflict']) $(key).addEventListener('change', () => {
    filters[key] = $(key).type === 'checkbox' ? $(key).checked : $(key).value; page = 1; renderCatalog(); icons();
  });
  const resetFilters = () => { Object.keys(filters).forEach(key => { filters[key] = typeof filters[key] === 'boolean' ? false : ''; const element = $(key === 'query' ? 'search' : key); if (element.type === 'checkbox') element.checked = false; else element.value = ''; }); page = 1; renderCatalog(); icons(); };
  $('reset-filters').addEventListener('click', resetFilters); $('empty-reset').addEventListener('click', resetFilters);
  $('sort').addEventListener('change', () => { page = 1; renderCatalog(); icons(); });
  $('prev-page').addEventListener('click', () => { page--; renderCatalog(); icons(); });
  $('next-page').addEventListener('click', () => { page++; renderCatalog(); icons(); });
  const changeWeek = value => { teachingWeek = value; $('week').value = String(value); persist(); renderTimetable(); };
  $('week').addEventListener('change', () => changeWeek(Number($('week').value)));
  $('week-prev').addEventListener('click', () => changeWeek(Math.max(1, teachingWeek - 1)));
  $('week-next').addEventListener('click', () => changeWeek(Math.min(termWeeks, teachingWeek + 1)));
  $('semester-settings').addEventListener('click', editSemester);
  $('semester-status').addEventListener('click', editSemester);
  $('week-today').addEventListener('click', () => semesterStart ? jumpToCurrentWeek() : editSemester());
  $('print-timetable').addEventListener('click', () => printPage());
  $('plan-select').addEventListener('change', () => { activePlan = plans.find(p => p.id === $('plan-select').value); persist(); render(); });
  const createPlan = (duplicate = false) => {
    if (plans.length >= 20) { toast('最多保留 20 个方案'); return; }
    confirmAction(duplicate ? '复制方案' : '新建方案', '', '保存方案', name => {
      const plan = { id: crypto.randomUUID(), name, ids: duplicate ? [...activePlan.ids] : [] };
      plans.push(plan); activePlan = plan; persist(); render();
    }, { input: duplicate ? `${activePlan.name} 副本` : nextPlanName(plans) });
  };
  $('new-plan').addEventListener('click', () => createPlan()); $('duplicate-plan').addEventListener('click', () => createPlan(true));
  $('rename-plan').addEventListener('click', () => confirmAction('重命名方案', '', '保存', name => { activePlan.name = name; persist(); render(); }, { input: activePlan.name }));
  $('delete-plan').addEventListener('click', () => { if (plans.length > 1) confirmAction('删除方案', `删除“${activePlan.name}”及其中的选课记录？`, '删除方案', () => { plans = plans.filter(p => p.id !== activePlan.id); activePlan = plans[0]; persist(); render(); }, { danger: true }); });
  $('clear-plan').addEventListener('click', () => confirmAction('清空方案', `清空“${activePlan.name}”中的 ${selected().length} 门课程？`, '清空', () => { activePlan.ids = []; persist(); render(); }, { danger: true }));
  $('export-html').addEventListener('click', exportHtml);
  $('export-plan').addEventListener('click', () => download(JSON.stringify({ version: 1, termId: meta.termId, term: meta.term, plans }, null, 2), '国科大-选课方案.json', 'application/json'));
  $('export-csv').addEventListener('click', () => {
    const rows = [['课程编码', '课程名称', '院系', '教师', '校区', '课程属性', '学分', '学时', '时间地点与周次'], ...selected().map(c => [c.code, c.name, c.academy, teacher(c), c.campus, c.attribute, c.credits, c.hours, c.sessions.map(s => `${s.time} ${s.room} 第${s.weeksText}周`).join('\n')])];
    download('\ufeff' + rows.map(row => row.map(csvCell).join(',')).join('\r\n'), '国科大-已选课程.csv', 'text/csv;charset=utf-8');
  });
  $('import-plan').addEventListener('click', () => $('import-file').click());
  $('import-file').addEventListener('change', async () => {
    const file = $('import-file').files[0]; $('import-file').value = ''; if (!file) return;
    try {
      if (file.size > 2000000) throw new Error('方案文件过大');
      const incoming = validateImport(JSON.parse(await file.text()), courseMap, meta.termId);
      if (plans.length + incoming.length > 20) throw new Error('导入后超过 20 个方案，请先删除不需要的方案');
      plans.push(...incoming); activePlan = incoming[0]; persist(); render(); toast(`已导入 ${incoming.length} 个方案`);
    } catch (error) { toast(error instanceof SyntaxError ? '无法识别方案 JSON 文件' : error.message); }
  });
  $('data-info').addEventListener('click', () => modal(`${modalHead('本地课程数据')}<div class="modal-body"><dl class="detail-grid">${[['学期', meta.term], ['课程数', meta.count], ['详情下载成功', meta.detailsFetched], ['已公布时间', meta.scheduledCount], ['抓取失败', meta.errorCount], ['采集时间', new Date(meta.fetchedAt).toLocaleString('zh-CN')]].map(([key, value]) => `<div><dt>${esc(key)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>${isNative ? '' : '<div class="data-actions"><a href="/download/courses.sqlite3">下载 SQLite 数据库</a><a href="/download/courses.json">下载完整 JSON</a></div>'}<a href="${esc(meta.source)}" target="_blank" rel="noreferrer">公开课程数据来源</a></div><div class="modal-footer"><button class="button secondary" data-close>关闭</button></div>`));
}

async function init() {
  initControls({ weekDetail: value => {
    const dates = weekDates(semesterStart, Number(value));
    return dates.length ? `${Number(dates[0].slice(5, 7))}/${Number(dates[0].slice(8))} - ${Number(dates[6].slice(5, 7))}/${Number(dates[6].slice(8))}` : '';
  } });
  icons();
  try {
    const data = await getCatalog(); courses = data.courses.map(({ capacity, enrolled, ...course }) => course); meta = data.meta;
    if (!courses.length) throw new Error('课程库为空');
    courseMap = new Map(courses.map(c => [c.id, c])); storageKey = `ucas-planner-v1-${meta.termId}`;
    restore();
    for (const key of ['academy', 'campus', 'attribute']) {
      const values = [...new Set(courses.map(c => c[key] || '未标注'))].sort((a, b) => a.localeCompare(b, 'zh-CN'));
      $(key).insertAdjacentHTML('beforeend', values.map(value => `<option value="${esc(value)}">${esc(value)}</option>`).join(''));
    }
    termWeeks = Math.max(20, ...courses.flatMap(c => c.sessions.flatMap(s => s.weeks)));
    $('week').innerHTML = (isNative ? '' : '<option value="0">全学期</option>') + Array.from({ length: termWeeks }, (_, i) => `<option value="${i + 1}">第 ${i + 1} 周</option>`).join('');
    teachingWeek = isNative ? currentTeachingWeek(semesterStart, termWeeks).week : Math.min(teachingWeek, termWeeks);
    $('week').value = String(teachingWeek);
    $('snapshot-label').textContent = `数据快照 ${new Date(meta.fetchedAt).toLocaleDateString('zh-CN')} · ${courses.length.toLocaleString()} 门课程`;
    $('term-label').textContent = meta.term.replace('学年(秋)第一学期', ' 秋季');
    bindEvents(); changeView(isNative ? 'timetable' : 'catalog');
    setupPlatform({ onResume: jumpToCurrentWeek, onBack: () => {
      if (closePicker()) return true;
      if ($('modal').open) { $('modal').close(); return true; }
      if ($('plan-menu').open) { $('plan-menu').open = false; return true; }
      if (view !== 'timetable') { changeView('timetable'); return true; }
      return false;
    } });
    if (isNative) {
      document.addEventListener('visibilitychange', () => { if (!document.hidden) jumpToCurrentWeek(); });
      setInterval(() => { if (!document.hidden && localDate() !== lastCalendarDate) jumpToCurrentWeek(); }, 30000);
      if (!semesterStart) editSemester();
    }
    document.body.dataset.ready = 'true';
  } catch (error) {
    $('result-count').textContent = error.message;
    $('course-rows').innerHTML = '<tr><td colspan="5" class="loading error-state">无法加载课程，请确认本地服务正在运行后刷新页面。</td></tr>';
    toast('课程加载失败');
  }
}
init();
