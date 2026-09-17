// Saving a plan and refreshing a newly placed widget are separate operations.
// Keep both ordered so a launcher callback cannot render an older selection.
export function createWidgetSync(write, refresh) {
  let queue = Promise.resolve(), lastSnapshot = '';
  return (snapshot, { force = false } = {}) => {
    const data = JSON.stringify(snapshot);
    if (data === lastSnapshot) {
      if (force) queue = queue.catch(() => {}).then(refresh);
      return queue;
    }
    lastSnapshot = data;
    queue = queue.catch(() => {}).then(() => write(data)).catch(error => {
      if (lastSnapshot === data) lastSnapshot = '';
      throw error;
    });
    return queue;
  };
}
