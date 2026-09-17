import {Canvas,FabricImage,type FabricObject} from 'fabric';
import {pageRaster,rasterLayer} from './retouch-canvas';
import {stampPixels,strokePoints,type XY} from './retouch-pixels';
type Settings={tool:string;pageId:string;width:number;height:number;pdf:boolean;size:number;softness:number;opacity:number;target:FabricObject|null};
export function createRetouchController(c:Canvas,get:()=>Settings,finish:()=>void,notify:(s:string)=>void,uid:()=>string) {
  let sample:XY|null=null,samplePage='';
  let job:{mode:'clone'|'heal'|'erase';pageId:string;source:ImageData;backdrop:ImageData;pixels:ImageData;surface:HTMLCanvasElement;preview:FabricImage;target:FabricObject|null;index:number;start:XY;last:XY;sample:XY;size:number;softness:number;opacity:number;visible:boolean}|null=null;
  const paint=(point:XY)=>{if(!job)return;const j=job;for(const p of strokePoints(j.last,point,j.size))stampPixels(j.pixels,j.source,j.backdrop,p,{x:j.sample.x+p.x-j.start.x,y:j.sample.y+p.y-j.start.y},j.size,j.softness,j.opacity,j.mode);j.last=point;j.surface.getContext('2d')!.putImageData(j.pixels,0,0);j.preview.dirty=true;c.requestRenderAll();};
  const cancel=()=>{if(!job)return;const j=job;job=null;c.remove(j.preview);if(j.target)j.target.visible=j.visible;c.requestRenderAll();};
  return {
    down(point:XY,alt:boolean) {
      const s=get();if(!['clone','heal','eraser'].includes(s.tool))return false;
      if(s.pdf&&s.tool!=='eraser'){notify('Open an image or design page to retouch. Export PDF pages as PNG first.');return true;}
      if(alt&&s.tool!=='eraser'){sample={...point};samplePage=s.pageId;notify('Source sampled. Drag to paint; Alt-click to sample again.');return true;}
      if(s.tool!=='eraser'&&(!sample||samplePage!==s.pageId)){notify('Alt-click the image to choose a source first.');return true;}
      if(s.tool==='eraser'&&(!s.target||s.target.lockMovementX||!c.getObjects().includes(s.target))){notify('Select an unlocked patch or image layer, then choose Eraser.');return true;}
      try {
        cancel();const background=pageRaster(c,s.width,s.height),backdrop=background.getContext('2d')!.getImageData(0,0,background.width,background.height);
        const target=s.tool==='eraser'?s.target:null,surface=target?pageRaster(c,s.width,s.height,[target]):document.createElement('canvas');if(!target){surface.width=background.width;surface.height=background.height;}
        const index=target?c.getObjects().indexOf(target):c.getObjects().length,visible=target?.visible??true,pixels=surface.getContext('2d')!.getImageData(0,0,surface.width,surface.height);
        if(target)target.visible=false;
        const preview=new FabricImage(surface,{left:0,top:0,selectable:false,evented:false,objectCaching:false});c.insertAt(index+(target?1:0),preview);
        job={mode:s.tool==='eraser'?'erase':s.tool as 'clone'|'heal',pageId:s.pageId,source:backdrop,backdrop,pixels,surface,preview,target,index,start:point,last:point,sample:sample||point,size:s.size,softness:s.softness,opacity:s.opacity/100,visible};paint(point);
      }catch(error){cancel();notify(error instanceof Error?error.message:String(error));}return true;
    },
    move(point:XY){if(!job)return false;paint(point);return true;},
    up(){if(!job)return false;const j=job;job=null;c.remove(j.preview);if(j.target)j.target.visible=j.visible;
      if(get().pageId!==j.pageId)return true;
      const name=j.target?(j.target as FabricObject&{name?:string}).name||'Erased layer':j.mode==='heal'?'Healing patch':'Clone patch';
      const result=rasterLayer(j.surface,name,uid());if(j.target)c.remove(j.target);if(result){if(j.target)result.set({globalCompositeOperation:j.target.globalCompositeOperation});c.insertAt(j.index,result);c.setActiveObject(result);}c.requestRenderAll();finish();return true;
    },cancel,
  };
}
