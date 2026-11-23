// Browser side of the edit benchmark: the app's own open → scan → edit →
// download code, without its interface. Each edit starts again from the
// document as opened, as the first edit of a session does.
import {StaticCanvas} from 'fabric';
import {imageFilePage,exportPayload} from '../../src/project-io';
import {importDocument,exportInBrowser} from '../../src/browser/engine';
import {blankPage,type Page,type Project} from '../../src/model';
import {scanPageText} from '../../src/detected-text';
import {planOcrReplacement,LetteringError} from '../../src/ocr-replace';
import {sameKindImage} from '../../src/image-export';
import {ensureDocumentFonts} from '../../src/fonts';
import {defaultOcrSettings,type OcrSettings} from '../../src/TextDetectionBar';
import type {TextRegion} from '../../src/text-regions';
import type {Canvas} from 'fabric';

type Doc={page:Page;sources:Record<string,string>;regions:TextRegion[];all:TextRegion[];settings:OcrSettings};
const docs=new Map<string,Doc>();
const bytesOf=(b64:string)=>Uint8Array.from(atob(b64),c=>c.charCodeAt(0));
const base64=async(blob:Blob)=>{const b=new Uint8Array(await blob.arrayBuffer());let s='';for(let i=0;i<b.length;i+=32768)s+=String.fromCharCode(...b.subarray(i,i+32768));return btoa(s);};
async function loaded(page:Page){const c=new StaticCanvas(undefined,{width:page.width,height:page.height});await ensureDocumentFonts(page.canvas);await c.loadFromJSON(page.canvas);return c as unknown as Canvas;}

// Open a picture or a PDF and read its text as the app does on opening.
export async function open(id:string,b64:string,name:string,type:string){
 const file=new File([bytesOf(b64)],name,{type});let page:Page,sources:Record<string,string>={};
 if(type==='application/pdf'){const r=await importDocument(file);page={...blankPage(r.pages[0].width,r.pages[0].height),source:r.id,index:r.pages[0].index};sources={[r.id]:r.data};}
 else page=await imageFilePage(file);
 const c=await loaded(page),s={...defaultOcrSettings},t0=performance.now();
 try{
  const {regions,all,suggestedFont}=await scanPageText(page,c,{signal:new AbortController().signal,grouping:s.grouping,thorough:s.thorough,languages:s.languages,engine:s.engine,aiSharpen:s.aiSharpen,script:s.script,accurate:s.accurate,onStatus:()=>{}});
  if(suggestedFont)s.font=suggestedFont;
  docs.set(id,{page,sources,regions,all:all??regions,settings:s});
  return {seconds:(performance.now()-t0)/1000,width:page.width,height:page.height,font:s.font,regions:regions.map(r=>({id:r.id,kind:r.kind,text:r.text,left:r.left,top:r.top,width:r.width,height:r.height,angle:r.angle??0,confidence:r.confidence,doubt:r.doubt,bold:r.bold,color:r.color,blur:r.blur,glyphs:r.glyphs?.map(g=>({ch:g.ch,x0:g.x0,x1:g.x1}))}))};
 }finally{await (c as unknown as StaticCanvas).dispose();}
}

// One edit of one field, with the page's own letters or in a font, then the
// download the user would get (the same kind of picture, or a PDF).
// 'font': the whole line set in the matched font; 'mixed': the line's own
// letters, those the page cannot lend drawn in the matched font (what the
// app does when a font is chosen for an edit).
export async function edit(id:string,regionId:string,text:string,mode:'letters'|'font'|'mixed'){
 const d=docs.get(id)!,region=d.regions.find(r=>r.id===regionId)!,c=await loaded(d.page),t0=performance.now();
 try{
  let plan;
  try{plan=await planOcrReplacement(c,d.page,[{region,text}],{settings:d.settings,pageRegions:d.all,others:d.regions,letters:mode==='letters',autoFont:true,mix:mode==='mixed'});}
  catch(e){if(e instanceof LetteringError)return {outcome:'refused' as const,reason:e.reason,ms:performance.now()-t0};throw e;}
  const objects=[...((d.page.canvas.objects||[]) as unknown[])];await plan.apply(objects);
  const ms=performance.now()-t0,page:Page={...d.page,canvas:{...d.page.canvas,objects}};
  const layer=(objects.at(-1)??{}) as Record<string,unknown>,drawn=plan.drawn,info=plan.fonts?{font:layer.fontFamily,weight:layer.fontWeight,fill:layer.fill,soft:layer.textSoftness,size:layer.fontSize}:undefined;
  if(page.source){const project:Project={version:1,name:'bench',pages:[page],sources:d.sources};const blob=await exportInBrowser({...await exportPayload(project),format:'pdf',compression:'lossless',range:'',dpi:300});return {outcome:mode,ms,type:'application/pdf',data:await base64(blob),info,drawn,whole:!!plan.fonts,fit:plan.fit};}
  const out=await loaded(page);
  try{const {blob}=await sameKindImage(page,out);return {outcome:mode,ms,type:blob.type,data:await base64(blob),info,drawn,whole:!!plan.fonts,fit:plan.fit};}finally{await (out as unknown as StaticCanvas).dispose();}
 }finally{await (c as unknown as StaticCanvas).dispose();}
}
export const close=(id:string)=>{docs.delete(id);};
