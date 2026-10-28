// A page opened from a PNG, JPEG or WebP downloads as the same kind of file,
// at its original pixel size: untouched pixels of a PNG come out identical,
// transparency is kept, and only the edited areas change.
import type {Canvas} from 'fabric';
import type {Page} from './model';

export const imageFormats:Record<string,{ext:string;label:string;quality?:number}>={
 'image/png':{ext:'png',label:'PNG'},
 'image/jpeg':{ext:'jpg',label:'JPEG',quality:.95},
 'image/webp':{ext:'webp',label:'WebP',quality:1},
};
// The page a project downloads as a picture: a single page opened from one.
export const imagePage=(pages:Page[])=>pages.length===1&&pages[0].file&&imageFormats[pages[0].file.type]&&!pages[0].source?pages[0]:undefined;

export async function sameKindImage(p:Page,c:Canvas){
 const file=p.file!,format=imageFormats[file.type],old=c.backgroundColor;
 // A JPEG has no transparency: it keeps the page colour behind the picture.
 c.backgroundColor=file.type==='image/jpeg'?p.color==='transparent'?'#ffffff':p.color:'';
 try{
  const output=c.toCanvasElement(file.width/p.width/c.getZoom(),{width:p.width*c.getZoom(),height:p.height*c.getZoom()});
  const blob=await new Promise<Blob|null>(resolve=>output.toBlob(resolve,file.type,format.quality));
  if(!blob||blob.type!==file.type)throw new Error(`This browser cannot save ${format.label} files. Choose PNG or PDF.`);
  return {blob,ext:format.ext,width:output.width,height:output.height};
 }finally{c.backgroundColor=old;}
}
