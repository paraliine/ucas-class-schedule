// Allocate visual lanes even for alternating weeks, while flagging only real conflicts.
export function layoutSchedule(courses, week) {
  const days = Array.from({ length: 7 }, () => []);
  courses.forEach((course, color) => {
    const grouped = new Map();
    for (const session of course.sessions) {
      if (!session.day || !session.periods.length || (week && !session.weeks.includes(week))) continue;
      const periods = [...new Set(session.periods)].sort((a, b) => a - b);
      const ranges = [];
      for (const period of periods) {
        const last = ranges[ranges.length - 1];
        if (last && last[1] + 1 === period) last[1] = period;
        else ranges.push([period, period]);
      }
      for (const [start, end] of ranges) {
        const key = `${session.day}:${start}:${end}`;
        if (!grouped.has(key)) grouped.set(key, { id: course.id, course, color, day: session.day, start, end, weeks: [], rooms: [], conflict: false });
        const event = grouped.get(key);
        event.weeks = [...new Set([...event.weeks, ...session.weeks])];
        event.rooms = [...new Set([...event.rooms, session.room].filter(Boolean))];
      }
    }
    for (const event of grouped.values()) days[event.day - 1].push(event);
  });
  for (const events of days) {
    events.sort((a, b) => a.start - b.start || b.end - a.end || a.id.localeCompare(b.id));
    let cluster = [], clusterEnd = 0, lanes = [];
    const finish = () => { for (const event of cluster) event.lanes = lanes.length; };
    for (const event of events) {
      if (event.start > clusterEnd) { finish(); cluster = []; lanes = []; }
      let lane = lanes.findIndex(end => end < event.start);
      if (lane === -1) lane = lanes.length;
      lanes[lane] = event.end;
      event.lane = lane;
      for (const other of cluster) {
        if (event.id !== other.id && event.start <= other.end && event.weeks.some(w => other.weeks.includes(w))) {
          event.conflict = other.conflict = true;
        }
      }
      cluster.push(event);
      clusterEnd = Math.max(...cluster.map(e => e.end));
    }
    finish();
  }
  return days;
}
