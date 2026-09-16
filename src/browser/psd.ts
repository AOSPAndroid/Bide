import { readPsd, writePsd, type Layer, type Psd } from 'ag-psd';
import { FabricImage, FabricObject, StaticCanvas } from 'fabric';
import { blankPage, uid, type Page } from '../model';

import { blendModes } from './layer-utils';

// Limit imports before image allocation. This editor currently operates on 8-bit RGB rasters.
export function validatePsdHeader(bytes: Uint8Array) {
  if (bytes.length < 26) throw new Error('This PSD file is incomplete.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (String.fromCharCode(...bytes.subarray(0, 4)) !== '8BPS' || view.getUint16(4) !== 1) throw new Error('Open an 8-bit RGB PSD. PSB files are not yet supported.');
  const height = view.getUint32(14), width = view.getUint32(18);
  if (!width || !height || Math.max(width, height) > 5000 || width * height > 16000000) throw new Error('PSD import supports up to 5000 pixels per side and 16 megapixels.');
  if (view.getUint16(22) !== 8 || view.getUint16(24) !== 3) throw new Error('Convert this Photoshop document to 8-bit RGB before opening it in bide.');
}

export function requiresComposite(psd: Psd): boolean {
  const advanced = (layer: Layer): boolean => !!(layer.children || layer.mask || layer.realMask || layer.vectorMask || layer.clipping || layer.effects || layer.adjustment || layer.placedLayer || (layer.blendMode && !blendModes[layer.blendMode]));
  return !!psd.children?.some(advanced);
}

export async function importPsd(file: File): Promise<{ page: Page; notice: string }> {
  if (file.size > 150 * 1024 * 1024) throw new Error('Maximum PSD file size is 150 MB.');
  const data = new Uint8Array(await file.arrayBuffer()); validatePsdHeader(data);
  const psd = readPsd(data, { skipThumbnail: true, skipLinkedFilesData: true, totalMemoryLimit: 384 * 1024 * 1024 });
  const page = blankPage(psd.width, psd.height); page.name = file.name.replace(/\.psd$/i, '');
  const objects: FabricObject[] = [];
  const flattened = requiresComposite(psd) || !psd.children?.length;
  if (flattened) {
    if (!psd.canvas) throw new Error('This PSD needs a saved composite preview. In Photoshop, save it with “Maximize Compatibility” enabled.');
    const image = new FabricImage(psd.canvas, { left: 0, top: 0 }); Object.assign(image, { id: uid(), name: 'PSD composite (flattened)' }); objects.push(image);
  } else {
    for (const layer of psd.children!) {
      if (!layer.canvas) continue;
      const image = new FabricImage(layer.canvas, { left: layer.left || 0, top: layer.top || 0, opacity: layer.opacity ?? 1, visible: !layer.hidden, globalCompositeOperation: blendModes[layer.blendMode || 'normal'] });
      Object.assign(image, { id: uid(), name: layer.name || 'PSD layer' }); objects.push(image);
    }
    if (!objects.length) throw new Error('No raster layer previews were found in this PSD. Save it with compatibility previews enabled.');
  }
  page.canvas = { objects: objects.map(o => o.toObject()) };
  return { page, notice: flattened ? 'Complex PSD opened as its flattened composite preview. Photoshop masks, effects and smart objects are not editable.' : `PSD opened with ${objects.length} raster layers. Text and vector layers use their saved pixel previews.` };
}

export async function exportPsd(page: Page): Promise<Blob> {
  if (page.source) throw new Error('PSD export currently supports design pages. Export a PDF page as PNG and reopen it to create a raster design.');
  const width = Math.round(page.width), height = Math.round(page.height);
  const canvas = new StaticCanvas(undefined, { width, height });
  try {
    await canvas.loadFromJSON(page.canvas); canvas.backgroundColor = page.color; canvas.renderAll();
    const objects = canvas.getObjects();
    if (width * height * (objects.length + 2) > 64000000) throw new Error('This layered PSD would use too much memory. Reduce canvas size or merge layers first.');
    const composite = canvas.toCanvasElement(1);
    const state = objects.map(o => ({ visible: o.visible, opacity: o.opacity, blend: o.globalCompositeOperation }));
    objects.forEach(o => o.set({ visible: false })); canvas.renderAll();
    const children: Layer[] = [{ name: 'Page background', canvas: canvas.toCanvasElement(1), top: 0, left: 0 }];
    canvas.backgroundColor = '';
    for (let i = 0; i < objects.length; i++) {
      const o = objects[i], prior = state[i]; o.set({ visible: true, opacity: 1, globalCompositeOperation: 'source-over' }); canvas.renderAll();
      children.push({ name: (o as FabricObject & { name?: string }).name || `Layer ${i + 1}`, top: 0, left: 0, canvas: canvas.toCanvasElement(1), hidden: !prior.visible, opacity: prior.opacity, blendMode: (Object.keys(blendModes).find(key => blendModes[key] === prior.blend) || 'normal') as Layer['blendMode'] });
      o.set({ visible: false });
    }
    return new Blob([writePsd({ width, height, children, canvas: composite }, { trimImageData: true, noBackground: true })], { type: 'image/vnd.adobe.photoshop' });
  } finally { await canvas.dispose(); }
}
