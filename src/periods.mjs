export const PERIOD_TIMES = [
  ['08:30', '09:15'], ['09:20', '10:05'], ['10:25', '11:10'],
  ['11:15', '12:00'], ['13:30', '14:15'], ['14:20', '15:05'],
  ['15:25', '16:10'], ['16:15', '17:00'], ['17:05', '17:50'],
  ['18:30', '19:15'], ['19:20', '20:05'], ['20:15', '21:00'],
  ['21:05', '21:50'],
];

export function formatPeriodTimes(periods) {
  const ordered = [...new Set(periods)].sort((a, b) => a - b);
  if (!ordered.length || ordered.some(period => !Number.isInteger(period) || !PERIOD_TIMES[period - 1])) return '';
  const ranges = [];
  for (const period of ordered) {
    const last = ranges.at(-1);
    if (last && last[1] + 1 === period) last[1] = period;
    else ranges.push([period, period]);
  }
  return ranges.map(([start, end]) => `${PERIOD_TIMES[start - 1][0]} - ${PERIOD_TIMES[end - 1][1]}`).join(' / ');
}
