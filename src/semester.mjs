const DAY = 86400000;

// Compare calendar days in UTC so local DST changes cannot shift week boundaries.
export function calendarDay(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.getTime();
}

export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function weekDates(start, week) {
  const day = calendarDay(start);
  if (day === null) return [];
  const monday = day - ((new Date(day).getUTCDay() + 6) % 7) * DAY;
  return Array.from({ length: 7 }, (_, i) => new Date(monday + ((week - 1) * 7 + i) * DAY).toISOString().slice(0, 10));
}

export function currentTeachingWeek(start, maxWeek, today = localDate()) {
  const monday = weekDates(start, 1)[0], now = calendarDay(today);
  if (!monday || now === null) return { week: 1, state: 'unset' };
  const raw = Math.floor((now - calendarDay(monday)) / (7 * DAY)) + 1;
  return { week: Math.min(maxWeek, Math.max(1, raw)), state: raw < 1 ? 'before' : raw > maxWeek ? 'after' : 'during' };
}
