// Reading files into a project: data URLs, .bide validation, image pages, and
// the page renderings sent to the export engine.
import {FabricImage,StaticCanvas} from 'fabric';
import {blankPage,uid,type Page,type Project} from './model';
import {Textbox} from './text-appearance';
import {pdfFallbackStyle} from './text-regions';
import {ensureFont,ensureDocumentFonts,documentEmbeddedFonts} from './fonts';
import {fontSupportsText} from './browser/engine';
import {hasBlending} from './browser/layer-utils';

type PdfText={pdfFontData?:string;pdfFontFallback?:string;pdfFontBold?:boolean;pdfFontItalic?:boolean;pdfOriginalFont?:string};

export function readDataUrl(file:Blob){
 return new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result as string);reader.onerror=()=>reject(reader.error??new Error('Could not read the file.'));reader.readAsDataURL(file);});
}

// A parsed .bide project, checked before anything is restored from it.
export function parseProject(text:string):Project{
 const data=JSON.parse(text) as Project;
 if (data.version !== 1 || !Array.isArray(data.pages) || !data.pages.length || !data.sources || data.pages.some(p => !p.id || !p.canvas || !Number.isFinite(p.width) || !Number.isFinite(p.height) || p.width <= 0 || p.height <= 0 || p.width > 14400 || p.height > 14400)) throw new Error('This is not a valid bide project.');
 // Restored canvas images must be embedded, never fetched from the network.
 const validate = (value: unknown): void => { if (!value || typeof value !== 'object') return; for (const [key,v] of Object.entries(value)) { if (key === 'src' && typeof v === 'string' && !v.startsWith('data:image/')) throw new Error('Project images must be embedded.'); if (typeof v === 'object') validate(v); } };
 data.pages.forEach(p => validate(p.canvas));
 return data;
}

// A page holding one image file at its own size (at most 5000 px per side).
export async function imageFilePage(file:File):Promise<Page>{
 const image = await FabricImage.fromURL(await readDataUrl(file));
 const ratio = Math.min(1, 5000 / Math.max(image.width, image.height));
 image.scale(ratio);
 Object.assign(image, { id: uid(), name: file.name });
 const p = blankPage(image.width * ratio, image.height * ratio);
 p.name = file.name.replace(/\.[^.]+$/, '');
 p.canvas = { objects: [image.toObject()] };
 return p;
}

// Every page rendered to SVG for the export engine. Embedded PDF fonts that
// lack typed characters fall back to their bundled match; pages with blend
// modes are flattened to a PNG inside the SVG.
export async function exportPayload(current:Project){
 const pages = [];
 for (const p of current.pages) {
  const c = new StaticCanvas(undefined, { width: p.width, height: p.height, backgroundColor: p.source ? '' : p.color });
  try {
   await ensureDocumentFonts(p.canvas);
   await c.loadFromJSON(p.canvas);
   for(const object of c.getObjects()){const o=object as Textbox&PdfText;if(o instanceof Textbox&&o.pdfFontData&&o.fontFamily.startsWith('PDFfont-')&&!await fontSupportsText(o.pdfFontData,o.text)){const family=o.pdfFontFallback||'Lato';await ensureFont(family);o.set({fontFamily:family,...pdfFallbackStyle(o)});o.initDimensions();}}
   c.backgroundColor = p.source ? '' : p.color;
   let svg = c.toSVG({ width: String(p.width), height: String(p.height), viewBox: { x:0,y:0,width:p.width,height:p.height } });
   if (hasBlending(c.getObjects())) {
    const png = c.toDataURL({ format: 'png', multiplier: Math.min(2, 4096 / Math.max(p.width, p.height)) });
    svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${p.width}" height="${p.height}"><image href="${png}" width="${p.width}" height="${p.height}"/></svg>`;
   }
   pages.push({ width: p.width, height: p.height, source: p.source, index: p.index, svg, fonts:documentEmbeddedFonts(p.canvas) });
  }
  finally { await c.dispose(); }
 }
 return { pages, title: current.name };
}
