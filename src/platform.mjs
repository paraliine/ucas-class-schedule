import { Capacitor, registerPlugin } from '@capacitor/core';
import { App } from '@capacitor/app';

export const isNative = true;
const Documents = registerPlugin('PlannerDocuments');
const Widgets = registerPlugin('PlannerWidget');
let catalogPromise;

export function getCatalog() {
  catalogPromise ||= fetch('./data/catalog.json').then(response => {
    if (!response.ok) throw new Error('离线课程数据不可用');
    return response.json();
  });
  return catalogPromise;
}

export async function getCourse(id) {
  const response = await fetch(`./data/courses/${encodeURIComponent(id)}.json`);
  if (!response.ok) throw new Error('无法读取课程详情');
  return response.json();
}

export async function saveFile(content, filename, type) {
  const result = await Documents.saveDocument({ content, filename, mimeType: type.split(';')[0] });
  return result.saved;
}

export const printPage = () => Documents.printTimetable();

export function setupPlatform({ onBack, onResume, onWidget }) {
  if (!Capacitor.isNativePlatform()) return;
  const openWidget = ({ url } = {}) => { if (url === 'ucas-schedule://widget') onWidget?.(); };
  App.addListener('appUrlOpen', openWidget);
  App.getLaunchUrl().then(openWidget);
  App.addListener('backButton', () => {
    if (!onBack()) App.minimizeApp();
  });
  App.addListener('appStateChange', ({ isActive }) => { if (isActive) onResume(); });
  document.addEventListener('click', event => {
    const link = event.target.closest('a[href^="https://"]');
    if (link) { event.preventDefault(); Documents.openExternal({ url: link.href }); }
  });
}

// The queue keeps rapid selection changes in order. Browsing weeks does not alter
// this snapshot: widgets always derive their week from the device calendar.
let widgetQueue = Promise.resolve(), lastWidgetSnapshot = '';
export function syncWidgets(snapshot) {
  if (!Capacitor.isNativePlatform()) return Promise.resolve();
  const data = JSON.stringify(snapshot);
  if (data === lastWidgetSnapshot) return widgetQueue;
  lastWidgetSnapshot = data;
  widgetQueue = widgetQueue.catch(() => {}).then(() => Widgets.syncState({ data })).catch(error => {
    if (lastWidgetSnapshot === data) lastWidgetSnapshot = '';
    throw error;
  });
  return widgetQueue;
}

export async function pinWidget(kind) {
  if (!Capacitor.isNativePlatform()) return { supported: false };
  return Widgets.pinWidget({ kind });
}
