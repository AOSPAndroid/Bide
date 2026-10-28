export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 8;
export const clampZoom = (value: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number.isFinite(value) ? value : 1));
export const fitZoom = (width: number, height: number, availableWidth: number, availableHeight: number, margin = { x: 120, y: 100 }) => clampZoom(Math.min((availableWidth - margin.x) / width, (availableHeight - margin.y) / height, 1.6));
// Phones and tablets fit the page to the workspace less its padding and page label, with
// a small gap, instead of desktop's fixed margins (which left a third of a phone empty).
export function fitMargin(root: HTMLElement) {
  if (!matchMedia('(max-width: 600px), (pointer: coarse)').matches) return undefined;
  const cs = getComputedStyle(root), label = root.querySelector<HTMLElement>('.artboard-label'), px = (v: string) => parseFloat(v) || 0;
  return { x: px(cs.paddingLeft) + px(cs.paddingRight) + 8, y: px(cs.paddingTop) + px(cs.paddingBottom) + (label ? label.offsetHeight + px(getComputedStyle(label).marginBottom) : 0) + 8 };
}
export function markerColor(hex: string, opacity: number) {
  const rgb = /^#[a-f\d]{6}$/i.test(hex) ? hex : '#ffe066';
  return `rgba(${parseInt(rgb.slice(1, 3), 16)},${parseInt(rgb.slice(3, 5), 16)},${parseInt(rgb.slice(5, 7), 16)},${Math.min(1, Math.max(0.05, opacity / 100))})`;
}
