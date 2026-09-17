import { Capacitor, registerPlugin } from '@capacitor/core';
import { App } from '@capacitor/app';
import { createWidgetSync } from './widget-sync.mjs';

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

const syncNativeWidgets = createWidgetSync(data => Widgets.syncState({ data }), () => Widgets.refresh());
export function syncWidgets(snapshot, options) {
  if (!Capacitor.isNativePlatform()) return Promise.resolve();
  return syncNativeWidgets(snapshot, options);
}

export async function pinWidget(kind) {
  if (!Capacitor.isNativePlatform()) return { supported: false };
  return Widgets.pinWidget({ kind });
}
