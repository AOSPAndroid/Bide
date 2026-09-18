import { selectPages } from '../page-range';
import {pdfRasterScale} from '../render-budget';
import { digest } from './crypto';
export { selectPages } from '../page-range';
import * as mupdf from 'mupdf';

import type {TextRegion} from '../text-regions';
// Export-only dependencies are loaded when conversion is requested.
async function svgToPdf(...args:Parameters<typeof import('./svg-pdf').svgToPdf>){return (await import('./svg-pdf')).svgToPdf(...args);}



export type PageSpec = { width: number; height: number; source?: string; index: number; svg: string; fonts?:Record<string,string> };

export type ExportSpec = { pages: PageSpec[]; title: string; format: string; compression: string; range: string; dpi: number; rotation?: number; password?: string; crop?: { left: number; top: number; right: number; bottom: number } };

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

 const result=new mupdf.PDFDocument();

 try {

  for(const i of selectPages(spec.range,spec.pages.length)) {

   const entry=spec.pages[i];

   if(!(entry.width>0&&entry.height>0&&entry.width<=14400&&entry.height<=14400))throw new Error('Invalid page dimensions.');

   const xobjects:Record<string,mupdf.PDFObject>={},commands:string[]=[],links:{bounds:mupdf.Rect;uri:string}[]=[];

   const add=(data:Uint8Array,index:number,name:string)=>{

    const source=open(data) as mupdf.PDFDocument;

    try {

     source.bake(true,true);

     const embedded=embedPage(result,source,index,entry.width,entry.height);

     xobjects[name]=embedded.form;links.push(...embedded.links);

     commands.push(`q ${embedded.matrix.join(' ')} cm /${name} Do Q`);

    }finally{source.destroy();}

   };

   if(entry.source){const data=sources.get(entry.source);if(!data)throw new Error('A source PDF is missing. Reopen your project.');add(data,entry.index,'Source');}

   if(entry.svg){validateArtwork(entry.svg);add(await svgToPdf(entry.svg,entry.width,entry.height,entry.fonts),0,'Artwork');}

   const rotation=(((spec.rotation||0)%360+360)%360) as mupdf.Rotate;

   const pageObj=result.addPage([0,0,entry.width,entry.height],rotation,{XObject:xobjects},commands.join('\n'));

   result.insertPage(-1,pageObj);pageObj.destroy();for(const o of Object.values(xobjects))o.destroy();

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
export function detectPdfText(source:string,index:number){
 const data=sources.get(source);if(!data)throw new Error('PDF source unavailable');const doc=open(data) as mupdf.PDFDocument;const page=doc.loadPage(index);const bounds=page.getBounds();const structured=page.toStructuredText('preserve-whitespace');
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
