import { PERIOD_TIMES, formatPeriodTimes } from './periods.mjs';

// Self-contained runtime is embedded in exported HTML, with no external assets.
function timetableRuntime() {
  const data = JSON.parse(document.getElementById('schedule-data').textContent);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dayNames = ['一', '二', '三', '四', '五', '六', '日'];
  const maxWeek = Math.max(20, data.termWeeks || 0, ...data.courses.flatMap(c => c.sessions.flatMap(s => s.weeks)));
  const maxPeriod = Math.max(data.periodTimes.length, ...data.courses.flatMap(c => c.sessions.flatMap(s => s.periods)));
  const weekSelect = document.getElementById('week');
  weekSelect.innerHTML = '<option value="0">全学期</option>' + Array.from({ length: maxWeek }, (_, i) => `<option value="${i + 1}">第 ${i + 1} 周</option>`).join('');
  weekSelect.value = String(Math.max(0, Math.min(data.week ?? 1, maxWeek)));
  document.getElementById('title').textContent = data.name;
  document.getElementById('term').textContent = data.term;
  document.getElementById('summary').textContent = `${data.courses.length} 门课程 · ${data.courses.reduce((n, c) => n + c.credits, 0)} 学分`;
  document.getElementById('snapshot').textContent = `导出时间：${new Date(data.exportedAt).toLocaleString('zh-CN')} · 本地模拟课表`;
  function render() {
    const week = Number(weekSelect.value);
    document.getElementById('prev').disabled = week <= 1;
    document.getElementById('next').disabled = week === 0 || week >= maxWeek;
    document.getElementById('week-label').textContent = week ? `第 ${week} 周` : '全学期';
    let html = '<div class="head">节次</div>' + dayNames.map(day => `<div class="head">星期${day}</div>`).join('');
    for (let period = 1; period <= maxPeriod; period++) {
      const times = data.periodTimes[period - 1];
      html += `<div class="period"><span>${period}</span>${times ? `<small>${times[0]}<br>${times[1]}</small>` : ''}</div>`;
      for (let day = 1; day <= 7; day++) {
        const events = data.courses.map((c, index) => ({ c, index, sessions: c.sessions.filter(s => s.day === day && s.periods.includes(period) && (!week || s.weeks.includes(week))) })).filter(e => e.sessions.length);
        html += '<div class="cell">' + events.map(event => {
          const clash = events.some(other => other.c.id !== event.c.id && event.sessions.some(a => other.sessions.some(b => a.weeks.some(w => b.weeks.includes(w)))));
          const rooms = [...new Set(event.sessions.map(s => s.room).filter(Boolean))].join(' / ') || '教室未公布';
          const weeks = [...new Set(event.sessions.flatMap(s => s.weeks))].sort((a, b) => a - b).join('、');
          return `<button class="event color-${event.index % 4} ${clash ? 'clash' : ''}" data-course="${esc(event.c.id)}"><strong>${esc(event.c.name)}</strong><span>${esc(rooms)}</span><span>${esc([event.c.chief, event.c.teachers].filter(Boolean).join(' '))}</span>${!week ? `<small>第 ${esc(weeks)} 周</small>` : ''}${clash ? '<small>时间冲突</small>' : ''}</button>`;
        }).join('') + '</div>';
      }
    }
    document.getElementById('grid').innerHTML = html;
    const unknown = data.courses.filter(c => !c.sessions.length || c.sessions.some(s => !s.day || !s.weeks.length || !s.periods.length));
    document.getElementById('unknown').innerHTML = unknown.length ? `<h2>时间未完整公布</h2>${unknown.map(c => `<button class="unknown-course" data-course="${esc(c.id)}">${esc(c.name)}</button>`).join('')}` : '';
    const active = data.courses.filter(c => c.sessions.some(s => !week || s.weeks.includes(week)));
    document.getElementById('active-count').textContent = `${active.length} 门排课`;
  }
  document.getElementById('prev').addEventListener('click', () => { weekSelect.value = String(Math.max(1, Number(weekSelect.value) - 1)); render(); });
  document.getElementById('next').addEventListener('click', () => { weekSelect.value = String(Math.min(maxWeek, Number(weekSelect.value) + 1)); render(); });
  weekSelect.addEventListener('change', render);
  document.getElementById('print').addEventListener('click', () => window.print());
  const modal = document.getElementById('detail');
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-course]');
    if (!button) return;
    const course = data.courses.find(c => c.id === button.dataset.course);
    document.getElementById('detail-title').textContent = course.name;
    document.getElementById('detail-body').innerHTML = `<p>${esc(course.code)}</p><p>${esc(course.academy)} · ${esc(course.campus || '校区未标注')} · ${course.credits} 学分</p><p>${esc([course.chief, course.teachers].filter(Boolean).join(' '))}</p>` + (course.sessions.map(s => `<div class="session"><strong>${esc(s.time)}</strong><p>${esc(s.clockTime)}</p><p>${esc(s.room || '教室未公布')}</p><p>周次：${esc(s.weeksText || '未公布')}</p></div>`).join('') || '<p>上课时间未公布</p>');
    modal.showModal();
  });
  document.getElementById('close').addEventListener('click', () => modal.close());
  modal.addEventListener('click', event => { if (event.target === modal) modal.close(); });
  render();
}

const exportStyle = `
*{box-sizing:border-box}body{margin:0;background:#f5f7f6;color:#283b30;font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;letter-spacing:0}main{max-width:1500px;margin:auto;padding:28px}header{display:flex;justify-content:space-between;align-items:center;gap:16px;border-bottom:1px solid #dce4de;padding-bottom:22px}h1{font-size:25px;margin:5px 0;overflow-wrap:anywhere}h2{font-size:15px}p{margin:5px 0}.eyebrow,#summary,footer{font-size:12px;color:#78897d}.toolbar{display:flex;justify-content:space-between;gap:12px;align-items:center;margin:22px 0}.controls{display:flex;align-items:center;gap:10px}button,select{font:inherit;cursor:pointer;border:1px solid #d9e2dc;border-radius:5px;background:#fff;color:inherit;padding:8px 12px}button:hover{background:#edf4ef}button:disabled{opacity:.4;cursor:default}button:focus-visible,select:focus-visible{outline:2px solid #237354;outline-offset:2px}#week-label{font-size:17px;font-weight:600}#active-count{color:#829086;font-size:12px;margin-left:12px}.scroll{overflow:auto;border:1px solid #dce4de;background:#fff}.grid{display:grid;grid-template-columns:48px repeat(7,minmax(110px,1fr));min-width:900px}.head{background:#edf3ef;text-align:center;padding:13px 4px;font-size:12px}.period{flex-direction:column;gap:3px;font-size:11px;color:#8d9b90;background:#f9fbf9;display:flex;align-items:center;justify-content:center;border-top:1px solid #e6ece8;min-height:85px}.period small{font-size:9px;line-height:1.4;text-align:center;white-space:nowrap;font-variant-numeric:tabular-nums}.cell{min-height:85px;border-top:1px solid #e6ece8;border-left:1px solid #e6ece8;padding:4px;display:flex;flex-direction:column;gap:4px}.event{display:block;width:100%;text-align:left;padding:9px 7px;border:0;border-left:3px solid #77a48b;font-size:12px;overflow-wrap:anywhere;background:#edf5ef;color:#3e684c}.event strong{font-size:12px;font-weight:600;display:block}.event span{display:block;font-size:10px;margin-top:5px}.event small{display:block;font-size:9px;margin-top:5px;opacity:.8}.color-1{background:#edf3fb;border-color:#7e9fc1;color:#486c92}.color-2{background:#f8f3e6;border-color:#b5a265;color:#847138}.color-3{background:#f2eef7;border-color:#a18bb6;color:#7a628e}.event.clash{background:#fbece8;border-color:#c67e6c;color:#a25a48}.unknown-course{margin:0 8px 8px 0;font-size:12px}footer{margin-top:20px}dialog{width:calc(100% - 32px);max-width:650px;border:1px solid #dbe3dd;border-radius:8px;padding:24px;max-height:85vh;color:inherit}dialog::backdrop{background:#15291c66}.detail-head{display:flex;justify-content:space-between;gap:16px;align-items:start}.detail-head h2{font-size:19px;margin:0}.detail-head button{padding:3px 12px;font-size:22px}.session{border-top:1px solid #e5ebe7;padding-top:13px;margin-top:13px;font-size:12px}.session p{overflow-wrap:anywhere}#detail-body{margin-top:15px;font-size:12px}#detail-body>p{overflow-wrap:anywhere}@media(max-width:600px){main{padding:18px 12px}header{align-items:flex-start}h1{font-size:21px}header #summary{max-width:110px;text-align:right}.toolbar{flex-wrap:wrap;gap:14px}.controls{width:100%;justify-content:space-between;gap:5px}.controls button,.controls select{font-size:12px;padding:8px 10px}.grid{min-width:900px}}@media print{body{background:white}main{padding:0}.controls{display:none}.scroll{overflow:visible}.grid{min-width:0;grid-template-columns:38px repeat(7,minmax(0,1fr))}.event{font-size:9px;padding:5px;print-color-adjust:exact}.event strong{font-size:10px}.event span{font-size:8px}.cell,.period{min-height:50px}header{padding-bottom:10px}.toolbar{margin:12px 0}footer{font-size:9px}}
`;

export function buildTimetableHtml({ name, term, courses, week = 1, termWeeks = 20 }) {
  const data = JSON.stringify({ name, term, courses: courses.map(course => ({ ...course, sessions: course.sessions.map(session => ({ ...session, clockTime: formatPeriodTimes(session.periods) })) })), week, termWeeks, periodTimes: PERIOD_TIMES, exportedAt: new Date().toISOString() })
    .replaceAll('<', '\\u003c').replaceAll('>', '\\u003e').replaceAll('&', '\\u0026')
    .replaceAll('\u2028', '\\u2028').replaceAll('\u2029', '\\u2029');
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>国科大 · 个人课表</title><style>${exportStyle}</style></head><body><main><header><div><div class="eyebrow">中国科学院大学 · <span id="term"></span></div><h1 id="title"></h1></div><div id="summary"></div></header><div class="toolbar"><div><span id="week-label"></span><span id="active-count"></span></div><div class="controls"><button id="prev" aria-label="上一周">← 上一周</button><select id="week" aria-label="教学周"></select><button id="next" aria-label="下一周">下一周 →</button><button id="print">打印</button></div></div><div class="scroll"><div id="grid" class="grid"></div></div><section id="unknown"></section><footer id="snapshot"></footer></main><dialog id="detail"><div class="detail-head"><h2 id="detail-title"></h2><button id="close" aria-label="关闭">×</button></div><div id="detail-body"></div></dialog><script type="application/json" id="schedule-data">${data}</script><script>(${timetableRuntime.toString()})();</script></body></html>`;
}
