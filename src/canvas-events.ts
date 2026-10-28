// The editor canvas's pointer and object events: drawing shapes, selections,
// crop, pen, gradient, bucket, mask painting, pan and zoom. Registered once
// when the canvas is created; everything that changes is read through refs.
import {Canvas,Rect,Ellipse,Line,ActiveSelection,type FabricObject,type Transform} from 'fabric';
import type {RefObject,Dispatch,SetStateAction} from 'react';
import {snapToGuides} from './Rulers';
import {withHandles,nearPoint,type Anchor} from './pen-path';
import {gradientLayer,bucketFill,createMaskBrush} from './paint-tools';
import {combineMasks,floodSelect,maskOpFor,type Mask,type MaskOp} from './pixel-mask';
import {polygonMask,samplePage} from './selection-canvas';
import {Textbox} from './text-appearance';
import {uid,type Page,type Project} from './model';
import {rectanglePoints,type SelectionPoint} from './selection-mask';
import {makeEraserStroke} from './brushes';
import {createRetouchController} from './retouch-controller';
import type {XY} from './retouch-pixels';
import type {Obj,Tool} from './editor-types';
import type {TouchHooks} from './touch-gestures';
import {revealEditedText} from './text-reveal';

export type SelectionRegion={id:string;points:SelectionPoint[];mask?:Mask;outline?:string};
export type CanvasEventDeps={
  retouch:RefObject<{ down(point: XY, alt: boolean): boolean; move(point: XY): boolean; up(): boolean; cancel: () => void; } | null>;
  retouchSettings:RefObject<{ tool: Tool; pageId: string; width: number; height: number; pdf: boolean; size: number; softness: number; opacity: number; target: Obj | null; }>;
  retouchTarget:RefObject<Obj | null>;
  saveCanvasRef:RefObject<() => void>;
  syncSelection:() => void;
  notify:(s: string) => void;
  validateTextFont:(o: Obj) => Promise<void>;
  toolRef:RefObject<Tool>;
  snapRef:RefObject<boolean>;
  projectRef:RefObject<Project>;
  pageIdRef:RefObject<string>;
  zoomRef:RefObject<number>;
  penRef:RefObject<{ anchors: Anchor[]; dragging: boolean; } | null>;
  finishPenRef:RefObject<(closed: boolean) => void>;
  loading:RefObject<boolean>;
  openLayerMenu:(o: Obj, x: number, y: number) => void;
  setLayerMenu:Dispatch<SetStateAction<{ id: string; x: number; y: number; } | null>>;
  zoomOutRef:RefObject<boolean>;
  finishPen:(closed: boolean) => void;
  setPenPreview:Dispatch<SetStateAction<{ anchors: Anchor[]; cursor?: SelectionPoint | undefined; } | null>>;
  pageRef:RefObject<Page>;
  setCrop:Dispatch<SetStateAction<{ rect: { left: number; top: number; width: number; height: number; }; angle: number; } | null>>;
  cropRef:RefObject<{ rect: { left: number; top: number; width: number; height: number; }; angle: number; } | null>;
  paintRef:RefObject<{ secondColor: string; gradient: { type: "linear" | "radial"; toTransparent: boolean; opacity: number; }; bucket: { tolerance: number; contiguous: boolean; antiAlias: boolean; allLayers: boolean; opacity: number; }; maskBrush: { reveal: boolean; size: number; softness: number; opacity: number; }; }>;
  colorRef:RefObject<string>;
  regionRef:RefObject<{ id: string; points: SelectionPoint[]; mask?: Mask | undefined; outline?: string | undefined; } | null>;
  selectionPixels:(r: { id: string; points: SelectionPoint[]; mask?: Mask | undefined; outline?: string | undefined; }) => Mask;
  selectionLayer:() => Obj | undefined;
  selectModeRef:RefObject<MaskOp>;
  selectObjectRef:RefObject<(id: string, pt: { x: number; y: number; }, op: MaskOp, base: { id: string; points: SelectionPoint[]; mask?: Mask | undefined; outline?: string | undefined; } | null) => Promise<void>>;
  wandRef:RefObject<{ tolerance: number; contiguous: boolean; antiAlias: boolean; allLayers: boolean; }>;
  showMask:(id: string, mask: Mask) => void;
  outlineOf:(points: SelectionPoint[]) => string;
  setRegion:Dispatch<SetStateAction<{ id: string; points: SelectionPoint[]; mask?: Mask | undefined; outline?: string | undefined; } | null>>;
  workspace:RefObject<HTMLDivElement | null>;
  textFont:RefObject<string>;
  changeZoom:(value: number, at?: { x: number; y: number; } | undefined) => void;
  setTool:Dispatch<SetStateAction<Tool>>;
};

export function attachCanvasEvents(c:Canvas,d:CanvasEventDeps){
  const {retouch,retouchSettings,retouchTarget,saveCanvasRef,syncSelection,notify,validateTextFont,toolRef,snapRef,projectRef,pageIdRef,zoomRef,penRef,finishPenRef,loading,openLayerMenu,setLayerMenu,zoomOutRef,finishPen,setPenPreview,pageRef,setCrop,cropRef,paintRef,colorRef,regionRef,selectionPixels,selectionLayer,selectModeRef,selectObjectRef,wandRef,showMask,outlineOf,setRegion,workspace,textFont,changeZoom,setTool}=d;
  retouch.current=createRetouchController(c,()=>({...retouchSettings.current,target:retouchTarget.current}),()=>{saveCanvasRef.current();syncSelection();},notify,uid);
  c.on('selection:created', syncSelection); c.on('selection:updated', syncSelection); c.on('selection:cleared', syncSelection);
  c.on('object:modified', () => saveCanvasRef.current());
  c.on('text:editing:exited', e => {saveCanvasRef.current();void validateTextFont(e.target as Obj);});
  let textTimer: ReturnType<typeof setTimeout>;
  c.on('text:changed', () => { clearTimeout(textTimer); textTimer = setTimeout(() => saveCanvasRef.current(), 400); });
  c.on('path:created', e => { const erase=toolRef.current==='eraser'; if(erase)makeEraserStroke(e.path); Object.assign(e.path, {id:uid(),name:erase?'Eraser stroke':toolRef.current==='highlight'?'Freehand highlight':'Brush stroke'}); c.requestRenderAll(); saveCanvasRef.current(); });
  c.on('object:moving', e => {
    if (!snapRef.current || e.e.altKey) return;
    const o = e.target, p = projectRef.current.pages.find(p => p.id === pageIdRef.current)!;
    if (!p) return;
    if(p.guides){const b=o.getBoundingRect(),d=snapToGuides(b,p.guides,6/zoomRef.current);if(d.x)o.set('left',o.left+d.x);if(d.y)o.set('top',o.top+d.y);}
    const center = o.getCenterPoint();
    if (Math.abs(center.x - p.width / 2) < 5) o.set('left', o.left + p.width / 2 - center.x);
    if (Math.abs(center.y - p.height / 2) < 5) o.set('top', o.top + p.height / 2 - center.y);
    if (Math.abs(o.left) < 5) o.set('left', 0);
    if (Math.abs(o.top) < 5) o.set('top', 0);
  });
  let zoomDrag:{x:number;y:number;initial:number;out:boolean;dragged:boolean}|null=null;
  // Screen position of a mouse or touch event (Fabric hands either to the tools).
  const client=(ev:Event)=>{const t=(ev as TouchEvent).touches?.[0]??(ev as TouchEvent).changedTouches?.[0];return t?{clientX:t.clientX,clientY:t.clientY,button:0,altKey:false}:ev as MouseEvent;};
  let selectionDrag:{id:string;points:SelectionPoint[];op:MaskOp;base:SelectionRegion|null;baseOutline?:string;prior:SelectionRegion|null}|null=null;
  let gradientDrag:{start:SelectionPoint;line:Line}|null=null,maskStroke:ReturnType<typeof createMaskBrush>|null=null,cropStart:SelectionPoint|null=null,cropBefore:typeof cropRef.current=null;
  let origin = { x: 0, y: 0 }, shape: Obj | null = null;
  let pan: { x: number; y: number; left: number; top: number } | null = null;
  // Touch: a tap on an already selected text box edits it where tapped, even on
  // one of its handles (on a small box their touch areas cover most of it).
  let tapText:Textbox|null=null,touchBefore:FabricObject|undefined;
  const touch=(ev:Event)=>ev.type.startsWith('touch');
  c.on('mouse:down:before',e=>{const a=touchBefore=c.getActiveObject();tapText=toolRef.current==='select'&&touch(e.e)&&a instanceof Textbox&&a.editable&&!a.isEditing?a:null;});
  c.on('mouse:up',e=>{const t=tapText,tr=e.transform;tapText=null;if(!t||e.target!==t||!tr?.corner||tr.corner==='mtr'||tr.actionPerformed||!t.containsPoint(e.scenePoint))return;t.enterEditing(e.e);t.setCursorByClick(e.e);});
  c.on('mouse:dblclick',()=>{if(toolRef.current==='pen'&&penRef.current&&penRef.current.anchors.length>2)finishPenRef.current(false);});
  c.on('contextmenu', e=>{
    if(loading.current)return;const skip=c.skipTargetFind;c.skipTargetFind=false;
    let target;try{target=c.findTarget(e.e as MouseEvent).target;}finally{c.skipTargetFind=skip;}
    if(target)openLayerMenu(target as Obj,(e.e as MouseEvent).clientX,(e.e as MouseEvent).clientY);else setLayerMenu(null);
  });
  c.on('mouse:down', e => {
    if (loading.current) return;
    if((e.e as MouseEvent).button>0)return;
    const t = toolRef.current;
    if(t==='zoom'){const event=client(e.e);if(event.button!==0)return;zoomDrag={x:event.clientX,y:event.clientY,initial:zoomRef.current,out:zoomOutRef.current!==!!event.altKey,dragged:false};return;}
    if(retouch.current?.down({x:e.scenePoint.x,y:e.scenePoint.y},!!e.e.altKey))return;
    if(t==='pen'){
      const pt={x:e.scenePoint.x,y:e.scenePoint.y},st=penRef.current;
      if(st&&st.anchors.length>=2&&nearPoint(pt,st.anchors[0],8/zoomRef.current)){finishPen(true);return;}
      if(st){st.anchors.push(pt);st.dragging=true;}else penRef.current={anchors:[pt],dragging:true};
      setPenPreview({anchors:[...penRef.current!.anchors],cursor:pt});return;
    }
    if(t==='crop'){const p=pageRef.current,pt={x:Math.max(0,Math.min(p.width,e.scenePoint.x)),y:Math.max(0,Math.min(p.height,e.scenePoint.y))};cropStart=pt;cropBefore=cropRef.current;setCrop({rect:{left:pt.x,top:pt.y,width:0,height:0},angle:cropRef.current?.angle??0});return;}
    if(t==='gradient'){const pt=e.scenePoint,line=new Line([pt.x,pt.y,pt.x,pt.y],{stroke:'#25272d',strokeWidth:1.5/zoomRef.current,strokeDashArray:[5/zoomRef.current,4/zoomRef.current],selectable:false,evented:false,excludeFromExport:true});gradientDrag={start:{x:pt.x,y:pt.y},line};c.add(line);return;}
    if(t==='bucket'){
      const p=pageRef.current,b=paintRef.current.bucket,target=retouchTarget.current&&c.getObjects().includes(retouchTarget.current)?retouchTarget.current:undefined;
      if(p.source&&b.allLayers){notify('Unlock Original PDF in Layers first, so the bucket can see its pixels.');return;}
      try{const layer=bucketFill(samplePage(c,p,b.allLayers||!target?undefined:[target]),{x:e.scenePoint.x,y:e.scenePoint.y},colorRef.current,b,regionRef.current?selectionPixels(regionRef.current):undefined);
        if(!layer){notify('Nothing to fill there.');return;}
        Object.assign(layer,{id:uid(),name:'Fill'});c.add(layer);c.requestRenderAll();saveCanvasRef.current();syncSelection();}
      catch(error){notify(error instanceof Error?error.message:String(error));}
      return;
    }
    if(t==='mask'){
      const target=retouchTarget.current;
      if(!target||target.lockMovementX||!c.getObjects().includes(target)||target instanceof ActiveSelection){notify('Select one unlocked layer, then paint its mask.');return;}
      const m=paintRef.current.maskBrush;maskStroke=createMaskBrush(target,m);maskStroke.to({x:e.scenePoint.x,y:e.scenePoint.y});return;
    }
    if(t==='marquee'||t==='lasso'||t==='wand'||t==='object'){
      const target=selectionLayer();
      if(!target){notify(projectRef.current.pages.find(p=>p.id===pageIdRef.current)?.source?'Unlock Original PDF in Layers to select its pixels, or select an overlay layer.':'Select an unlocked layer before drawing a selection.');return;}
      const op=e.e.shiftKey||e.e.altKey?maskOpFor(e.e.shiftKey,e.e.altKey):selectModeRef.current,base=op==='replace'?null:regionRef.current,pt={x:e.scenePoint.x,y:e.scenePoint.y};
      if(t==='object'){void selectObjectRef.current(target.id!,pt,op,base);return;}
      if(t==='wand'){
        try{const p=pageRef.current,w=wandRef.current,sample=samplePage(c,p,w.allLayers?undefined:[target]);
          showMask(target.id!,combineMasks(base?selectionPixels(base):null,floodSelect(sample.data,sample.width,sample.height,pt.x,pt.y,w),op));}
        catch(error){notify(error instanceof Error?error.message:String(error));}
        return;
      }
      selectionDrag={id:target.id!,points:[pt],op,base,baseOutline:base?base.outline??outlineOf(base.points):undefined,prior:regionRef.current};if(!base)setRegion(null);return;
    }
    if (t === 'hand') { const event = client(e.e); pan = { x: event.clientX, y: event.clientY, left: workspace.current!.scrollLeft, top: workspace.current!.scrollTop }; return; }
    if (['select','brush','highlight','eraser'].includes(t)) return;
    const point = e.scenePoint; origin = { x: point.x, y: point.y };
    const shared = { left: point.x, top: point.y, fill: colorRef.current, strokeWidth: 0 };
    if (t === 'text') shape = new Textbox('Your text', { ...shared, width: 240, fontSize: 28, fontFamily: textFont.current });
    if (t === 'rect') shape = new Rect({ ...shared, width: 1, height: 1 });
    if (t === 'ellipse') shape = new Ellipse({ ...shared, rx: 1, ry: 1 });
    if (t === 'line') shape = new Line([point.x,point.y,point.x,point.y], { stroke: colorRef.current, strokeWidth: 2 });
    if (shape) { Object.assign(shape, { id: uid(), name: t === 'text' ? 'Text box' : t.charAt(0).toUpperCase()+t.slice(1) }); c.add(shape); c.setActiveObject(shape); }
  });
  c.on('mouse:move', e => {
    if(toolRef.current==='zoom'){c.setCursor(zoomOutRef.current!==!!e.e.altKey?'zoom-out':'zoom-in');}
    if(zoomDrag){if(toolRef.current!=='zoom'){zoomDrag=null;return;}const event=client(e.e),dx=event.clientX-zoomDrag.x;if(Math.abs(dx)>4||zoomDrag.dragged){zoomDrag.dragged=true;changeZoom(zoomDrag.initial*Math.exp(Math.max(-600,Math.min(600,dx))*0.01),{x:zoomDrag.x,y:zoomDrag.y});}return;}
    if(retouch.current?.move({x:e.scenePoint.x,y:e.scenePoint.y}))return;
    if(gradientDrag){gradientDrag.line.set({x2:e.scenePoint.x,y2:e.scenePoint.y});c.requestRenderAll();return;}
    if(toolRef.current==='pen'&&penRef.current){const st=penRef.current,pt={x:e.scenePoint.x,y:e.scenePoint.y};if(st.dragging){const i=st.anchors.length-1;st.anchors[i]=withHandles(st.anchors[i],pt);}setPenPreview({anchors:[...st.anchors],cursor:pt});return;}
    if(cropStart){const p=pageRef.current,x=Math.max(0,Math.min(p.width,e.scenePoint.x)),y=Math.max(0,Math.min(p.height,e.scenePoint.y)),a=cropStart;setCrop(cr=>({rect:{left:Math.min(a.x,x),top:Math.min(a.y,y),width:Math.abs(x-a.x),height:Math.abs(y-a.y)},angle:cr?.angle??0}));return;}
    if(maskStroke){maskStroke.to({x:e.scenePoint.x,y:e.scenePoint.y});return;}
    if(selectionDrag){const pt={x:e.scenePoint.x,y:e.scenePoint.y};
      const outline=selectionDrag.baseOutline;
      if(toolRef.current==='marquee'){selectionDrag.points=[selectionDrag.points[0],pt];setRegion({id:selectionDrag.id,points:rectanglePoints(selectionDrag.points[0],pt),outline});}
      else {const last=selectionDrag.points.at(-1)!;if(Math.hypot(pt.x-last.x,pt.y-last.y)>2&&selectionDrag.points.length<2000)selectionDrag.points.push(pt);setRegion({id:selectionDrag.id,points:[...selectionDrag.points],outline});}return;
    }
    if (pan) { const event = client(e.e); workspace.current!.scrollLeft = pan.left - event.clientX + pan.x; workspace.current!.scrollTop = pan.top - event.clientY + pan.y; return; }
    if (!shape) return;
    const pt = e.scenePoint, dx = pt.x-origin.x, dy = pt.y-origin.y;
    if (toolRef.current === 'text') shape.set({ width: Math.max(80, Math.abs(dx)) });
    else if (shape instanceof Line) shape.set({ x2: pt.x, y2: pt.y });
    else { const vals = { left: Math.min(origin.x, pt.x), top: Math.min(origin.y, pt.y) }; if (shape instanceof Ellipse) shape.set({ ...vals, rx: Math.abs(dx)/2, ry: Math.abs(dy)/2 }); else shape.set({ ...vals, width: Math.abs(dx), height: Math.abs(dy) }); }
    c.requestRenderAll();
  });
  c.on('mouse:up', e => {
    if(zoomDrag){const drag=zoomDrag;zoomDrag=null;if(toolRef.current==='zoom'&&!drag.dragged)changeZoom(drag.initial*(drag.out?1/1.25:1.25),{x:drag.x,y:drag.y});return;}
    if(retouch.current?.up())return;
    if(maskStroke){maskStroke=null;saveCanvasRef.current();return;}
    if(penRef.current?.dragging){penRef.current.dragging=false;return;}
    if(cropStart){cropStart=null;setCrop(cr=>cr&&cr.rect.width>=4&&cr.rect.height>=4?cr:null);return;}
    if(gradientDrag){
      const {start,line}=gradientDrag,end={x:line.x2,y:line.y2};gradientDrag=null;c.remove(line);
      if(Math.hypot(end.x-start.x,end.y-start.y)<2){c.requestRenderAll();return;}
      const g=paintRef.current,layer=gradientLayer(pageRef.current,start,end,{...g.gradient,from:colorRef.current,to:g.secondColor},regionRef.current?selectionPixels(regionRef.current):undefined);
      Object.assign(layer,{id:uid(),name:'Gradient'});c.add(layer);c.setActiveObject(layer);c.requestRenderAll();saveCanvasRef.current();syncSelection();return;
    }
    if(selectionDrag){
      // Shift/Alt drags combine with the previous selection into one mask.
      const drag=selectionDrag;selectionDrag=null;const points=toolRef.current==='marquee'&&drag.points.length===2?rectanglePoints(drag.points[0],drag.points[1]):drag.points;
      if(drag.base&&points.length>2)try{showMask(drag.id,combineMasks(selectionPixels(drag.base),polygonMask(points,pageRef.current),drag.op));}catch(error){notify(error instanceof Error?error.message:String(error));}
      return;
    }
    pan = null;
    if (!shape) return;
    if (shape.width < 3 && shape.height < 3) {
      if (shape instanceof Ellipse) shape.set({ rx: 70, ry: 50 });
      else if (!(shape instanceof Line)) shape.set({ width: 160, height: 100 });
      else shape.set({ x2: shape.x1 + 160 });
    }
    shape.setCoords(); c.setActiveObject(shape);
    // On a phone the new text box is ready to type over (the keyboard opens with it).
    if (shape instanceof Textbox && touch(e.e)) { shape.enterEditing(); shape.selectAll(); }
    c.requestRenderAll(); shape = null; setTool('select'); saveCanvasRef.current(); syncSelection();
  });
  // A pinch took over a touch the canvas had already started: undo what it did, without a history step.
  const cancel=()=>{
    const f=c as unknown as {_currentTransform:Transform|null;_isCurrentlyDrawing:boolean;_groupSelector:unknown};
    const t=f._currentTransform;if(t){t.target.set(t.original);t.target.setCoords();t.target.isMoving=false;f._currentTransform=null;}
    if(f._isCurrentlyDrawing){f._isCurrentlyDrawing=false;c.clearContext(c.contextTop);}
    f._groupSelector=null;tapText=null;zoomDrag=null;pan=null;retouch.current?.cancel();
    if(shape){c.remove(shape);shape=null;}
    if(gradientDrag){c.remove(gradientDrag.line);gradientDrag=null;}
    if(selectionDrag){setRegion(selectionDrag.prior);selectionDrag=null;}
    if(cropStart){cropStart=null;setCrop(cropBefore);}
    const pen=penRef.current;if(pen?.dragging){pen.dragging=false;pen.anchors.pop();if(pen.anchors.length)setPenPreview({anchors:[...pen.anchors]});else{penRef.current=null;setPenPreview(null);}}
    // Selection as before the touch; a text box must not start editing when the fingers lift.
    if(c.getActiveObject()!==touchBefore){if(touchBefore&&c.getObjects().includes(touchBefore))c.setActiveObject(touchBefore);else c.discardActiveObject();}
    const a=c.getActiveObject();if(a instanceof Textbox&&!a.isEditing)(a as unknown as {selected:boolean}).selected=false;
    c.requestRenderAll();syncSelection();
  };
  const targetAt=(e:Event)=>{const skip=c.skipTargetFind;c.skipTargetFind=false;try{return c.findTarget(e as MouseEvent).target;}finally{c.skipTargetFind=skip;}};
  const touchHooks:TouchHooks={cancel,
    // Tools that act at once where the finger lands wait until it lifts (Move and the mask brush: until it moves), so a slow pinch never triggers them.
    wait:()=>['bucket','wand','object'].includes(toolRef.current)?'lift':['select','mask'].includes(toolRef.current),
    // Move tool: one finger scrolls unless it lands on the selected, unlocked layer (tap a layer first to move it).
    dragPans:e=>{if(toolRef.current!=='select'||loading.current)return false;const t=targetAt(e);return !t||!!t.lockMovementX||!c.getActiveObjects().concat(c.getActiveObject()??[]).includes(t);},
    // Long press = right-click: the layer menu.
    longPress:e=>{
      if(toolRef.current!=='select'||loading.current)return false;const a=c.getActiveObject(),t=targetAt(e),p=e.touches[0];
      if(!t||!p||(a instanceof Textbox&&a.isEditing))return false;openLayerMenu(t as Obj,p.clientX,p.clientY);return true;
    }};
  const detachReveal=revealEditedText(c,{zoomRef,workspace,changeZoom});
  return Object.assign(()=>{clearTimeout(textTimer);detachReveal();},{touch:touchHooks});
}
