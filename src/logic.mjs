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

export function validateImport(value, courseMap, termId) {
  if (!value || value.version !== 1 || String(value.termId) !== String(termId) || !Array.isArray(value.plans) || !value.plans.length || value.plans.length > 20) {
    throw new Error('方案格式或学期不匹配');
  }
  return value.plans.map((p, i) => {
    if (!p || typeof p.name !== 'string' || !p.name.trim() || !Array.isArray(p.ids) || p.ids.length > 300 || p.ids.some(id => typeof id !== 'string' || !courseMap.has(id))) {
      throw new Error(`第 ${i + 1} 个方案含有无效课程或名称`);
    }
    return { id: crypto.randomUUID(), name: p.name.trim().slice(0, 40), ids: [...new Set(p.ids)] };
  });
}
