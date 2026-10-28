// Touch screens: an export ZIP that holds a single page is unpacked, so the PNG,
// JPEG, SVG or PDF itself can go to Photos or another app, and the system share
// sheet is offered where the browser has one. Desktop keeps its ZIP download.
import {download} from './model';

const types:Record<string,string>={png:'image/png',jpg:'image/jpeg',svg:'image/svg+xml',pdf:'application/pdf'};
const nativeApp=()=>!!(globalThis as {Capacitor?:{isNativePlatform?:()=>boolean}}).Capacitor?.isNativePlatform?.();
export async function saveExport(blob:Blob,filename:string){
 try{
  if(blob.type==='application/zip'&&matchMedia('(pointer:coarse)').matches){
   const {unzipSync}=await import('fflate'),files=Object.entries(unzipSync(new Uint8Array(await blob.arrayBuffer())));
   if(files.length===1){
    const [name,bytes]=files[0],ext=name.split('.').pop()!;
    blob=new Blob([bytes as Uint8Array<ArrayBuffer>],{type:types[ext]??'application/octet-stream'});
    // Only a split export (PDF pages) adds -pages; a project named "x-pages" keeps its name.
    filename=filename.replace(ext==='pdf'?/-pages\.zip$/:/\.zip$/,`${ext==='pdf'?'-page':''}.${ext}`);
    // The share sheet needs the tap that started the export to be recent; when
    // it is too old the browser refuses and the file is downloaded instead.
    const file=new File([blob],filename,{type:blob.type});
    if(!nativeApp()&&navigator.canShare?.({files:[file]}))try{await navigator.share({files:[file]});return;}catch(e){if(e instanceof Error&&e.name==='AbortError')return;}
   }
  }
 }catch{/* keep the export as it came */}
 download(blob,filename);
}
