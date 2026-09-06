const headings = new Set(['教学目的要求', '预修课程', '大纲内容', '教材信息', '参考书', '课程教师信息']);
const fields = new Set(['课程编码', '英文名称', '课时', '学分', '课程属性', '主讲教师']);
const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

export function parseSyllabus(text = '') {
  const result = { introduction: [], fields: [], sections: [] };
  const lines = String(text).split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  let section;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (headings.has(line)) {
      section = { title: line, lines: [] };
      result.sections.push(section);
    } else if (section) {
      section.lines.push(line);
    } else if (fields.has(line.replace(/[：:]$/, '')) && lines[i + 1] && !headings.has(lines[i + 1]) && !fields.has(lines[i + 1].replace(/[：:]$/, ''))) {
      const values = [lines[++i]];
      while (lines[i + 1] && !headings.has(lines[i + 1]) && !fields.has(lines[i + 1].replace(/[：:]$/, ''))) values.push(lines[++i]);
      result.fields.push({ label: line, value: values.join('\n') });
    } else {
      result.introduction.push(line);
    }
  }
  return result;
}

function renderLines(lines, title) {
  let html = '', listOpen = false;
  const closeList = () => { if (listOpen) { html += '</li></ul>'; listOpen = false; } };
  for (const line of lines) {
    const escaped = escapeHtml(line);
    if (title === '大纲内容' && /^第[一二三四五六七八九十百零〇\d]+章/.test(line)) {
      closeList();
      html += `<h4>${escaped}</h4>`;
    } else if (title === '大纲内容' && /^第[一二三四五六七八九十百零〇\d]+节/.test(line)) {
      html += listOpen ? '</li><li>' : '<ul class="syllabus-lessons"><li>';
      listOpen = true;
      html += `<p>${escaped}</p>`;
    } else if (['教材信息', '参考书'].includes(title) && /^\d+[、.．]$/.test(line)) {
      html += listOpen ? '</li><li>' : '<ul class="syllabus-books"><li>';
      listOpen = true;
      html += `<span class="syllabus-book-number">${escaped}</span>`;
    } else {
      html += `<p>${escaped}</p>`;
    }
  }
  closeList();
  return html || '<p class="syllabus-empty">未公布</p>';
}

export function renderSyllabus(text) {
  if (!String(text || '').trim()) return '<p class="syllabus-empty">教学大纲未公布</p>';
  const syllabus = parseSyllabus(text);
  return syllabus.introduction.map(line => `<p class="syllabus-intro">${escapeHtml(line)}</p>`).join('')
    + (syllabus.fields.length ? `<dl class="syllabus-fields">${syllabus.fields.map(field => `<div><dt>${escapeHtml(field.label)}</dt><dd>${escapeHtml(field.value)}</dd></div>`).join('')}</dl>` : '')
    + syllabus.sections.map(section => `<section><h3>${escapeHtml(section.title)}</h3>${renderLines(section.lines, section.title)}</section>`).join('');
}
