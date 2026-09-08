export function nextPlanName(plans) {
  const numbers = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十',
    '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十'];
  const names = new Set(plans.map(plan => plan.name));
  const name = numbers.map(number => `方案${number}`).find(candidate => !names.has(candidate));
  if (!name) throw new Error('最多保留 20 个方案');
  return name;
}

export function hasSchedule(course) {
  return course.sessions.length > 0 && course.sessions.every(s => s.day && s.periods.length && s.weeks.length);
}

export function overlaps(a, b) {
  return Boolean(a.day && a.day === b.day && a.periods.some(p => b.periods.includes(p)) && a.weeks.some(w => b.weeks.includes(w)));
}

export function conflicts(course, selected) {
  return selected.filter(other => other.id !== course.id && course.sessions.some(a => other.sessions.some(b => overlaps(a, b))));
}

export function conflictPairs(selected) {
  return selected.flatMap((course, i) => conflicts(course, selected.slice(i + 1)).map(other => [course, other]));
}

export function matchCourseCodes(text, courses) {
  if (text.length > 20000) throw new Error('输入过长，请分批添加');
  const normalize = code => code.normalize('NFKC').trim().toUpperCase();
  const tokens = normalize(text).split(/[\s,，;；、|]+/).filter(Boolean);
  const codes = [...new Set(tokens)];
  if (!codes.length) throw new Error('请输入课程编码');
  if (codes.length > 300) throw new Error('每次最多匹配 300 个课程编码');
  const byCode = new Map();
  for (const course of courses) {
    const code = normalize(course.code);
    if (!byCode.has(code)) byCode.set(code, []);
    byCode.get(code).push(course);
  }
  return { duplicates: tokens.length - codes.length, groups: codes.map(code => ({ code, courses: byCode.get(code) || [] })) };
}

export function reviewCourseBatch(candidates, selected) {
  const existing = new Set(selected.map(course => course.id));
  const incoming = [...new Map(candidates.map(course => [course.id, course])).values()].filter(course => !existing.has(course.id));
  const incomingIds = new Set(incoming.map(course => course.id));
  const combined = [...selected, ...incoming];
  const touchesBatch = pair => pair.some(course => incomingIds.has(course.id));
  return {
    incoming,
    overLimit: combined.length > 300,
    conflicts: conflictPairs(combined).filter(touchesBatch),
    duplicates: combined.flatMap((course, i) => combined.slice(i + 1).filter(other => courseFamily(course) === courseFamily(other)).map(other => [course, other])).filter(touchesBatch),
    unknown: incoming.filter(course => !hasSchedule(course)),
  };
}

export function courseFamily(course) {
  return course.code.replace(/-\d+$/, '').replace(/[HY]$/, '');
}

export function summary(selected) {
  return { count: selected.length, credits: selected.reduce((sum, c) => sum + c.credits, 0),
    hours: selected.reduce((sum, c) => sum + c.hours, 0), conflicts: conflictPairs(selected),
    unknown: selected.filter(c => !hasSchedule(c)).length };
}

export function filterCourses(courses, filters, selected) {
  const words = (filters.query || '').trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return courses.filter(c => {
    const text = `${c.name} ${c.code} ${c.chief} ${c.teachers} ${c.academy}`.toLocaleLowerCase();
    return words.every(word => text.includes(word)) &&
      (!filters.academy || c.academy === filters.academy) &&
      (!filters.campus || (c.campus || '未标注') === filters.campus) &&
      (!filters.attribute || c.attribute === filters.attribute) &&
      (!filters.day || c.sessions.some(s => s.day === Number(filters.day))) &&
      (!filters.noConflict || (hasSchedule(c) && conflicts(c, selected).length === 0));
  });
}

export function csvCell(value) {
  let text = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}

export function validateImport(value, courseMap, termId, { discardMissing = false } = {}) {
  if (!value || value.version !== 1 || String(value.termId) !== String(termId) || !Array.isArray(value.plans) || !value.plans.length || value.plans.length > 20) {
    throw new Error('方案格式或学期不匹配');
  }
  return value.plans.map((p, i) => {
    if (!p || typeof p.name !== 'string' || !p.name.trim() || !Array.isArray(p.ids) || p.ids.length > 300 || p.ids.some(id => typeof id !== 'string' || (!discardMissing && !courseMap.has(id)))) {
      throw new Error(`第 ${i + 1} 个方案含有无效课程或名称`);
    }
    return { id: crypto.randomUUID(), name: p.name.trim().slice(0, 40), ids: [...new Set(p.ids.filter(id => courseMap.has(id)))] };
  });
}
