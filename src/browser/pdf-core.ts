import { selectPages } from '../page-range';
import {pdfRasterScale} from '../render-budget';
import { digest } from './crypto';
export { selectPages } from '../page-range';
import * as mupdf from 'mupdf';
import formFontUrl from './fonts/LiberationSans-Regular.ttf';

import type {TextRegion} from '../text-regions';
import {rewriteText,verifyRewrite,Unsafe} from './pdf-inplace';
// Export-only dependencies are loaded when conversion is requested.
async function svgToPdf(...args:Parameters<typeof import('./svg-pdf').svgToPdf>){return (await import('./svg-pdf')).svgToPdf(...args);}



// `ocr` lines (page units, top-left origin) become an invisible text layer, so
// scanned and image pages can be searched, selected and read aloud.
import type { FormField, PdfFormField } from '../forms';
import { pdfBox, isChecked } from '../forms';
export type OcrLine = { text: string; left: number; top: number; width: number; height: number };
// `edits`: OCR edits drawn over the page (page units, top-left origin); `text` is
// the new text of an edit made with the page's own letters.
export type PageSpec = { width: number; height: number; source?: string; index: number; svg: string; fonts?:Record<string,string>; ocr?: OcrLine[]; forms?: FormField[]; edits?: (Omit<OcrLine,'text'>&{text?:string;original?:Omit<OcrLine,'text'>})[] };

// Windows-1252 codes for the characters it maps outside Latin-1.
const cp1252: Record<number, number> = {0x20ac:0x80,0x201a:0x82,0x0192:0x83,0x201e:0x84,0x2026:0x85,0x2020:0x86,0x2021:0x87,0x02c6:0x88,0x2030:0x89,0x0160:0x8a,0x2039:0x8b,0x0152:0x8c,0x017d:0x8e,0x2018:0x91,0x2019:0x92,0x201c:0x93,0x201d:0x94,0x2022:0x95,0x2013:0x96,0x2014:0x97,0x02dc:0x98,0x2122:0x99,0x0161:0x9a,0x203a:0x9b,0x0153:0x9c,0x017e:0x9e,0x0178:0x9f};
const winAnsi = (cp: number) => (cp >= 0x20 && cp < 0x7f) || (cp >= 0xa0 && cp <= 0xff) ? cp : cp1252[cp] ?? 0x3f;
// Lines with characters outside Windows-1252 (Cyrillic, Greek, Arabic, CJK…).
const isWinAnsi = (cp: number) => winAnsi(cp) !== 0x3f || cp === 0x3f;
export const needsUnicodeFont = (lines: OcrLine[]) => lines.some(l => Array.from(l.text).some(c => !isWinAnsi(c.codePointAt(0)!)));
const utf16 = (text: string) => 'FEFF' + Array.from(text, c => { const cp = c.codePointAt(0)!; if (cp < 0x10000) return cp.toString(16).padStart(4, '0'); const v = cp - 0x10000; return ((v >> 10) + 0xd800).toString(16) + ((v & 0x3ff) + 0xdc00).toString(16); }).join('');
// Content-stream commands drawing `lines` as invisible (render mode 3) text,
// each stretched horizontally to the width the line occupies on the page.
// Windows-1252 lines use the simple `font`; others use `unicode`, a Type0
// (Identity-H) font. Characters it has no glyph for (Arabic in the built-in
// CJK font) are carried by ActualText, which search and copy read instead.
export function ocrTextCommands(lines: OcrLine[], pageHeight: number, font: mupdf.Font, name = 'OCR', unicode?: { font: mupdf.Font; name: string }) {
  const out: string[] = [];
  for (const line of lines) {
    const text = line.text.replace(/\s+/g, ' ').trim(); if (!text || !(line.width > 0 && line.height > 0)) continue;
    const size = Math.max(1, line.height * 0.8), cps = Array.from(text, c => c.codePointAt(0)!), wide = unicode && cps.some(cp => !isWinAnsi(cp));
    const face = wide ? unicode.font : font, gids = cps.map(cp => face.encodeCharacter(cp));
    const em = gids.reduce((w, gid) => w + (gid || !wide ? face.advanceGlyph(gid, 0) : 0.5), 0);
    const scale = em > 0 ? Math.max(1, Math.min(1000, 100 * line.width / (em * size))) : 100;
    const baseline = pageHeight - (line.top + line.height * 0.8), at = `${scale.toFixed(2)} Tz 1 0 0 1 ${line.left.toFixed(2)} ${baseline.toFixed(2)} Tm`;
    if (wide) {
      const draw = `BT 3 Tr /${unicode.name} ${size.toFixed(2)} Tf ${at} <${gids.map(g => g.toString(16).padStart(4, '0')).join('')}> Tj ET`;
      out.push(gids.includes(0) ? `/Span <</ActualText <${utf16(text)}>>> BDC ${draw} EMC` : draw);
      continue;
    }
    const bytes = cps.map(winAnsi).map(b => b < 0x20 || b > 0x7e || b === 0x28 || b === 0x29 || b === 0x5c ? '\\' + b.toString(8).padStart(3, '0') : String.fromCharCode(b)).join('');
    out.push(`BT 3 Tr /${name} ${size.toFixed(2)} Tf ${at} (${bytes}) Tj ET`);
  }
  return out;
}

export type ExportSpec = { pages: PageSpec[]; title: string; format: string; compression: string; range: string; dpi: number; rotation?: number; password?: string; keepForms?: boolean; crop?: { left: number; top: number; right: number; bottom: number } };

const sources = new Map<string, Uint8Array>();

const MAX_FILE = 150 * 1024 * 1024;

const opts = 'garbage=compact,compress=yes,compress-fonts=yes,compress-images=yes';

export const toBytes = (data: string) => Uint8Array.from(atob(data), c => c.charCodeAt(0));

export function toBase64(bytes: Uint8Array): string { let s=''; for(let i=0;i<bytes.length;i+=32768) s+=String.fromCharCode(...bytes.subarray(i,i+32768)); return btoa(s); }

function bytesOf(buffer: mupdf.Buffer) { try { return buffer.asUint8Array().slice() as Uint8Array<ArrayBuffer>; } finally { buffer.destroy(); } }

function open(data: Uint8Array, type='application/pdf') {

  const d=mupdf.Document.openDocument(data,type);

  if(d.needsPassword()) { d.destroy(); throw new Error('This document is password protected. Unlock it before importing.'); }

  return d;

}

function writePages(doc: mupdf.Document, indexes?: number[]) {

  const buffer=new mupdf.Buffer(), writer=new mupdf.DocumentWriter(buffer,'pdf',opts);

  try {

    for(const i of indexes||Array.from({length:doc.countPages()},(_,i)=>i)) {

      const p=doc.loadPage(i), bounds=p.getBounds();

      const dev=writer.beginPage([0,0,bounds[2]-bounds[0],bounds[3]-bounds[1]]);

      p.run(dev,[1,0,0,1,-bounds[0],-bounds[1]]); dev.close(); dev.destroy(); writer.endPage(); p.destroy();

    }

    writer.close(); return buffer.asUint8Array().slice() as Uint8Array<ArrayBuffer>;

  } finally { writer.destroy(); buffer.destroy(); }

}

export async function importBytes(data: Uint8Array, name: string, password?: string) {

  if(data.byteLength>MAX_FILE)throw new Error('Maximum file size is 150 MB.');

  let bytes=data;

  if (/\.pdf$/i.test(name)) {
    const locked = mupdf.Document.openDocument(bytes, 'pdf') as mupdf.PDFDocument;
    try {
      if (locked.needsPassword()) {
        if (password === undefined) throw new Error('PASSWORD_REQUIRED');
        if (!locked.authenticatePassword(password)) throw new Error('PASSWORD_INCORRECT');
        // Workspace/project data is intentionally decrypted; the password is never persisted.
        bytes = bytesOf(locked.saveToBuffer(opts + ',encrypt=none'));
      }
    } finally { locked.destroy(); }
  }

  if(/\.svg$/i.test(name)) {

    const svg=new TextDecoder().decode(data);validateArtwork(svg);

    const view=svg.match(/viewBox=["']\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)/i);

    const width=Number(svg.match(/\bwidth=["']([\d.]+)/i)?.[1]||view?.[3]||595),height=Number(svg.match(/\bheight=["']([\d.]+)/i)?.[1]||view?.[4]||842);

    return register(await svgToPdf(svg,width,height));

  }

  if(!/\.pdf$/i.test(name)) {

    if(/\.(docx?|xlsx?|pptx?|odt|ods|odp|rtf)$/i.test(name)) throw new Error('Office documents must first pass through the browser Office engine.');

    let type=name.split('.').at(-1)||'';

    if(['txt','md'].includes(type)) {

      const text=new TextDecoder().decode(data).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');

      bytes=new TextEncoder().encode(`<html><head><style>body{font-family:sans-serif;font-size:11pt;margin:40pt}pre{white-space:pre-wrap;font-family:sans-serif}</style></head><body><pre>${text}</pre></body></html>`); type='text/html';

    }

    const doc=open(bytes,type);

    try { doc.layout(595,842,11); bytes=writePages(doc); } finally { doc.destroy(); }

  }

  return register(bytes);

}

export async function register(bytes: Uint8Array) {

  const doc=open(bytes);

  try {

    if(!doc.countPages())throw new Error('This document has no pages.');

    const hash=await digest(bytes);

    const id=[...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('');

    const pages=Array.from({length:doc.countPages()},(_,index)=>{const p=doc.loadPage(index),b=p.getBounds();p.destroy();return {index,width:b[2]-b[0],height:b[3]-b[1]};});

    sources.set(id,bytes.slice());

    return {id,data:toBase64(bytes),pages};

  } finally {doc.destroy();}

}

export async function restore(data: Record<string,string>) {

  for(const [id,encoded]of Object.entries(data)) {

    if(sources.has(id))continue;

    const bytes=toBytes(encoded);

    const hash=await digest(bytes);

    if([...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('')!==id)throw new Error('A project source is corrupted.');

    await register(bytes);

  }

  return {ok:true};

}

// A scanned page's own resolution, in pixels per page unit: the largest image
// covering at least half the page, drawn upright. Letters cut from a render at
// exactly this scale are the scan's own pixels (a render at another scale
// resamples them, and reused letters came out lighter, 29 → 38 on near-black).
export function scanScale(source:string,index:number):number|undefined{
 const data=sources.get(source);if(!data)throw new Error('Reopen the project to restore its PDF pages.');
 const doc=open(data),page=doc.loadPage(index),b=page.getBounds(),area=(b[2]-b[0])*(b[3]-b[1]);let best:{cover:number;scale:number}|undefined;
 const device=new mupdf.Device({fillImage(image,ctm){
  if(Math.abs(ctm[1])>1e-3||Math.abs(ctm[2])>1e-3||ctm[0]<=0)return;
  const w=Math.abs(ctm[0]),h=Math.abs(ctm[3]),cover=w*h/area;if(cover<.5)return;
  const scale=Math.min(image.getWidth()/w,image.getHeight()/h);if(!best||cover>best.cover)best={cover,scale};
 }});
 try{page.run(device,mupdf.Matrix.identity);device.close();return best&&best.scale>=1&&best.scale<=8?best.scale:undefined;}finally{device.destroy();page.destroy();doc.destroy();}
}

export function render(source:string,index:number,scale:number) {

  const data=sources.get(source); if(!data)throw new Error('Reopen the project to restore its PDF pages.');

  const doc=open(data);

  try {const page=doc.loadPage(index),b=page.getBounds();scale=pdfRasterScale(b[2]-b[0],b[3]-b[1],scale);const pix=page.toPixmap(mupdf.Matrix.scale(scale,scale),mupdf.ColorSpace.DeviceRGB,false,true);try{return pix.asPNG().slice() as Uint8Array<ArrayBuffer>;}finally{pix.destroy();page.destroy();}}finally{doc.destroy();}

}



function validateArtwork(svg: string) {

  // SVG processing never fetches outside resources. Permit embedded images and internal IDs only.

  if(/(?:href\s*=\s*["'](?!data:image\/|#)|<!ENTITY|@import|url\(\s*["']?(?!#))/i.test(svg))throw new Error('Artwork must embed its images; external resources are not supported.');

}



// Embed page content as a PDF Form XObject. Copying font resources preserves

// subset-font Unicode maps, unlike repainting PDF text through a drawing device.

function embedPage(output:mupdf.PDFDocument,source:mupdf.PDFDocument,index:number,width:number,height:number) {

 const page=source.loadPage(index),obj=page.getObject(),bounds=page.getBounds(),transform=page.getTransform();

 const box=mupdf.Rect.transform(bounds,mupdf.Matrix.invert(transform));

 const contents=obj.get('Contents'),chunks:Uint8Array[]=[];

 const read=(stream:mupdf.PDFObject)=>{const b=stream.readStream();chunks.push(b.asUint8Array().slice(),new Uint8Array([10]));b.destroy();};

 if(contents.isArray())contents.forEach(read);else if(contents.isStream())read(contents);

 const bytes=new Uint8Array(chunks.reduce((n,c)=>n+c.length,0));let cursor=0;for(const c of chunks){bytes.set(c,cursor);cursor+=c.length;}

 const resources=output.graftObject(obj.getInheritable('Resources'));

 const form=output.addStream(bytes,{Type:'XObject',Subtype:'Form',FormType:1,BBox:box,Resources:resources});

 const group=obj.get('Group');if(!group.isNull())form.put('Group',output.graftObject(group));

 const sx=width/(bounds[2]-bounds[0]),sy=height/(bounds[3]-bounds[1]);

 const matrix=mupdf.Matrix.concat(transform,[sx,0,0,-sy,-bounds[0]*sx,height+bounds[1]*sy]);

 const links=page.getLinks().map(link=>{const value={bounds:mupdf.Rect.transform(link.getBounds(),[sx,0,0,sy,-bounds[0]*sx,-bounds[1]*sy]),uri:link.getURI()};link.destroy();return value;});

 page.destroy();obj.destroy();contents.destroy();resources.destroy();group.destroy();

 return {form,matrix,links};

}

export async function compose(spec: ExportSpec) {

 if(!spec.pages?.length||spec.pages.length>1000)throw new Error('Choose between 1 and 1000 pages.');

 const result=new mupdf.PDFDocument();let ocrFont:{font:mupdf.Font;ref:mupdf.PDFObject}|undefined,ocrUnicode:{font:mupdf.Font;ref:mupdf.PDFObject}|undefined;
 const pageForms:FormField[][]=[];

 try {

  for(const i of selectPages(spec.range,spec.pages.length)) {

   const entry=spec.pages[i];

   if(!(entry.width>0&&entry.height>0&&entry.width<=14400&&entry.height<=14400))throw new Error('Invalid page dimensions.');

   const xobjects:Record<string,mupdf.PDFObject>={},commands:string[]=[],links:{bounds:mupdf.Rect;uri:string}[]=[];

   const fields:FormField[]=[...(entry.forms??[])];let edited=false;
   const add=(data:Uint8Array,index:number,name:string)=>{

    const source=open(data) as mupdf.PDFDocument;

    try {

     // Fillable export: the source's fields are recreated (pdf-lib, below)
     // instead of being drawn into the page.
     if(spec.keepForms&&name==='Source'){const b=source.loadPage(index).getBounds(),sx=entry.width/(b[2]-b[0]),sy=entry.height/(b[3]-b[1]);
      for(const f of readFields(source,index))fields.push({...f,left:f.left*sx,top:f.top*sy,width:f.width*sx,height:f.height*sy});}
     source.bake(true,!spec.keepForms);
     if(name==='Source'&&entry.edits?.length)edited=hideEditedText(source,index,entry);

     const embedded=embedPage(result,source,index,entry.width,entry.height);

     xobjects[name]=embedded.form;links.push(...embedded.links);

     commands.push(`q ${embedded.matrix.join(' ')} cm /${name} Do Q`);

    }finally{source.destroy();}

   };

   if(entry.source){const data=sources.get(entry.source);if(!data)throw new Error('A source PDF is missing. Reopen your project.');add(data,entry.index,'Source');}

   if(entry.svg){validateArtwork(entry.svg);add(await svgToPdf(entry.svg,entry.width,entry.height,entry.fonts),0,'Artwork');}

   const rotation=(((spec.rotation||0)%360+360)%360) as mupdf.Rotate;

   const resources:Record<string,unknown>={XObject:xobjects};
   // The new text of edits made over a scanner's text layer replaces the old words in it.
   const ocr=[...entry.ocr??[],...edited?(entry.edits??[]).filter((e):e is typeof e&{text:string}=>!!e.text).map(e=>({...e,...e.original})):[]];
   if(ocr.length){
    ocrFont??={font:new mupdf.Font('Helvetica'),ref:result.addSimpleFont(new mupdf.Font('Helvetica'),'Latin')};resources.Font={OCR:ocrFont.ref};
    // MuPDF's built-in CJK font also covers Cyrillic, Greek and Hangul; it is subset below.
    if(needsUnicodeFont(ocr)){if(!ocrUnicode){const font=new mupdf.Font('zh-Hans');ocrUnicode={font,ref:result.addFont(font)};}(resources.Font as Record<string,unknown>).OCRU=ocrUnicode.ref;}
    commands.push(...ocrTextCommands(ocr,entry.height,ocrFont.font,'OCR',ocrUnicode&&needsUnicodeFont(ocr)?{font:ocrUnicode.font,name:'OCRU'}:undefined));
   }
   const pageObj=result.addPage([0,0,entry.width,entry.height],rotation,resources as never,commands.join('\n'));

   result.insertPage(-1,pageObj);pageObj.destroy();for(const o of Object.values(xobjects))o.destroy();pageForms.push(fields);

   const page=result.loadPage(result.countPages()-1);

   const turn:mupdf.Matrix=rotation===90?[0,1,-1,0,entry.height,0]:rotation===180?[-1,0,0,-1,entry.width,entry.height]:rotation===270?[0,-1,1,0,0,entry.width]:mupdf.Matrix.identity;
   for(const link of links)if(/^(https?:|mailto:)/i.test(link.uri))page.createLink(mupdf.Rect.transform(link.bounds,turn),link.uri).destroy();
   if (spec.crop) {
     const { left, top, right, bottom } = spec.crop, b = page.getBounds();
     if (![left, top, right, bottom].every(v => Number.isFinite(v) && v >= 0) || left + right >= b[2] - b[0] || top + bottom >= b[3] - b[1]) {
       page.destroy(); throw new Error('Crop margins must leave a visible area on every selected page.');
     }
     page.setPageBox('CropBox', [b[0] + left, b[1] + top, b[2] - right, b[3] - bottom]);
   }
   page.destroy();

  }

  // The built-in CJK font is 1.7 MB; keep only the glyphs the OCR text uses.
  if(ocrUnicode)result.subsetFonts();
  composedForms.set(result,pageForms);
  result.setMetaData('info:Title',spec.title||'Untitled');result.setMetaData('info:Creator','bide — Browser Edition');

  return result;

 }catch(e){result.destroy();throw e;}

}



async function compressImages(doc: mupdf.PDFDocument,preset:string) {

  const limit=preset==='balanced'?1600:1000,quality=preset==='balanced'?.78:.58;

  for(let i=1;i<doc.countObjects();i++) {

    const obj=doc.newIndirect(i);

    try {

      if(!obj.isStream()||obj.get('Subtype').asName()!=='Image'||obj.get('SMask').isIndirect()||!obj.get('Mask').isNull())continue;

      const width=obj.get('Width').asNumber(),height=obj.get('Height').asNumber();

      if(Math.max(width,height)<limit)continue;

      const image=doc.loadImage(obj),pix=image.toPixmap();

      try {

        const png=pix.asPNG().slice() as Uint8Array<ArrayBuffer>;

        const bitmap=await createImageBitmap(new Blob([png],{type:'image/png'}));

        const ratio=Math.min(1,limit/Math.max(width,height)),w=Math.round(width*ratio),h=Math.round(height*ratio);

        const canvas=new OffscreenCanvas(w,h),ctx=canvas.getContext('2d')!;

        ctx.fillStyle='white';ctx.fillRect(0,0,w,h);ctx.drawImage(bitmap,0,0,w,h);bitmap.close();

        const jpg=new Uint8Array(await (await canvas.convertToBlob({type:'image/jpeg',quality})).arrayBuffer());

        const original=obj.readRawStream();const oldSize=original.length;original.destroy();

        if(jpg.length>=oldSize)continue;

        obj.writeObject({Type:'XObject',Subtype:'Image',Width:w,Height:h,ColorSpace:'DeviceRGB',BitsPerComponent:8,Filter:'DCTDecode'});

        obj.writeRawStream(jpg);

      }finally{pix.destroy();image.destroy();}

    }finally{obj.destroy();}

  }

}



export async function exportDocument(spec: ExportSpec) {

  const doc=await compose(spec);

  try {

    if(spec.compression!=='lossless')await compressImages(doc,spec.compression);

    if(spec.format==='pdf') {
      let options = opts;
      if (spec.password) {
        if (new TextEncoder().encode(spec.password).length > 127 || /[\x00-\x1f\x7f]/.test(spec.password)) throw new Error('Use a password of at most 127 UTF-8 bytes without control characters.');
        const quoted = '"' + spec.password.replaceAll('"', '""') + '"';
        options += `,encrypt=aes-256,user-password=${quoted},owner-password=${quoted}`;
      }
      const forms=composedForms.get(doc);
      if(forms?.some(f=>f.length)){
        // Fields are added to the saved file, which MuPDF then saves again:
        // that drops references pdf-lib's flattening leaves dangling, and encrypts.
        const filled=await addFormFields(bytesOf(doc.saveToBuffer(opts)),forms,!spec.keepForms);
        const again=open(filled) as mupdf.PDFDocument;try{return {bytes:bytesOf(again.saveToBuffer(options)),mime:'application/pdf'};}finally{again.destroy();}
      }
      return {bytes:bytesOf(doc.saveToBuffer(options)),mime:'application/pdf'};
    }

    if(['txt','docx'].includes(spec.format)) {

      const texts=Array.from({length:doc.countPages()},(_,i)=>{const p=doc.loadPage(i),t=p.toStructuredText('');try{return t.asText();}finally{t.destroy();p.destroy();}});

      if(spec.format==='txt')return {bytes:new TextEncoder().encode(texts.join('\n\n')),mime:'text/plain'};

      const {Document,Packer,Paragraph,TextRun,PageBreak}=await import('docx');

      const children=texts.flatMap((text,i)=>[...(i?[new Paragraph({children:[new PageBreak()]})]:[]),...text.split('\n').map(line=>new Paragraph({children:[new TextRun(line)]}))]);

      const blob=await Packer.toBlob(new Document({sections:[{children}]}));

      return {bytes:new Uint8Array(await blob.arrayBuffer()),mime:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'};

    }

    const files:Record<string,Uint8Array>={};

    for(let i=0;i<doc.countPages();i++) {

      const p=doc.loadPage(i);let data:Uint8Array;let ext=spec.format;

      try {

        if(spec.format==='split'){const single=new mupdf.PDFDocument();try{single.graftPage(-1,doc,i);const target=single.loadPage(0);for(const link of p.getLinks()){target.createLink(link.getBounds(),link.getURI()).destroy();link.destroy();}target.destroy();data=bytesOf(single.saveToBuffer(opts));}finally{single.destroy();}ext='pdf';}
        else if(spec.format==='svg') {

          const b=new mupdf.Buffer(),w=new mupdf.DocumentWriter(b,'svg','text=path');

          try{const d=w.beginPage(p.getBounds());p.run(d,mupdf.Matrix.identity);d.close();d.destroy();w.endPage();w.close();data=b.asUint8Array().slice();}finally{w.destroy();b.destroy();}

        }else if(spec.format==='png'||spec.format==='jpg') {

          const scale=Math.min(300,Math.max(72,spec.dpi))/72;

          const pix=p.toPixmap(mupdf.Matrix.scale(scale,scale),mupdf.ColorSpace.DeviceRGB,false,true);

          try{pix.setResolution(spec.dpi,spec.dpi);data=(spec.format==='png'?pix.asPNG():pix.asJPEG(90)).slice();}finally{pix.destroy();}

        }else throw new Error('Unknown export format.');

        files[`page-${String(i+1).padStart(3,'0')}.${ext}`]=data;

      }finally{p.destroy();}

    }

    const {zipSync}=await import('fflate');

    return {bytes:zipSync(files,{level:6}),mime:'application/zip'};

  }finally{doc.destroy();mupdf.shrinkStore(20);}

}

const cleanFontName=(name:string)=>name.replace(/^[A-Z]{6}\+/,'').replace(/[^a-z0-9]/gi,'').toLowerCase();
export function fontSupportsText(data:string,text:string){let font:mupdf.Font|undefined;try{font=new mupdf.Font('embedded',toBytes(data));return [...text].every(c=>/\s/.test(c)||font!.encodeCharacter(c)>0);}catch{return false;}finally{font?.destroy();}}
// Searchable scans often contain an invisible, pre-existing OCR layer. It is
// useful for search, but removing it does not remove the letters in the scan.
// Only text that actually paints may be edited as native PDF text; otherwise
// scanPageText must recognize the visible pixels and patch their background.
function editablePdfText(page:mupdf.PDFPage,bounds:mupdf.Rect){
 const visible=new mupdf.DisplayList(bounds),writer=new mupdf.DisplayListDevice(visible);
 let hidden=false;const opacity=[1];
 const filter=new mupdf.Device({
  fillText(text,ctm,space,color,alpha){if(alpha*opacity[opacity.length-1]>0)writer.fillText(text,ctm,space,color as mupdf.Color,alpha);else hidden=true;},
  strokeText(text,stroke,ctm,space,color,alpha){if(alpha*opacity[opacity.length-1]>0)writer.strokeText(text,stroke,ctm,space,color as mupdf.Color,alpha);else hidden=true;},
  ignoreText(){hidden=true;},
  clipText(){hidden=true;},
  clipStrokeText(){hidden=true;},
  beginGroup(_area,_space,_isolated,_knockout,_blend,alpha){opacity.push(opacity[opacity.length-1]*alpha);},
  endGroup(){opacity.pop();},
 });
 try{
  page.run(filter,mupdf.Matrix.identity);filter.close();writer.close();
  // Keep MuPDF's original extraction, including logical-text metadata, for
  // ordinary PDFs. Mixed visible/invisible pages use the painted-text list.
  return hidden?visible.toStructuredText('preserve-whitespace'):page.toStructuredText('preserve-whitespace');
 }finally{filter.destroy();writer.destroy();visible.destroy();}
}
// Count paintable text separately from scanner OCR and clipping-only text.
// A scanner's invisible OCR text under an edit still said the old value, so
// search and copy gave it back: on pages whose text is all invisible, the text
// under each edit is removed (text only: the scan and drawings stay).
function hideEditedText(source:mupdf.PDFDocument,index:number,entry:PageSpec){
 const page=source.loadPage(index) as mupdf.PDFPage;
 try{
  const kinds=textKinds(page);if(kinds.visible||!kinds.invisible)return false;
  const b=page.getBounds(),sx=(b[2]-b[0])/entry.width,sy=(b[3]-b[1])/entry.height;
  // A letters patch often starts at the first changed digit. Remove the full
  // original hidden field, otherwise its untouched prefix would survive and
  // be duplicated when the complete replacement string is appended.
  for(const edit of entry.edits!){const e=edit.original??edit;page.createAnnotation('Redact').setRect([b[0]+e.left*sx,b[1]+e.top*sy,b[0]+(e.left+e.width)*sx,b[1]+(e.top+e.height)*sy]);}
  page.applyRedactions(false,mupdf.PDFPage.REDACT_IMAGE_NONE,mupdf.PDFPage.REDACT_LINE_ART_NONE,mupdf.PDFPage.REDACT_TEXT_REMOVE);
  return true;
 }finally{page.destroy();}
}
function textKinds(page:mupdf.Page){
 const n={visible:0,invisible:0},opacity=[1];
 const paint=(_text:unknown,_ctm:unknown,_space:unknown,_color:unknown,alpha:number)=>{n[alpha*opacity[opacity.length-1]>0?'visible':'invisible']++;};
 const device=new mupdf.Device({fillText:paint,strokeText:(_text,_stroke,_ctm,_space,_color,alpha)=>paint(_text,_ctm,_space,_color,alpha),ignoreText:()=>n.invisible++,clipText:()=>n.invisible++,clipStrokeText:()=>n.invisible++,beginGroup(_area,_space,_isolated,_knockout,_blend,alpha){opacity.push(opacity[opacity.length-1]*alpha);},endGroup(){opacity.pop();}});
 try{page.run(device,mupdf.Matrix.identity);device.close();}finally{device.destroy();}
 return n;
}
export function detectPdfText(source:string,index:number){
 const data=sources.get(source);if(!data)throw new Error('PDF source unavailable');const doc=open(data) as mupdf.PDFDocument;const page=doc.loadPage(index);
 const kinds=textKinds(page);if(!kinds.visible&&kinds.invisible){page.destroy();doc.destroy();return {regions:[] as TextRegion[],skipped:0,ocrLayer:true};}
 const bounds=page.getBounds();const structured=editablePdfText(page,bounds);
 const fonts=new Map<string,{id:string;data:string}>();let budget=0,visited=0;const seen=new Set<number>();
 const resources=(res:mupdf.PDFObject,depth=0)=>{if(depth>8||++visited>128||res.isNull())return;res.get('Font').forEach((font)=>{try{const base=font.get('BaseFont').asName();let descriptor=font.get('FontDescriptor');if(descriptor.isNull())descriptor=font.get('DescendantFonts',0,'FontDescriptor');let stream=descriptor.get('FontFile2');if(stream.isNull()){stream=descriptor.get('FontFile3');if(stream.get('Subtype').asName()!=='OpenType')return;}if(!stream.isStream())return;const buffer=stream.readStream();try{const bytes=buffer.asUint8Array();if(bytes.length>4e6||budget+bytes.length>16e6)return;budget+=bytes.length;fonts.set(cleanFontName(base),{id:'PDFfont-'+source.slice(0,12)+'-'+font.asIndirect(),data:toBase64(bytes)});}finally{buffer.destroy();}}catch{}});res.get('XObject').forEach(obj=>{const id=obj.asIndirect();if(id&&seen.has(id))return;if(id)seen.add(id);resources(obj.get('Resources'),depth+1);});};
 const regions:TextRegion[]=[];let current:TextRegion|undefined,horizontal=true,skipped=0;
 const flush=()=>{if(current?.text.trim()){current.id='text-'+regions.length;const embedded=fonts.get(cleanFontName(current.fontName));if(embedded&&fontSupportsText(embedded.data,current.text)){current.fontId=embedded.id;current.fontData=embedded.data;}regions.push(current);}current=undefined;};
 try{resources(page.getObject().getInheritable('Resources'));structured.walk({beginLine(_bbox,wmode,dir){flush();horizontal=wmode===0&&Math.abs(dir[0]-1)<.01&&Math.abs(dir[1])<.01;if(!horizontal)skipped++;},onChar(char,origin,font,size,quad,color){if(!horizontal||regions.length>=2000)return;const name=font.getName();const rgb=color.length===1?[color[0],color[0],color[0]]:color;const fill='#'+rgb.slice(0,3).map(v=>Math.round(Math.max(0,Math.min(1,v))*255).toString(16).padStart(2,'0')).join('');if(current&&(current.fontName!==name||Math.abs(current.size-size)>.1||current.color!==fill))flush();const xs=[quad[0],quad[2],quad[4],quad[6]],ys=[quad[1],quad[3],quad[5],quad[7]],left=Math.min(...xs)-bounds[0],top=Math.min(...ys)-bounds[1],right=Math.max(...xs)-bounds[0],bottom=Math.max(...ys)-bounds[1];if(!current)current={id:'',text:'',left,top,width:right-left,height:bottom-top,size,baseline:origin[1]-bounds[1],fontName:name,bold:font.isBold(),italic:font.isItalic(),color:fill,kind:'pdf',quads:[]};const r=Math.max(current.left+current.width,right),b=Math.max(current.top+current.height,bottom);current.left=Math.min(current.left,left);current.top=Math.min(current.top,top);current.width=r-current.left;current.height=b-current.top;current.text+=char;current.quads!.push([...quad]);},endLine:flush});flush();return {regions,skipped};}finally{structured.destroy();page.destroy();doc.destroy();}
}
export async function removePdfText(source:string,index:number,regionId:string){
 const region=detectPdfText(source,index).regions.find(r=>r.id===regionId);if(!region)throw new Error('Text changed. Select the detected text again.');const data=sources.get(source)!;const doc=open(data) as mupdf.PDFDocument;const page=doc.loadPage(index);
 try{if(page.getAnnotations().some(a=>a.getType()==='Redact'))throw new Error('This page has pending redactions. Resolve them before editing text.');const links=page.getLinks().map(link=>({bounds:link.getBounds(),uri:link.getURI()}));const annotation=page.createAnnotation('Redact');annotation.setQuadPoints(region.quads as mupdf.Quad[]);page.applyRedactions(false,mupdf.PDFPage.REDACT_IMAGE_NONE,mupdf.PDFPage.REDACT_LINE_ART_NONE,mupdf.PDFPage.REDACT_TEXT_REMOVE);const remaining=page.getLinks().map(link=>({bounds:link.getBounds(),uri:link.getURI()}));for(const link of links)if(!remaining.some(other=>other.uri===link.uri&&other.bounds.every((v,i)=>v===link.bounds[i])))page.createLink(link.bounds,link.uri).destroy();return await register(bytesOf(doc.saveToBuffer(opts)));}finally{page.destroy();doc.destroy();}
}

// The line drawn again in its own font with `text` (see pdf-inplace.ts), as a
// new source; or why it cannot be, for the text-box path.
export async function replacePdfText(source:string,index:number,regionId:string,text:string):Promise<{id:string;data:string}|{fallback:string}>{
 const {regions}=detectPdfText(source,index),region=regions.find(r=>r.id===regionId);if(!region)throw new Error('Text changed. Select the detected text again.');
 const data=sources.get(source)!,doc=open(data) as mupdf.PDFDocument,scratch=open(data) as mupdf.PDFDocument,original=open(data) as mupdf.PDFDocument;let saved:mupdf.Document|undefined;
 try{
  const predicted=rewriteText(doc,scratch,index,region,regions,text),bytes=bytesOf(doc.saveToBuffer(opts));
  saved=open(bytes);if(saved.countPages()!==original.countPages())throw new Unsafe('The rewrite changed the pages.');
  const before=original.loadPage(index),after=saved.loadPage(index);try{verifyRewrite(before,after,region,predicted);}finally{before.destroy();after.destroy();}
  return await register(bytes);
 }catch(e){if(e instanceof Unsafe)return {fallback:e.message};console.warn('In-place text edit failed:',e);return {fallback:'This line could not be rewritten safely.'};}
 finally{saved?.destroy();original.destroy();scratch.destroy();doc.destroy();}
}

export type PageRect = { left: number; top: number; width: number; height: number };
// Where `needles` occur on a PDF page, as rectangles in page units (top-left origin).
export function findPdfText(source: string, index: number, needles: string[]): PageRect[][] {
  const data = sources.get(source); if (!data) throw new Error('This PDF is no longer open.');
  const doc = open(data), page = doc.loadPage(index);
  try {
    const [x0, y0] = page.getBounds();
    return needles.map(needle => needle.trim() ? page.search(needle, '').flat().map(q => {
      const xs = [q[0], q[2], q[4], q[6]], ys = [q[1], q[3], q[5], q[7]], left = Math.min(...xs), top = Math.min(...ys);
      return { left: left - x0, top: top - y0, width: Math.max(...xs) - left, height: Math.max(...ys) - top };
    }) : []);
  } finally { page.destroy(); doc.destroy(); }
}

// True redaction: text, images (their pixels) and vector art under each
// rectangle are removed from the PDF and a black box is drawn in their place.
// Links and annotations touching a rectangle are deleted with them.
export async function redactPdf(source: string, index: number, rects: PageRect[]) {
  const data = sources.get(source); if (!data) throw new Error('This PDF is no longer open.');
  const clean = await removeRedactedFields(data, index, rects);
  const doc = open(clean) as mupdf.PDFDocument, page = doc.loadPage(index) as mupdf.PDFPage;
  try {
    const [x0, y0] = page.getBounds(), boxes = rects.map(r => [r.left + x0, r.top + y0, r.left + x0 + r.width, r.top + y0 + r.height] as mupdf.Rect);
    const touches = (b: mupdf.Rect) => boxes.some(r => b[0] < r[2] && b[2] > r[0] && b[1] < r[3] && b[3] > r[1]);
    for (const link of page.getLinks()) { if (touches(link.getBounds())) page.deleteLink(link); link.destroy(); }
    for (const annotation of page.getAnnotations()) if (annotation.getType() !== 'Redact' && touches(annotation.getBounds())) page.deleteAnnotation(annotation);
    for (const box of boxes) page.createAnnotation('Redact').setRect(box);
    // A crossing path may contain outlined letters or a signature. Keeping the
    // original path underneath a black rectangle would leave it recoverable.
    page.applyRedactions(true, mupdf.PDFPage.REDACT_IMAGE_PIXELS, mupdf.PDFPage.REDACT_LINE_ART_REMOVE_IF_TOUCHED, mupdf.PDFPage.REDACT_TEXT_REMOVE);
    return await register(bytesOf(doc.saveToBuffer(opts)));
  } finally { page.destroy(); doc.destroy(); }
}

// A project source must contain only the pages the project still uses. A
// discarded page may hold an older, unredacted version of the visible page.
// Compose starts a fresh document/catalog and recreates only used-page forms;
// cleaning its content also drops unused resources grafted with a kept page.
export async function sanitizePdf(source: string, indexes: number[]) {
  const data = sources.get(source); if (!data) throw new Error('This PDF is no longer open.');
  const doc = open(data) as mupdf.PDFDocument, entries: PageSpec[] = [];
  try {
    if (!indexes.length || indexes.length > 1000 || indexes.some(i => !Number.isInteger(i) || i < 0 || i >= doc.countPages())) throw new Error('Choose valid PDF pages to retain.');
    for (const index of indexes) {
      const page = doc.loadPage(index);
      try {
        const b = page.getBounds(), supported = new Set(['text', 'checkbox', 'radiobutton', 'combobox', 'listbox']);
        if (page.getWidgets().some(w => !supported.has(w.getFieldType()))) {
          // Preserve signature/pushbutton visuals without retaining their
          // unsupported field trees or hidden values in the sanitized source.
          const flat = await register(writePages(doc, [index]));
          entries.push({ width: b[2] - b[0], height: b[3] - b[1], source: flat.id, index: 0, svg: '' });
        } else entries.push({ width: b[2] - b[0], height: b[3] - b[1], source, index, svg: '' });
      } finally { page.destroy(); }
    }
  } finally { doc.destroy(); }
  const exported = await exportDocument({ pages: entries, title: 'bide document', format: 'pdf', compression: 'lossless', range: '', dpi: 144, keepForms: true });
  const clean = open(exported.bytes) as mupdf.PDFDocument;
  try { return await register(bytesOf(clean.saveToBuffer(opts + ',clean=yes,sanitize=yes'))); }
  finally { clean.destroy(); }
}

// Widgets are separate from MuPDF's ordinary annotations. Remove the whole
// field, including its other widgets and stored/default values, if one of its
// widgets is redacted. Merely deleting an appearance leaves /V and /DV behind.
async function removeRedactedFields(data: Uint8Array, index: number, rects: PageRect[]) {
  const names = new Set<string>(), original = open(data) as mupdf.PDFDocument, page = original.loadPage(index);
  try {
    const [x0, y0] = page.getBounds();
    for (const widget of page.getWidgets()) {
      const b = widget.getRect();
      if (rects.some(r => b[0] < r.left + x0 + r.width && b[2] > r.left + x0 && b[1] < r.top + y0 + r.height && b[3] > r.top + y0)) names.add(widget.getName());
    }
  } finally { page.destroy(); original.destroy(); }
  if (!names.size) return data;

  const { PDFDocument, PDFName } = await import('pdf-lib');
  const pdf = await PDFDocument.load(data), form = pdf.getForm(), removed = new Set<string>();
  for (const field of form.getFields()) {
    if (!names.has(field.getName())) continue;
    const widgets = field.acroField.getWidgets();
    // Remove the actual widget references, not their /AP appearance references.
    for (const target of pdf.getPages()) {
      const annots = target.node.Annots();
      if (!annots) continue;
      for (let i = annots.size() - 1; i >= 0; i--) {
        const ref = annots.get(i), object = pdf.context.lookup(ref);
        if (widgets.some(widget => widget.dict === object)) annots.remove(i);
      }
    }
    form.acroForm.removeField(field.acroField);
    for (const widget of widgets) {
      const ref = pdf.context.getObjectRef(widget.dict);
      if (ref) pdf.context.delete(ref);
    }
    pdf.context.delete(field.ref);
    removed.add(field.getName());
  }
  if ([...names].some(name => !removed.has(name))) throw new Error('A form field could not be removed safely. The page was not redacted.');
  // Hybrid XFA data and calculation order can retain a second copy/reference.
  form.deleteXFA();
  form.acroForm.dict.delete(PDFName.of('CO'));
  return pdf.save({ updateFieldAppearances: false });
}

const composedForms=new WeakMap<mupdf.PDFDocument,FormField[][]>();

// Form fields of a source page, geometry in page units (top-left origin).
function readFields(doc:mupdf.PDFDocument,index:number):PdfFormField[]{
  const page=doc.loadPage(index) as mupdf.PDFPage;
  try{
    const [x0,y0]=page.getBounds();
    return page.getWidgets().flatMap((w,widget)=>{
      const kind=w.getFieldType(),type=kind==='text'?'text':kind==='checkbox'?'checkbox':kind==='radiobutton'?'radio':kind==='combobox'||kind==='listbox'?'dropdown':undefined;if(!type)return [];
      const r=w.getRect(),value=w.getValue();
      // A radio button's option is the name of its "on" appearance.
      const states:string[]=[];if(type==='radio')w.getObject().get('AP','N').forEach((_,key)=>{if(typeof key==='string')states.push(key);});
      // pdf-lib and others name states "0", "1"… and keep the labels in /Opt.
      const state=states.find(k=>k!=='Off'),labels=type==='radio'?w.getObject().get('Parent','Opt'):undefined;
      const label=state&&/^\d+$/.test(state)&&labels?.isArray()&&+state<labels.length?labels.get(+state).asString():state;
      const option=type==='radio'?label??`Option ${widget+1}`:undefined;
      return [{id:`pdf-${index}-${widget}`,widget,type,name:w.getName(),left:r[0]-x0,top:r[1]-y0,width:r[2]-r[0],height:r[3]-r[1],
        value:type==='radio'?(state&&value===state||value===option?'Yes':'Off'):value,...(type==='dropdown'?{options:w.getOptions()}:{}),...(option?{option}:{}),...(type==='text'&&w.isMultiline()?{multiline:true}:{}),...(w.isReadOnly()?{readOnly:true}:{})} as PdfFormField];
    });
  }finally{page.destroy();}
}
export function pdfFormFields(source:string,index:number){
  const data=sources.get(source);if(!data)throw new Error('This PDF is no longer open.');
  const doc=open(data) as mupdf.PDFDocument;try{return readFields(doc,index);}finally{doc.destroy();}
}
// Fills one field of a source PDF; returns the new source.
export async function fillPdfField(source:string,index:number,widget:number,value:string){
  const data=sources.get(source);if(!data)throw new Error('This PDF is no longer open.');
  const doc=open(data) as mupdf.PDFDocument,page=doc.loadPage(index) as mupdf.PDFPage;
  try{
    const w=page.getWidgets()[widget];if(!w)throw new Error('This form field is no longer on the page.');
    if(w.isReadOnly())throw new Error('This form field is read-only.');
    if(w.isText())w.setTextValue(value);
    else if(w.isChoice())w.setChoiceValue(value);
    else if(w.isRadioButton()){
      // getValue() is the group's value even on an unselected radio widget.
      // /AS identifies whether this particular button is currently selected.
      const selected=isChecked(w.getObject().get('AS').asName());
      if(selected!==isChecked(value))w.toggle();
    }
    else if(w.isCheckbox()){if(isChecked(w.getValue())!==isChecked(value))w.toggle();}
    w.update();page.update();
    return await register(bytesOf(doc.saveToBuffer(opts)));
  }finally{page.destroy();doc.destroy();}
}

// Adds `forms[page]` as real AcroForm fields with pdf-lib, then flattens them
// into the page when `flatten`. Radio buttons sharing a name form one group.
async function addFormFields(bytes:Uint8Array,forms:FormField[][],flatten:boolean){
  const {PDFDocument,StandardFonts}=await import('pdf-lib');
  const pdf=await PDFDocument.load(bytes),form=pdf.getForm(),pages=pdf.getPages(),taken=new Set<string>();
  const text=forms.flatMap(fields=>fields.flatMap(f=>f.type==='text'?[f.value]:f.type==='dropdown'?[f.value,...(f.options??[])]:[])).join('');
  let font=await pdf.embedFont(StandardFonts.Helvetica);
  if(Array.from(text).some(c=>!isWinAnsi(c.codePointAt(0)!)&&!/\s/.test(c))){
    const {default:fontkit}=await import('@pdf-lib/fontkit');pdf.registerFontkit(fontkit);
    formFontData??=fetch(formFontUrl).then(async response=>{if(!response.ok)throw new Error('The bundled PDF form font is missing.');return new Uint8Array(await response.arrayBuffer());}).catch(error=>{formFontData=undefined;throw error;});
    // Keep the full font so recipients can enter new letters in fillable fields.
    font=await pdf.embedFont(await formFontData,{subset:false});
    const supported=new Set(font.getCharacterSet()),missing=Array.from(text).find(c=>!/\s/.test(c)&&!supported.has(c.codePointAt(0)!));
    if(missing)throw new Error(`The bundled PDF form font does not support “${missing}”. Use a supported font/script for form fields.`);
  }
  const unique=(name:string)=>{let n=name||'Field',k=2;while(taken.has(n))n=`${name} ${k++}`;taken.add(n);return n;};
  const groups=new Map<string,ReturnType<typeof form.createRadioGroup>>();
  forms.forEach((fields,i)=>{
    const page=pages[i];if(!page)return;const height=page.getHeight();
    for(const f of fields){
      const box={...pdfBox(f,height),font,borderWidth:1};
      if(f.type==='text'){const t=form.createTextField(unique(f.name));if(f.multiline)t.enableMultiline();if(f.value)t.setText(f.value);t.addToPage(page,box);if(f.readOnly)t.enableReadOnly();}
      else if(f.type==='checkbox'){const c=form.createCheckBox(unique(f.name));c.addToPage(page,box);if(isChecked(f.value))c.check();if(f.readOnly)c.enableReadOnly();}
      else if(f.type==='dropdown'){const d=form.createDropdown(unique(f.name));d.addOptions(f.options?.length?f.options:['']);if(f.value&&f.options?.includes(f.value))d.select(f.value);d.addToPage(page,box);if(f.readOnly)d.enableReadOnly();}
      else{let g=groups.get(f.name);if(!g){g=form.createRadioGroup(unique(f.name));groups.set(f.name,g);}const option=f.option||`Option ${g.getOptions().length+1}`;g.addOptionToPage(option,page,box);if(isChecked(f.value))g.select(option);}
    }
  });
  form.updateFieldAppearances(font);if(flatten)form.flatten();
  return await pdf.save();
}
let formFontData:Promise<Uint8Array>|undefined;
