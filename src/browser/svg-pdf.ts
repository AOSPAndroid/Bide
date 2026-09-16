import {bundledFonts} from '../font-catalog';
import PDFDocument from 'pdfkit';
import SVGtoPDF from 'svg-to-pdfkit';
import font0 from './fonts/LiberationMono-Bold.ttf';
import font1 from './fonts/LiberationMono-BoldItalic.ttf';
import font2 from './fonts/LiberationMono-Italic.ttf';
import font3 from './fonts/LiberationMono-Regular.ttf';
import font4 from './fonts/LiberationSans-Bold.ttf';
import font5 from './fonts/LiberationSans-BoldItalic.ttf';
import font6 from './fonts/LiberationSans-Italic.ttf';
import font7 from './fonts/LiberationSans-Regular.ttf';
import font8 from './fonts/LiberationSerif-Bold.ttf';
import font9 from './fonts/LiberationSerif-BoldItalic.ttf';
import font10 from './fonts/LiberationSerif-Italic.ttf';
import font11 from './fonts/LiberationSerif-Regular.ttf';
const fontUrls={'LiberationMono-Bold':font0,'LiberationMono-BoldItalic':font1,'LiberationMono-Italic':font2,'LiberationMono-Regular':font3,'LiberationSans-Bold':font4,'LiberationSans-BoldItalic':font5,'LiberationSans-Italic':font6,'LiberationSans-Regular':font7,'LiberationSerif-Bold':font8,'LiberationSerif-BoldItalic':font9,'LiberationSerif-Italic':font10,'LiberationSerif-Regular':font11};
const extraData=new Map<string,Promise<Uint8Array>>();
let loaded:Promise<[string,Uint8Array][]>;
function fonts(){return loaded ||= Promise.all(Object.entries(fontUrls).map(async([name,url])=>[name,new Uint8Array(await (await fetch(url)).arrayBuffer())] as [string,Uint8Array]));}


export async function svgToPdf(svg:string,width:number,height:number):Promise<Uint8Array<ArrayBuffer>> {
 const fontData=await fonts();
 const selected=bundledFonts.filter(font=>svg.includes(font.family));
 const extra=await Promise.all(selected.flatMap(font=>font.faces.map(async face=>{
  if(!extraData.has(face.url))extraData.set(face.url,fetch(face.url).then(async response=>{if(!response.ok)throw new Error('Bundled font is missing');return new Uint8Array(await response.arrayBuffer());}).catch(error=>{extraData.delete(face.url);throw error;}));
  return [font.family+'-'+face.style,await extraData.get(face.url)!] as [string,Uint8Array];
 })));
 return new Promise((resolve,reject)=>{
  const doc=new PDFDocument({size:[width,height],margin:0,compress:true,font:fontData.find(([name])=>name==='LiberationSans-Regular')![1] as any});
  for(const [name,data]of [...fontData,...extra])doc.registerFont(name,data as any);
  const chunks:Uint8Array[]=[];
  doc.on('data',(chunk:Uint8Array)=>chunks.push(chunk));
  doc.on('error',reject);
  doc.on('end',()=>{const result=new Uint8Array(chunks.reduce((n,c)=>n+c.length,0));let offset=0;for(const c of chunks){result.set(c,offset);offset+=c.length;}resolve(result);});
  try { SVGtoPDF(doc,svg,0,0,{width,height,assumePt:true, fontCallback:(family,bold,italic,options)=>{
 const name=family.split(',')[0].trim().replace(/^['"]|['"]$/g,'');const item=selected.find(font=>font.family===name);
 if(item){const style=bold&&italic?'BoldItalic':bold?'Bold':italic?'Italic':'Regular';if(item.faces.some(face=>face.style===style))return name+'-'+style;options.fauxBold=!!bold;options.fauxItalic=!!italic;return name+'-Regular';}
 const base=/Times|Georgia|^serif$/i.test(family)?'Serif':/Courier|monospace/i.test(family)?'Mono':'Sans';return 'Liberation'+base+'-'+(bold&&italic?'BoldItalic':bold?'Bold':italic?'Italic':'Regular');}, imageCallback:link=>{if(!link.startsWith('data:image/'))throw new Error('Image must be embedded.');return link;}, documentCallback:()=>{throw new Error('External SVG documents are not supported.');}});doc.end(); }
  catch(e){reject(e);doc.end();}
 });
}
