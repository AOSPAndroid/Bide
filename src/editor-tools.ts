export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 8;
export const clampZoom = (value: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number.isFinite(value) ? value : 1));
export const fitZoom = (width: number, height: number, availableWidth: number, availableHeight: number) => clampZoom(Math.min((availableWidth - 120) / width, (availableHeight - 100) / height, 1.6));
export function markerColor(hex: string, opacity: number) {
  const rgb = /^#[a-f\d]{6}$/i.test(hex) ? hex : '#ffe066';
  return `rgba(${parseInt(rgb.slice(1, 3), 16)},${parseInt(rgb.slice(3, 5), 16)},${parseInt(rgb.slice(5, 7), 16)},${Math.min(1, Math.max(0.05, opacity / 100))})`;
}
