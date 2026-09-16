import { Circle, Rect, Textbox, FabricObject } from 'fabric';
import { uuid } from './browser/crypto';

FabricObject.customProperties = ['id', 'name', 'diagramXml'];
// The editor's coordinates use top-left anchors. Fabric 7 defaults to centered anchors.
Object.assign(FabricObject.ownDefaults, { originX: 'left', originY: 'top', cornerColor: '#ffffff', cornerStrokeColor: '#0076a8', borderColor: '#00aeef', cornerSize: 9, transparentCorners: false, padding: 3 });

export type Page = { id: string; name: string; width: number; height: number; color: string; source?: string; index: number; canvas: Record<string, unknown>; thumb?: string };
export type Project = { version: 1; name: string; pages: Page[]; sources: Record<string, string> };
export const uid = uuid;
export const blankPage = (width = 595, height = 842): Page => ({ id: uid(), name: 'Untitled page', width, height, color: '#ffffff', index: 0, canvas: { objects: [] } });
export function demoProject(): Project {
  const objects: FabricObject[] = [];
  const add = (o: FabricObject, name: string) => { Object.assign(o, { id: uid(), name }); objects.push(o); };
  const text = (s: string, x: number, y: number, size: number, width: number, fill = '#163b34', extra = {}) => new Textbox(s, { left: x, top: y, width, fontSize: size, fontFamily: 'Arial', fill, lineHeight: 0.98, ...extra });
  add(new Rect({ left: 0, top: 0, width: 595, height: 842, fill: '#f1efe7', strokeWidth: 0 }), 'Warm paper');
  add(text('FIELDNOTES', 44, 36, 12, 280, '#244b40', { fontWeight: 'bold', charSpacing: 190 }), 'Studio wordmark');
  add(text('VOL. 01 / 2026', 427, 38, 9, 145, '#244b40', { charSpacing: 80 }), 'Issue number');
  add(new Rect({ left: 44, top: 72, width: 506, height: 1, fill: '#aab6a8', strokeWidth: 0 }), 'Top rule');
  add(text('Make room\nfor what’s\nnext.', 40, 109, 67, 505, '#173e33', { fontWeight: 'bold', charSpacing: -55, lineHeight: 0.99 }), 'Make room for what’s next.');
  add(text('A little space. A fresh perspective.\nAn entirely new beginning.', 46, 345, 14, 460, '#65766b', { lineHeight: 1.45 }), 'Introduction');
  add(new Rect({ left: 44, top: 420, width: 506, height: 294, rx: 3, ry: 3, fill: '#b9d1b0', strokeWidth: 0 }), 'Sage panel');
  add(new Circle({ left: 217, top: 444, radius: 120, fill: '#234e3e', strokeWidth: 0 }), 'Forest circle');
  add(new Circle({ left: 108, top: 460, radius: 101, fill: '#e3ebcf', strokeWidth: 0 }), 'Light circle');
  add(new Circle({ left: 125, top: 477, radius: 84, fill: '#8fba94', strokeWidth: 0 }), 'Sage circle');
  add(new Rect({ left: 44, top: 651, width: 506, height: 63, fill: '#b9d1b0', strokeWidth: 0 }), 'Horizon');
  add(text('IDEAS TAKE SHAPE HERE.', 62, 677, 9, 350, '#244b40', { charSpacing: 140 }), 'Panel caption');
  add(text('DESIGNED TO BEGIN AGAIN', 44, 757, 9, 380, '#536657', { charSpacing: 110 }), 'Footer');
  add(text('01', 519, 754, 14, 30, '#244b40'), 'Page number');
  const page = blankPage();
  page.name = 'A fresh perspective';
  page.canvas = { version: '6.7.1', objects: objects.map(o => o.toObject()) };
  return { version: 1, name: 'A fresh perspective', pages: [page], sources: {} };
}


export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
export const safeName = (name: string) => name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').trim() || 'Untitled';

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    // Keep the original storage key so the bide rename preserves saved work.
    const open = indexedDB.open('folio-studio', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('projects');
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
}
export async function autosave(project: Project) {
  return saveLocal('current', project);
}
export async function saveLocal(key: string, value: unknown) {
  const database = await db();
  return new Promise<void>((resolve, reject) => {
    const tx = database.transaction('projects', 'readwrite');
    tx.objectStore('projects').put(value, key);
    tx.oncomplete = () => { database.close(); resolve(); };
    tx.onerror = () => { database.close(); reject(tx.error); };
  });
}
export async function restoreLocal(): Promise<Project | undefined> {
  return loadLocal<Project>('current');
}
export async function loadLocal<T>(key: string): Promise<T | undefined> {
  const database = await db();
  return new Promise((resolve, reject) => {
    const read = database.transaction('projects').objectStore('projects').get(key);
    read.onsuccess = () => { database.close(); resolve(read.result); };
    read.onerror = () => { database.close(); reject(read.error); };
  });
}
