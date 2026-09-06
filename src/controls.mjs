import { calendarDay, localDate } from './semester.mjs';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = name => `<i data-lucide="${name}"></i>`;
const triggers = new Map();
let picker, returnFocus, getWeekDetail = () => '';

export function initControls({ weekDetail }) {
  getWeekDetail = weekDetail;
  picker = document.createElement('dialog');
  picker.id = 'control-picker';
  picker.className = 'control-picker';
  picker.setAttribute('aria-labelledby', 'picker-title');
  document.body.append(picker);
  picker.addEventListener('click', event => { if (event.target === picker || event.target.closest('[data-picker-close]')) closePicker(); });
  picker.addEventListener('cancel', event => { event.preventDefault(); closePicker(); });
  picker.addEventListener('close', () => {
    document.body.classList.remove('picker-open');
    returnFocus?.setAttribute('aria-expanded', 'false');
    if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
  });
}

export function closePicker() {
  if (!picker?.open) return false;
  picker.close();
  return true;
}

function showPicker(title, trigger) {
  closePicker();
  returnFocus = trigger;
  trigger.setAttribute('aria-expanded', 'true');
  picker.innerHTML = `<header class="picker-header"><h2 id="picker-title">${esc(title)}</h2><button type="button" class="icon-button" data-picker-close title="关闭" aria-label="关闭选择器">${icon('x')}</button></header><div class="picker-content"></div>`;
  document.body.classList.add('picker-open');
  picker.showModal();
}

function paintIcons() { window.lucide?.createIcons({ root: picker }); }

function renderChoices(options, value, choose, { grid = false, searchable = false, detail = () => '' } = {}) {
  const content = picker.querySelector('.picker-content');
  content.innerHTML = `${searchable ? '<div class="picker-search"><i data-lucide="search"></i><input type="text" id="picker-search" placeholder="搜索" aria-label="搜索选项" autocomplete="off"></div>' : ''}<div class="picker-options${grid ? ' picker-grid' : ''}" role="listbox" aria-labelledby="picker-title"></div><p class="picker-empty" hidden>没有匹配的选项</p>`;
  const list = content.querySelector('.picker-options');
  const draw = (query = '') => {
    const filtered = options.filter(option => option.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
    list.innerHTML = filtered.map(option => `<button type="button" class="picker-option" role="option" data-value="${esc(option.value)}" aria-selected="${option.value === value}" ${option.disabled ? 'disabled' : ''}><span>${esc(option.label)}${detail(option.value) ? `<small>${esc(detail(option.value))}</small>` : ''}</span>${grid ? '' : icon('check')}</button>`).join('');
    content.querySelector('.picker-empty').hidden = filtered.length !== 0;
    paintIcons();
  };
  draw();
  content.querySelector('input')?.addEventListener('input', event => draw(event.target.value));
  list.addEventListener('click', event => {
    const button = event.target.closest('[data-value]');
    if (button && !button.disabled) choose(button.dataset.value);
  });
  list.addEventListener('keydown', event => {
    const buttons = [...list.querySelectorAll('button:not(:disabled)')];
    const index = buttons.indexOf(document.activeElement);
    const offset = ({ ArrowDown: grid ? 4 : 1, ArrowUp: grid ? -4 : -1, ArrowRight: 1, ArrowLeft: -1 })[event.key];
    if (offset) { event.preventDefault(); buttons[Math.min(buttons.length - 1, Math.max(0, index + offset))]?.focus(); }
  });
  requestAnimationFrame(() => list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }));
}

function openSelect(select, trigger) {
  const isWeek = select.id === 'week' || select.id === 'export-week';
  showPicker(select.getAttribute('aria-label') || '请选择', trigger);
  renderChoices([...select.options].map(option => ({ label: option.textContent, value: option.value, disabled: option.disabled })), select.value, value => {
    select.value = value;
    closePicker();
    select.dispatchEvent(new Event('change', { bubbles: true }));
    syncControls();
  }, { grid: isWeek, searchable: !isWeek && select.options.length > 8, detail: isWeek ? getWeekDetail : undefined });
}

function openDate(input) {
  let cursor = new Date(calendarDay(input.value) ?? calendarDay(localDate()));
  const min = input.getAttribute('min') || '1900-01-01', max = input.getAttribute('max') || '2100-12-31';
  const choose = value => {
    input.value = value;
    input.removeAttribute('aria-invalid');
    closePicker();
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  };
  showPicker('学期开始日期', input);
  const render = () => {
    const year = cursor.getUTCFullYear(), month = cursor.getUTCMonth();
    const first = new Date(Date.UTC(year, month, 1));
    const offset = (first.getUTCDay() + 6) % 7;
    const grid = Array.from({ length: 42 }, (_, i) => {
      const date = new Date(Date.UTC(year, month, i - offset + 1)), value = date.toISOString().slice(0, 10);
      return `<button type="button" class="calendar-day${date.getUTCMonth() !== month ? ' outside-month' : ''}${value === localDate() ? ' today' : ''}" data-date="${value}" aria-label="${value}" aria-pressed="${value === input.value}" ${value < min || value > max ? 'disabled' : ''}>${date.getUTCDate()}</button>`;
    }).join('');
    picker.querySelector('.picker-content').innerHTML = `<div class="calendar-toolbar"><button type="button" class="icon-button" id="calendar-prev" aria-label="上个月" title="上个月" ${year === Number(min.slice(0, 4)) && month === 0 ? 'disabled' : ''}>${icon('chevron-left')}</button><div><button type="button" id="calendar-year" aria-label="选择年份">${year} 年${icon('chevron-down')}</button><button type="button" id="calendar-month" aria-label="选择月份">${month + 1} 月${icon('chevron-down')}</button></div><button type="button" class="icon-button" id="calendar-next" aria-label="下个月" title="下个月" ${year === Number(max.slice(0, 4)) && month === 11 ? 'disabled' : ''}>${icon('chevron-right')}</button></div><div class="calendar-grid">${['一', '二', '三', '四', '五', '六', '日'].map(day => `<span class="calendar-weekday">${day}</span>`).join('')}${grid}</div><div class="calendar-footer"><button type="button" class="button secondary" id="calendar-today" ${localDate() < min || localDate() > max ? 'disabled' : ''}>今天</button></div>`;
    picker.querySelector('#calendar-prev').onclick = () => { cursor = new Date(Date.UTC(year, month - 1, 1)); render(); };
    picker.querySelector('#calendar-next').onclick = () => { cursor = new Date(Date.UTC(year, month + 1, 1)); render(); };
    picker.querySelector('#calendar-today').onclick = () => choose(localDate());
    picker.querySelector('.calendar-grid').onclick = event => { const day = event.target.closest('[data-date]'); if (day && !day.disabled) choose(day.dataset.date); };
    picker.querySelector('#calendar-year').onclick = () => {
      const start = Number(min.slice(0, 4)), end = Number(max.slice(0, 4));
      renderChoices(Array.from({ length: end - start + 1 }, (_, i) => ({ value: String(start + i), label: `${start + i} 年` })), String(year), value => { cursor = new Date(Date.UTC(Number(value), month, 1)); render(); }, { grid: true });
    };
    picker.querySelector('#calendar-month').onclick = () => renderChoices(Array.from({ length: 12 }, (_, i) => ({ value: String(i), label: `${i + 1} 月` })), String(month), value => { cursor = new Date(Date.UTC(year, Number(value), 1)); render(); }, { grid: true });
    paintIcons();
  };
  render();
}

export function syncControls() {
  if (!picker) return;
  for (const [select, trigger] of triggers) {
    if (!select.isConnected) { trigger.remove(); triggers.delete(select); }
  }
  document.querySelectorAll('select').forEach(select => {
    let trigger = triggers.get(select);
    if (!trigger) {
      select.classList.add('custom-select-source');
      select.setAttribute('aria-hidden', 'true');
      select.tabIndex = -1;
      trigger = document.createElement('button');
      trigger.type = 'button';
      trigger.className = 'select-trigger';
      trigger.id = `${select.id}-trigger`;
      trigger.setAttribute('aria-haspopup', 'dialog');
      trigger.setAttribute('aria-expanded', 'false');
      trigger.innerHTML = `<span></span>${icon('chevron-down')}`;
      select.after(trigger);
      trigger.addEventListener('click', () => openSelect(select, trigger));
      triggers.set(select, trigger);
    }
    trigger.querySelector('span').textContent = select.selectedOptions[0]?.textContent || '请选择';
    trigger.setAttribute('aria-label', select.getAttribute('aria-label') || '请选择');
    trigger.disabled = select.disabled || !select.options.length;
  });
  document.querySelectorAll('input[type="date"]').forEach(input => {
    input.type = 'text';
    input.readOnly = true;
    input.classList.add('date-trigger');
    input.placeholder = '选择日期';
    input.setAttribute('aria-haspopup', 'dialog');
    input.setAttribute('aria-expanded', 'false');
    input.addEventListener('click', () => openDate(input));
    input.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openDate(input); } });
  });
  const search = document.getElementById('search');
  if (search && !document.getElementById('search-clear')) {
    const clear = document.createElement('button');
    clear.type = 'button'; clear.id = 'search-clear'; clear.className = 'icon-button';
    clear.setAttribute('aria-label', '清空搜索'); clear.title = '清空搜索'; clear.innerHTML = icon('x');
    search.after(clear);
    const update = () => { clear.style.visibility = search.value ? 'visible' : 'hidden'; };
    clear.addEventListener('click', () => { search.value = ''; search.dispatchEvent(new Event('input', { bubbles: true })); search.focus(); });
    search.addEventListener('input', update); update();
  }
  if (search) document.getElementById('search-clear').style.visibility = search.value ? 'visible' : 'hidden';
  document.querySelectorAll('form').forEach(form => { form.noValidate = true; });
}
