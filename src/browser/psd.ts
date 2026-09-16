import { readPsd, writePsd, type Layer, type Psd } from 'ag-psd';
import { FabricImage, FabricObject, Group, StaticCanvas } from 'fabric';
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
  const blended = (layer:Layer):boolean => !!(layer.blendMode && !['normal','pass through'].includes(layer.blendMode)) || !!layer.children?.some(blended);
  const advanced = (layer: Layer): boolean => !!(layer.mask || layer.realMask || layer.vectorMask || layer.clipping || layer.effects || layer.adjustment || layer.placedLayer
    || (layer.blendMode && !blendModes[layer.blendMode] && !(layer.children && layer.blendMode==='pass through'))
    || (layer.children && (!layer.blendMode || layer.blendMode==='pass through') && layer.children.some(blended))
    || layer.children?.some(advanced));
  return !!psd.children?.some(advanced);
}
export function needsFlattenedPsd(objects:FabricObject[]):boolean {
  return objects.some(o=>!Object.values(blendModes).includes(o.globalCompositeOperation)||(o instanceof Group&&needsFlattenedPsd(o.getObjects())));
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
    const convert=(layer:Layer):FabricObject|null=>{
      let object:FabricObject;
      if(layer.children){const children=layer.children.map(convert).filter((o):o is FabricObject=>!!o);if(!children.length)return null;object=new Group(children);}
      else {if(!layer.canvas)return null;object=new FabricImage(layer.canvas,{left:layer.left||0,top:layer.top||0});}
      object.set({opacity:layer.opacity??1,visible:!layer.hidden,globalCompositeOperation:blendModes[layer.blendMode||'normal']||'source-over'});
      Object.assign(object,{id:uid(),name:layer.name||(layer.children?'PSD group':'PSD layer')});return object;
    };
    objects.push(...psd.children!.map(convert).filter((o):o is FabricObject=>!!o));
    if (!objects.length) throw new Error('No raster layer previews were found in this PSD. Save it with compatibility previews enabled.');
  }
  page.canvas = { objects: objects.map(o => o.toObject()) };
  return { page, notice: flattened ? 'Complex PSD opened as its flattened composite preview. Photoshop masks, effects and smart objects are not editable.' : `PSD opened with ${objects.length} top-level layers/groups. Text and vector layers use their saved pixel previews.` };
}

export async function exportPsd(page: Page): Promise<Blob> {
  if (page.source) throw new Error('PSD export currently supports design pages. Export a PDF page as PNG and reopen it to create a raster design.');
  const width = Math.round(page.width), height = Math.round(page.height);
  const canvas = new StaticCanvas(undefined, { width, height });
  try {
    await canvas.loadFromJSON(page.canvas); canvas.backgroundColor = page.color; canvas.renderAll();
    const objects = canvas.getObjects();
    const all:FabricObject[]=[];const collect=(o:FabricObject)=>{all.push(o);if(o instanceof Group)o.getObjects().forEach(collect);};objects.forEach(collect);
    if (width * height * (all.length + 2) > 64000000) throw new Error('This layered PSD would use too much memory. Reduce canvas size or merge layers first.');
    const composite = canvas.toCanvasElement(1);
    if(needsFlattenedPsd(objects))return new Blob([writePsd({width,height,canvas:composite,children:[{name:'Merged appearance (eraser/compositing)',canvas:composite,top:0,left:0}]},{trimImageData:true,noBackground:true})],{type:'image/vnd.adobe.photoshop'});
    const state=new Map(all.map(o=>[o,{visible:o.visible,opacity:o.opacity,globalCompositeOperation:o.globalCompositeOperation}]));
    objects.forEach(o=>o.set({visible:false}));canvas.renderAll();
    const background:Layer={name:'Page background',canvas:canvas.toCanvasElement(1),top:0,left:0};canvas.backgroundColor='';
    const renderLayer=(path:FabricObject[])=>{
      all.forEach(o=>o.set(state.get(o)!));objects.forEach(o=>o.set({visible:false}));
      for(let i=0;i<path.length;i++){const o=path[i];o.set({visible:true,opacity:1,globalCompositeOperation:'source-over'});if(i<path.length-1&&o instanceof Group)o.getObjects().forEach(child=>child.set({visible:child===path[i+1]}));}
      canvas.renderAll();return canvas.toCanvasElement(1);
    };
    const exportLayer=(o:FabricObject,parents:FabricObject[]):Layer=>{
      const prior=state.get(o)!,path=[...parents,o];
      const layer:Layer={name:(o as FabricObject&{name?:string}).name||'Layer',hidden:!prior.visible,opacity:prior.opacity,blendMode:(Object.keys(blendModes).find(key=>blendModes[key]===prior.globalCompositeOperation)||'normal') as Layer['blendMode']};
      if(o instanceof Group&&!o.clipPath)layer.children=o.getObjects().map(child=>exportLayer(child,path));
      else Object.assign(layer,{top:0,left:0,canvas:renderLayer(path)});
      return layer;
    };
    const children=[background,...objects.map(o=>exportLayer(o,[]))];
    return new Blob([writePsd({ width, height, children, canvas: composite }, { trimImageData: true, noBackground: true })], { type: 'image/vnd.adobe.photoshop' });
  } finally { await canvas.dispose(); }
}
