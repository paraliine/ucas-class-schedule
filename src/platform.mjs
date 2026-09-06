import { Capacitor, registerPlugin } from '@capacitor/core';
import { App } from '@capacitor/app';

export const isNative = true;
const Documents = registerPlugin('PlannerDocuments');
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

export function setupPlatform({ onBack, onResume }) {
  if (!Capacitor.isNativePlatform()) return;
  App.addListener('backButton', () => {
    if (!onBack()) App.minimizeApp();
  });
  App.addListener('appStateChange', ({ isActive }) => { if (isActive) onResume(); });
  document.addEventListener('click', event => {
    const link = event.target.closest('a[href^="https://"]');
    if (link) { event.preventDefault(); Documents.openExternal({ url: link.href }); }
  });
}
