import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Canvas, StaticCanvas, Textbox, Rect, Ellipse, Line, FabricImage, FabricObject, PencilBrush, Group, ActiveSelection, filters } from 'fabric';
import { ArrowDown, ArrowUp, ArrowUpRight, Bold, Check, ChevronDown, ChevronLeft, ChevronRight, Circle, Command, Copy, Download, Eraser, Eye, EyeOff, FileImage, FilePlus2, FileText, FolderOpen, GripVertical, Hand, Highlighter, ImagePlus, Italic, Layers, LockKeyhole, Maximize, Merge, Minus, MoreHorizontal, MousePointer2, PanelLeftClose, PenLine, Plus, Redo2, RotateCw, Save, Scaling, Scissors, Search, Settings2, ShieldCheck, SlidersHorizontal, Sparkles, Square, Trash2, Type, Underline, Undo2, UnlockKeyhole, X, ZoomIn } from 'lucide-react';
import { autosave, blankPage, demoProject, download, restoreLocal, safeName, uid, type Page, type Project } from './model';
import Signature from './Signature';
import { engineHealth, restoreSources, importDocument, exportInBrowser } from './browser/engine';
import PDFPreview from './browser/PDFPreview';
import { StampForm, CropForm, PasswordForm, type StampOptions, type CropMargins } from './DocumentTools';
import { selectPages } from './page-range';
import { blendModes, hasBlending } from './browser/layer-utils';
import Diagrams, {type DiagramCommands} from './Diagrams';
import {clampZoom, fitZoom, markerColor} from './editor-tools';
import WorkspaceDock, {workspaces, type Workspace} from './WorkspaceDock';
import PdfWorkspace, {type PdfTool} from './PdfWorkspace';
import {PUBLIC_DEMO, DOWNLOAD_URL} from './build-flags';
import {makeBrush, makeEraserStroke, brushWidth, brushNames, type BrushKind} from './brushes';
import PageMenu from './PageMenu';
import {useWorkspaceTools} from './workspace-tools';

type Obj = FabricObject & { id?: string; name?: string; diagramXml?: string; text?: string; fontSize?: number; fontFamily?: string; fontWeight?: string | number; fontStyle?: string; underline?: boolean; textAlign?: string; isEditing?: boolean };
type Tool = 'select' | 'text' | 'rect' | 'ellipse' | 'line' | 'brush' | 'highlight' | 'eraser' | 'hand';
type Modal = 'new' | 'export' | 'signature' | 'shortcuts' | 'resize' | 'watermark' | 'numbers' | 'crop' | null;
const TOOLS: { id: Tool; label: string; key: string; icon: typeof Type }[] = [
  { id: 'select', label: 'Move & select', key: 'V', icon: MousePointer2 }, { id: 'text', label: 'Text box', key: 'T', icon: Type },
  { id: 'rect', label: 'Rectangle', key: 'R', icon: Square }, { id: 'ellipse', label: 'Ellipse', key: 'O', icon: Circle },
  { id: 'line', label: 'Line', key: 'L', icon: Minus }, { id: 'brush', label: 'Brush', key: 'B', icon: PenLine },
  { id: 'highlight', label: 'Highlight', key: 'H', icon: Highlighter }, { id: 'eraser', label: 'Eraser', key: 'E', icon: Eraser }, { id: 'hand', label: 'Pan', key: 'Space', icon: Hand },
];

function IconButton({ icon: Icon, label, onClick, disabled, active }: { icon: typeof Type; label: string; onClick: () => void; disabled?: boolean; active?: boolean }) {
  return <button type="button" className={`icon-button ${active ? 'active' : ''}`} title={label} aria-label={label} onClick={onClick} disabled={disabled}><Icon size={16}/></button>;
}
function Field({ label, value, onChange, min, max, step = 1 }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number }) {
  return <label className="number-field"><span>{label}</span><input aria-label={label} type="number" value={Number.isFinite(value) ? Math.round(value * 100) / 100 : 0} min={min} max={max} step={step} onChange={e => { const v = Number(e.target.value); if (Number.isFinite(v)) onChange(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v))); }}/></label>;
}
function ModalShell({ title, children, close, wide }: { title: string; children: ReactNode; close: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const root = ref.current;
    ((root?.querySelector('input:not([type=color]),textarea,select') || root?.querySelector('button')) as HTMLElement)?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      if (e.key !== 'Tab' || !root) return;
      const items = [...root.querySelectorAll<HTMLElement>('button:not([disabled]),input,select,textarea,[tabindex="0"]')];
      if (e.shiftKey && document.activeElement === items[0]) { e.preventDefault(); items.at(-1)?.focus(); }
      if (!e.shiftKey && document.activeElement === items.at(-1)) { e.preventDefault(); items[0]?.focus(); }
    };
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); previous?.focus(); };
  }, []);
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}><div ref={ref} className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}><div className="modal-header"><h2>{title}</h2><IconButton icon={X} label="Close dialog" onClick={close}/></div>{children}</div></div>;
}

export default function App() {
  const [view, setView] = useState<Workspace>(()=>PUBLIC_DEMO && window.innerWidth<700 ? 'pdf' : 'photo');
  const [pdfHome, setPdfHome] = useState(true);
  const documentView = useRef<'photo'|'pdf'>(view==='pdf'?'pdf':'photo');
  const [diagramsVisited, setDiagramsVisited] = useState(false);
  const diagramCommands = useRef<DiagramCommands | null>(null);
  const diagramTarget = useRef<string | undefined>(undefined);
  const [project, setProject] = useState<Project>(demoProject);
  const projectRef = useRef(project); projectRef.current = project;
  const [pageId, setPageId] = useState(project.pages[0].id);
  const pageIdRef = useRef(pageId); pageIdRef.current = pageId;
  const page = project.pages.find(p => p.id === pageId) || project.pages[0];
  const canvasEl = useRef<HTMLCanvasElement>(null);
  const canvas = useRef<Canvas | null>(null);
  const workspace = useRef<HTMLDivElement>(null);
  const artboard = useRef<HTMLDivElement>(null);
  const zoomAnchor = useRef<{x:number;y:number;screenX:number;screenY:number}|null>(null);
  const fittedPage = useRef('');
  const [ready, setReady] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const loading = useRef(false);
  const [tool, setTool] = useState<Tool>('select');
  const toolRef = useRef(tool); toolRef.current = tool;
  const [zoom, setZoom] = useState(0.72);
  const zoomRef = useRef(zoom); zoomRef.current = zoom;
  const [selected, setSelected] = useState<Obj | null>(null);
  const [, refresh] = useState(0);
  const [color, setColor] = useState('#00395d');
  const colorRef = useRef(color); colorRef.current = color;
  const [brushSize, setBrushSize] = useState(4);
  const [brushKind, setBrushKind] = useState<BrushKind>('round');
  const [brushOpacity, setBrushOpacity] = useState(100);
  const [eraserSize, setEraserSize] = useState(24);
  const [highlightColor, setHighlightColor] = useState('#ffe066');
  const [highlightSize, setHighlightSize] = useState(22);
  const [highlightOpacity, setHighlightOpacity] = useState(38);
  const [layers, setLayers] = useState<Obj[]>([]);
  const [modal, setModal] = useState<Modal>(null);
  const [palette, setPalette] = useState(false);
  const [query, setQuery] = useState('');
  const [commandIndex, setCommandIndex] = useState(0);
  const [menu, setMenu] = useState<string | null>(null);
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [health, setHealth] = useState({ ok: false, office: false });
  const [format, setFormat] = useState('pdf');
  const [compression, setCompression] = useState('lossless');
  const [range, setRange] = useState('');
  const [protect, setProtect] = useState(false);
  const [exportPassword, setExportPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [passwordPrompt, setPasswordPrompt] = useState<{ name: string; incorrect: boolean; resolve: (password: string | null) => void } | null>(null);
  const [importNotice, setImportNotice] = useState('');
  const [dpi, setDpi] = useState(144);
  const [newWidth, setNewWidth] = useState(595);
  const [newHeight, setNewHeight] = useState(842);
  const [newName, setNewName] = useState('Untitled document');
  const [snap, setSnap] = useState(true);
  const snapRef = useRef(snap); snapRef.current = snap;
  const [leftOpen, setLeftOpen] = useState(true);
  const [draggingFile, setDraggingFile] = useState(false);
  const [pageMenu, setPageMenu] = useState<{id:string;x:number;y:number}|null>(null);
  const [pageDrag, setPageDrag] = useState<string | null>(null);
  const history = useRef<{ past: Project[]; future: Project[] }>({ past: [], future: [] });
  const clipboard = useRef<Obj | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const projectInput = useRef<HTMLInputElement>(null);
  const importMode = useRef<'open' | 'append'>('open');
  const saveCanvasRef = useRef<() => void>(() => {});
  const notify = (s: string) => { setToast(s); setTimeout(() => setToast(''), 4200); };
  const fail = (e: unknown) => setError(e instanceof Error ? e.message : String(e));

  function commit(next: Project, reload = false) {
    history.current.past.push(projectRef.current);
    if (history.current.past.length > 45) history.current.past.shift();
    history.current.future = [];
    projectRef.current = next; setProject(next); setSaved(false);
    if (reload) setEpoch(v => v + 1);
  }
  function capture(): Project {
    const c = canvas.current;
    if (!c || loading.current) return projectRef.current;
    const next = { ...projectRef.current, pages: projectRef.current.pages.map(p => p.id === pageIdRef.current ? { ...p, canvas: c.toObject(), thumb: c.toDataURL({ multiplier: 0.2, format: 'png' }) } : p) };
    return next;
  }
  function saveCanvas() {
    if (loading.current || !canvas.current) return;
    const next = capture();
    commit(next);
    setLayers([...canvas.current.getObjects()].reverse() as Obj[]);
    refresh(v => v + 1);
  }
  saveCanvasRef.current = saveCanvas;
  function syncSelection() {
    const c = canvas.current;
    setSelected((c?.getActiveObject() as Obj) || null);
    if (c) setLayers([...c.getObjects()].reverse() as Obj[]);
    refresh(v => v + 1);
  }
  function fit() {
    const root = workspace.current;
    const p = projectRef.current.pages.find(p => p.id === pageIdRef.current) || projectRef.current.pages[0];
    if (root && root.clientWidth>0 && root.clientHeight>0) { fittedPage.current=p.id;zoomAnchor.current = null; setZoom(fitZoom(p.width, p.height, root.clientWidth, root.clientHeight)); root.scrollTo(0,0); }
  }
  function changeZoom(value: number, at?: {x:number;y:number}) {
    const root = workspace.current, board = artboard.current;
    if (root && board) {
      const viewport = root.getBoundingClientRect(), bounds = board.getBoundingClientRect();
      const screenX = at?.x ?? viewport.left + root.clientWidth/2;
      const screenY = at?.y ?? viewport.top + root.clientHeight/2;
      zoomAnchor.current = {x:(screenX-bounds.left)/zoomRef.current,y:(screenY-bounds.top)/zoomRef.current,screenX,screenY};
    }
    setZoom(clampZoom(value));
  }
  function selectWorkspace(next: Workspace) {
    setMenu(null);setModal(null);setPalette(false);setDraggingFile(false);
    if(next==='diagrams'){diagramTarget.current=undefined;setDiagramsVisited(true);}
    else {documentView.current=next;if(next==='pdf')setPdfHome(true);}
    setView(next);
  }
  function openDiagrams() {selectWorkspace('diagrams');}
  useWorkspaceTools(view, selectWorkspace);
  useLayoutEffect(()=>{if(ready&&view!=='diagrams'&&!(view==='pdf'&&pdfHome)&&fittedPage.current!==page.id)fit();},[view,pdfHome,ready]);
  async function placeDiagram(data: string, xml: string, name: string) {
    const c = canvas.current; if (!c) return;
    const previous = c.getObjects().find(o=>(o as Obj).id===diagramTarget.current);
    if (previous instanceof FabricImage && !previous.lockMovementX) {
      const w = previous.getScaledWidth(), h = previous.getScaledHeight();
      await previous.setSrc(data); previous.set({scaleX:w/previous.width,scaleY:h/previous.height});
      Object.assign(previous,{diagramXml:xml,name});previous.setCoords();c.setActiveObject(previous);
      c.requestRenderAll();saveCanvas();syncSelection();
    } else {
      const image = await FabricImage.fromURL(data);
      image.scale(Math.min((page.width-60)/image.width,(page.height-60)/image.height,0.5));
      image.set({left:(page.width-image.getScaledWidth())/2,top:(page.height-image.getScaledHeight())/2});
      Object.assign(image,{diagramXml:xml});addObject(image,name);
    }
    diagramTarget.current = undefined; setView(documentView.current);setPdfHome(false); notify('Diagram placed. Its editable source is included when you save a .bide project.');
  }
  function editDiagram() {
    if (!selected?.diagramXml || selected.lockMovementX) return;
    openDiagrams();diagramTarget.current=selected.id;
    // The component mounts on first use. Wait until its command bridge exists.
    const next={name:selected.name||'Diagram',xml:selected.diagramXml};
    const apply=()=>{if(diagramCommands.current)diagramCommands.current.edit(next);else requestAnimationFrame(apply);};
    requestAnimationFrame(apply);
  }

  useEffect(() => {
    const root=workspace.current;if(!root)return;
    const wheel=(event:WheelEvent)=>{
      if (!(event.ctrlKey||event.metaKey||event.altKey)) return;
      event.preventDefault();
      const delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?root.clientHeight:1);
      changeZoom(zoomRef.current*Math.exp(-Math.max(-240,Math.min(240,delta))*0.003),{x:event.clientX,y:event.clientY});
    };
    root.addEventListener('wheel',wheel,{passive:false});
    return()=>root.removeEventListener('wheel',wheel);
  }, []);

  useEffect(() => {
    engineHealth().then(setHealth).catch(fail);
    restoreLocal().then(async data => {
      if (data?.version === 1 && data.pages.length) {
        await restoreSources(data.sources);
        projectRef.current = data; setProject(data); setPageId(data.pages[0].id); setEpoch(v => v + 1);
      }
    }).catch(fail).finally(() => setInitializing(false));
  }, []);

  useEffect(() => {
    if (initializing) return;
    const timer = setTimeout(() => autosave(project).then(() => setSaved(true)).catch(() => { setSaved(false); notify('Local autosave is unavailable. Save a .bide project to keep your work.'); }), 900);
    return () => clearTimeout(timer);
  }, [project, initializing]);

  useEffect(() => {
    const c = new Canvas(canvasEl.current!, { preserveObjectStacking: true, selection: true, backgroundColor: '', stopContextMenu: true });
    canvas.current = c;
    c.on('selection:created', syncSelection); c.on('selection:updated', syncSelection); c.on('selection:cleared', syncSelection);
    c.on('object:modified', () => saveCanvasRef.current());
    c.on('text:editing:exited', () => saveCanvasRef.current());
    let textTimer: ReturnType<typeof setTimeout>;
    c.on('text:changed', () => { clearTimeout(textTimer); textTimer = setTimeout(() => saveCanvasRef.current(), 400); });
    c.on('path:created', e => { const erase=toolRef.current==='eraser'; if(erase)makeEraserStroke(e.path); Object.assign(e.path, {id:uid(),name:erase?'Eraser stroke':toolRef.current==='highlight'?'Freehand highlight':'Brush stroke'}); c.requestRenderAll(); saveCanvasRef.current(); });
    c.on('object:moving', e => {
      if (!snapRef.current || e.e.altKey) return;
      const o = e.target, p = projectRef.current.pages.find(p => p.id === pageIdRef.current)!;
      if (!p) return;
      const center = o.getCenterPoint();
      if (Math.abs(center.x - p.width / 2) < 5) o.set('left', o.left + p.width / 2 - center.x);
      if (Math.abs(center.y - p.height / 2) < 5) o.set('top', o.top + p.height / 2 - center.y);
      if (Math.abs(o.left) < 5) o.set('left', 0);
      if (Math.abs(o.top) < 5) o.set('top', 0);
    });
    let origin = { x: 0, y: 0 }, shape: Obj | null = null;
    let pan: { x: number; y: number; left: number; top: number } | null = null;
    c.on('mouse:down', e => {
      if (loading.current) return;
      const t = toolRef.current;
      if (t === 'hand') { const event = e.e as MouseEvent; pan = { x: event.clientX, y: event.clientY, left: workspace.current!.scrollLeft, top: workspace.current!.scrollTop }; return; }
      if (['select','brush','highlight','eraser'].includes(t)) return;
      const point = e.scenePoint; origin = { x: point.x, y: point.y };
      const shared = { left: point.x, top: point.y, fill: colorRef.current, strokeWidth: 0 };
      if (t === 'text') shape = new Textbox('Your text', { ...shared, width: 240, fontSize: 28, fontFamily: 'Arial' });
      if (t === 'rect') shape = new Rect({ ...shared, width: 1, height: 1 });
      if (t === 'ellipse') shape = new Ellipse({ ...shared, rx: 1, ry: 1 });
      if (t === 'line') shape = new Line([point.x,point.y,point.x,point.y], { stroke: colorRef.current, strokeWidth: 2 });
      if (shape) { Object.assign(shape, { id: uid(), name: t === 'text' ? 'Text box' : t.charAt(0).toUpperCase()+t.slice(1) }); c.add(shape); c.setActiveObject(shape); }
    });
    c.on('mouse:move', e => {
      if (pan) { const event = e.e as MouseEvent; workspace.current!.scrollLeft = pan.left - event.clientX + pan.x; workspace.current!.scrollTop = pan.top - event.clientY + pan.y; return; }
      if (!shape) return;
      const pt = e.scenePoint, dx = pt.x-origin.x, dy = pt.y-origin.y;
      if (toolRef.current === 'text') shape.set({ width: Math.max(80, Math.abs(dx)) });
      else if (shape instanceof Line) shape.set({ x2: pt.x, y2: pt.y });
      else { const vals = { left: Math.min(origin.x, pt.x), top: Math.min(origin.y, pt.y) }; if (shape instanceof Ellipse) shape.set({ ...vals, rx: Math.abs(dx)/2, ry: Math.abs(dy)/2 }); else shape.set({ ...vals, width: Math.abs(dx), height: Math.abs(dy) }); }
      c.requestRenderAll();
    });
    c.on('mouse:up', () => {
      pan = null;
      if (!shape) return;
      if (shape.width < 3 && shape.height < 3) {
        if (shape instanceof Ellipse) shape.set({ rx: 70, ry: 50 });
        else if (!(shape instanceof Line)) shape.set({ width: 160, height: 100 });
        else shape.set({ x2: shape.x1 + 160 });
      }
      shape.setCoords(); c.setActiveObject(shape); c.requestRenderAll(); shape = null; setTool('select'); saveCanvasRef.current(); syncSelection();
    });
    setReady(true);
    return () => { clearTimeout(textTimer); void c.dispose(); canvas.current = null; };
  }, []);

  useEffect(() => {
    if (!ready || !canvas.current) return;
    const c = canvas.current; let cancelled = false; loading.current = true;
    const controller = new AbortController();
    c.discardActiveObject(); setSelected(null);
    c.loadFromJSON(page.canvas, undefined, { signal: controller.signal }).then(() => {
      if (cancelled) return;
      c.backgroundColor = page.source ? '' : page.color;
      c.getObjects().forEach(o => { if (!(o as Obj).id) Object.assign(o, { id: uid() }); });
      c.requestRenderAll(); loading.current = false; syncSelection();
      if (fittedPage.current !== page.id) fit();
      // Generate a real thumbnail without treating it as a user edit.
      const thumb = c.toDataURL({ multiplier: 0.2, format: 'png' });
      setProject(current => {
        const next = { ...current, pages: current.pages.map(p => p.id === page.id ? { ...p, thumb } : p) };
        projectRef.current = next;
        return next;
      });
    }).catch(e => { if (!cancelled) { loading.current = false; fail(e); } });
    return () => { cancelled = true; controller.abort(); };
  }, [ready, pageId, epoch]);

  useLayoutEffect(() => {
    const c = canvas.current; if (!c) return;
    c.backgroundColor = page.source ? '' : page.color;
    c.setDimensions({ width: page.width * zoom, height: page.height * zoom });
    c.setViewportTransform([zoom,0,0,zoom,0,0]); c.requestRenderAll();
    const anchor=zoomAnchor.current,root=workspace.current,bounds=artboard.current?.getBoundingClientRect();
    if(anchor&&root&&bounds){root.scrollLeft+=bounds.left+anchor.x*zoom-anchor.screenX;root.scrollTop+=bounds.top+anchor.y*zoom-anchor.screenY;zoomAnchor.current=null;}
  }, [zoom, page.width, page.height, page.color, page.source, ready]);

  useEffect(() => {
    const c = canvas.current; if (!c) return;
    c.isDrawingMode = tool === 'brush' || tool === 'highlight' || tool === 'eraser'; c.selection = tool === 'select'; c.skipTargetFind = tool !== 'select';
    c.defaultCursor = tool === 'hand' ? 'grab' : tool === 'select' ? 'default' : 'crosshair';
    if (c.isDrawingMode) {
      const brush = tool==='brush' ? makeBrush(c,brushKind,color,brushSize,brushOpacity) : new PencilBrush(c);
      if(tool!=='brush') {brush.color=tool==='eraser'?'rgba(100,130,150,0.35)':markerColor(highlightColor,highlightOpacity);brush.width=tool==='eraser'?eraserSize:highlightSize;}
      c.freeDrawingBrush = brush;
    }
    if (tool !== 'select') c.discardActiveObject();
    c.requestRenderAll();
  }, [tool, color, brushSize, brushKind, brushOpacity, eraserSize, highlightColor, highlightSize, highlightOpacity, ready]);

  function updateObject(values: Record<string, unknown>, save = true) {
    const c = canvas.current, o = c?.getActiveObject(); if (!c || !o) return;
    if (o.lockMovementX && !Object.keys(values).every(key => key === 'name')) { notify('Unlock this layer before editing it.'); return; }
    o.set(values); o.setCoords(); c.requestRenderAll(); refresh(v => v+1); if (save) saveCanvas();
  }
  function addObject(o: Obj, name: string) {
    const c = canvas.current; if (!c) return;
    Object.assign(o, { id: uid(), name }); c.add(o); c.setActiveObject(o); setTool('select'); c.requestRenderAll(); saveCanvas(); syncSelection();
  }
  function addText() { addObject(new Textbox('Your text', { left: 60, top: 90, width: 300, fontSize: 32, fill: color, fontFamily: 'Arial' }), 'Text box'); }
  async function addImage(file: File | string, name = 'Image') {
    try {
      const url = typeof file === 'string' ? file : await new Promise<string>((resolve,reject) => { const r = new FileReader(); r.onload = () => resolve(r.result as string); r.onerror = reject; r.readAsDataURL(file); });
      const image = await FabricImage.fromURL(url);
      image.scale(Math.min((page.width-100)/image.width,(page.height-120)/image.height,1));
      image.set({ left: (page.width-image.getScaledWidth())/2, top: (page.height-image.getScaledHeight())/2 });
      addObject(image, typeof file === 'string' ? name : file.name);
    } catch { fail(new Error('This image could not be opened. Try PNG, JPEG, or WebP.')); }
  }
  function removeSelected() {
    const c = canvas.current; if (!c) return;
    const selectedObjects = c.getActiveObjects().filter(o => !o.lockMovementX);
    if (!selectedObjects.length) return;
    c.discardActiveObject(); c.remove(...selectedObjects); c.requestRenderAll(); saveCanvas(); syncSelection();
  }
  async function duplicate() {
    const c = canvas.current, o = c?.getActiveObject(); if (!o || !c) return;
    const clone = await o.clone() as Obj; clone.set({ left: clone.left + 18, top: clone.top + 18 });
    if (clone instanceof ActiveSelection) { clone.canvas = c; clone.getObjects().forEach(x => { Object.assign(x, { id: uid() }); c.add(x); }); c.setActiveObject(clone); saveCanvas(); }
    else addObject(clone, `${(o as Obj).name || 'Layer'} copy`);
  }
  function undo(redo = false) {
    if (loading.current) return;
    const h = history.current, from = redo ? h.future : h.past, to = redo ? h.past : h.future;
    const next = from.pop(); if (!next) return;
    to.push(projectRef.current); projectRef.current = next; setProject(next);
    if (!next.pages.some(p => p.id === pageId)) setPageId(next.pages[0].id);
    setEpoch(v => v+1); setSaved(false);
  }
  function saveProject() {
    const data = capture();
    download(new Blob([JSON.stringify(data)], { type: 'application/json' }), `${safeName(data.name)}.bide`);
    notify('Editable project saved, including original PDFs and images.');
  }
  async function loadProject(file: File) {
    setBusy('Opening project…');
    try {
      const data = JSON.parse(await file.text()) as Project;
      if (data.version !== 1 || !Array.isArray(data.pages) || !data.pages.length || !data.sources || data.pages.some(p => !p.id || !p.canvas || !Number.isFinite(p.width) || !Number.isFinite(p.height) || p.width <= 0 || p.height <= 0 || p.width > 14400 || p.height > 14400)) throw new Error('This is not a valid bide project.');
      // Restored canvas images must be embedded, never fetched from the network.
      const validate = (value: unknown): void => { if (!value || typeof value !== 'object') return; for (const [key,v] of Object.entries(value)) { if (key === 'src' && typeof v === 'string' && !v.startsWith('data:image/')) throw new Error('Project images must be embedded.'); if (typeof v === 'object') validate(v); } };
      data.pages.forEach(p => validate(p.canvas));
      await restoreSources(data.sources);
      commit(data,true); setPageId(data.pages[0].id); notify('Project opened.');
    } catch(e) { fail(e); } finally { setBusy(''); }
  }
  async function importWithPassword(file: File) {
    let password: string | undefined;
    while (true) {
      try { return await importDocument(file, password); }
      catch (e) {
        if (!(e instanceof Error) || !/^PASSWORD_(REQUIRED|INCORRECT)$/.test(e.message)) throw e;
        const answer = await new Promise<string | null>(resolve => setPasswordPrompt({ name: file.name, incorrect: e.message === 'PASSWORD_INCORRECT', resolve }));
        setPasswordPrompt(null);
        if (answer === null) throw new Error('Import cancelled.');
        password = answer;
      }
    }
  }
  async function importFiles(files: File[], append: boolean) {
    if (!files.length) return;
    if (files.length === 1 && /\.(bide|folio)$/i.test(files[0].name)) return loadProject(files[0]);
    setBusy(append ? 'Adding documents…' : 'Opening document…');
    try {
      const pages: Page[] = [], sources = { ...(append ? projectRef.current.sources : {}) };
      const notices: string[] = [];
      for (const file of files) {
        if (/\.psd$/i.test(file.name)) {
          setBusy('Reading Photoshop layers…');
          const { importPsd } = await import('./browser/psd');
          const result = await importPsd(file); pages.push(result.page); notices.push(result.notice); continue;
        }
        if (/\.(png|jpe?g|webp)$/i.test(file.name)) {
          const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result as string); reader.onerror = reject; reader.readAsDataURL(file); });
          const image = await FabricImage.fromURL(data);
          const ratio = Math.min(1, 5000 / Math.max(image.width, image.height));
          image.scale(ratio);
          Object.assign(image, { id: uid(), name: file.name });
          const p = blankPage(image.width * ratio, image.height * ratio);
          p.name = file.name.replace(/\.[^.]+$/, '');
          p.canvas = { objects: [image.toObject()] };
          pages.push(p);
          continue;
        }
        if (/\.(docx?|xlsx?|pptx?|odt|ods|odp|rtf)$/i.test(file.name)) setBusy('Loading Office engine & converting locally… First use loads the bundled Office engine.');
        const result = await importWithPassword(file);
        sources[result.id] = result.data;
        result.pages.forEach((p,i) => pages.push({ ...blankPage(p.width,p.height), name: `${file.name.replace(/\.[^.]+$/, '')} · ${i+1}`, source: result.id, index: p.index }));
      }
      const current = capture();
      commit({ version: 1, name: append ? current.name : files[0].name.replace(/\.[^.]+$/, ''), pages: append ? [...current.pages,...pages] : pages, sources }, true);
      if (notices.length) setImportNotice(notices.join('\n\n'));
      setPageId(pages[0].id); setPdfHome(false); setModal(null); notify(`${pages.length} ${pages.length === 1 ? 'page' : 'pages'} added. Original PDF content is preserved.`);
    } catch(e) { fail(e); } finally { setBusy(''); }
  }
  function openFiles(append = false) { importMode.current = append ? 'append' : 'open'; fileInput.current?.click(); }
  async function payload() {
    const current = capture();
    const pages = [];
    for (const p of current.pages) {
      const c = new StaticCanvas(undefined, { width: p.width, height: p.height, backgroundColor: p.source ? '' : p.color });
      try {
        await c.loadFromJSON(p.canvas); c.backgroundColor = p.source ? '' : p.color;
        let svg = c.toSVG({ width: String(p.width), height: String(p.height), viewBox: { x:0,y:0,width:p.width,height:p.height } });
        if (hasBlending(c.getObjects())) {
          const png = c.toDataURL({ format: 'png', multiplier: Math.min(2, 4096 / Math.max(p.width, p.height)) });
          svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${p.width}" height="${p.height}"><image href="${png}" width="${p.width}" height="${p.height}"/></svg>`;
        }
        pages.push({ width: p.width, height: p.height, source: p.source, index: p.index, svg });
      }
      finally { await c.dispose(); }
    }
    return { pages, title: current.name };
  }
  async function runExport(options?: { targetId?: string; format?: string; rotation?: number; range?: string; reimport?: boolean; crop?: CropMargins }) {
    const targetId = options?.targetId || pageId;
    setBusy(options?.reimport ? 'Updating page…' : 'Preparing your export…');
    try {
      if (format === 'psd' && !options?.reimport) {
        const { exportPsd } = await import('./browser/psd');
        const current = capture().pages.find(p => p.id === pageId)!;
        download(await exportPsd(current), `${safeName(current.name)}.psd`);
        setModal(null); notify('PSD exported with raster layers. Save a .bide project to retain editable text and shapes.'); return;
      }
      if (protect && format === 'pdf' && !options?.reimport && (!exportPassword || exportPassword !== passwordConfirmation)) throw new Error('Enter and confirm the same non-empty PDF password.');
      const body = { ...await payload(), format, compression, range, dpi, ...options, ...(options?.reimport ? { compression: 'lossless' } : {}), password: !options?.reimport && format === 'pdf' && protect ? exportPassword : undefined };
      const blob = await exportInBrowser(body);
      if (options?.reimport) {
        const result = await importDocument(new File([blob], 'rotated.pdf'));
        const updated = { ...projectRef.current, sources: { ...projectRef.current.sources, [result.id]:result.data }, pages: projectRef.current.pages.map(p => p.id === targetId ? { ...p, width: result.pages[0].width, height: result.pages[0].height, source:result.id, index:0, canvas:{ objects:[] }, thumb:undefined } : p) };
        commit(updated,true); setModal(null); notify(options?.crop ? 'Page cropped. Undo restores the original boundary and layers.' : 'Page rotated. Its current artwork is now part of the PDF background. Undo restores editable layers.');
      } else {
        const ext = ['png','jpg','svg','split'].includes(body.format) ? 'zip' : body.format;
        download(blob,`${safeName(projectRef.current.name)}${body.format === 'split' ? '-pages' : ''}.${ext}`);
        setModal(null); setExportPassword(''); setPasswordConfirmation(''); notify(`Export ready · ${(blob.size/1024).toFixed(0)} KB`);
      }
    } catch(e) { fail(e); } finally { setBusy(''); }
  }
  function exportDialog(nextFormat = 'pdf', nextCompression = 'lossless') { setFormat(nextFormat); setCompression(nextCompression); setRange(''); setProtect(false); setExportPassword(''); setPasswordConfirmation(''); setModal('export'); setMenu(null); }
  function addPage() { const p = blankPage(page.width,page.height); p.name = `Page ${project.pages.length+1}`; commit({ ...capture(), pages:[...capture().pages,p] }); setPageId(p.id); }
  function deletePage(target: string = pageId) {
    const current = capture(); if (current.pages.length === 1) return;
    const index = current.pages.findIndex(p => p.id === target); if (index < 0) return;
    const pages = current.pages.filter(p => p.id !== target);
    commit({...current, pages});
    if (target === pageId) setPageId(pages[Math.min(index,pages.length-1)].id);
  }
  function duplicatePage(target: string = pageId) {
    const current = capture(), index = current.pages.findIndex(p => p.id === target); if (index < 0) return;
    const p = {...structuredClone(current.pages[index]), id:uid(), name:`${current.pages[index].name} copy`};
    const pages = [...current.pages]; pages.splice(index+1,0,p); commit({...current,pages}); setPageId(p.id);
  }
  function pageAction(action: string, target: string) {
    setPageMenu(null); if (loading.current || busy) return;
    const index = projectRef.current.pages.findIndex(p => p.id === target); if(index < 0) return;
    if (action === 'delete') deletePage(target);
    else if (action === 'duplicate') duplicatePage(target);
    else if (action === 'left' || action === 'right') void runExport({targetId:target,format:'pdf',rotation:action==='right'?90:270,range:String(index+1),reimport:true});
    else { const current=capture(), pages=[...current.pages]; const [p]=pages.splice(index,1); pages.splice(action==='first'?0:pages.length,0,p); commit({...current,pages}); }
  }
  function reorderPage(from: string, to: string) { const pages = [...capture().pages]; const index = pages.findIndex(p => p.id === from); const [moving] = pages.splice(index,1); pages.splice(pages.findIndex(p => p.id === to),0,moving); commit({ ...capture(), pages }); }
  function moveLayer(direction: 'up' | 'down') { const c = canvas.current, o = c?.getActiveObject(); if (!c || !o) return; direction === 'up' ? c.bringObjectForward(o) : c.sendObjectBackwards(o); saveCanvas(); }
  function toggleLock(o: Obj) { const locked = !o.lockMovementX; o.set({ lockMovementX:locked, lockMovementY:locked, lockScalingX:locked, lockScalingY:locked, lockRotation:locked, hasControls:!locked, editable:!locked }); canvas.current?.requestRenderAll(); saveCanvas(); }
  function groupLayers() { const c=canvas.current; if (!c) return; const objects=c.getActiveObjects(); if(objects.length<2) return; c.discardActiveObject(); c.remove(...objects); addObject(new Group(objects), 'Group'); }
  function ungroupLayers() { const c=canvas.current, o=c?.getActiveObject(); if(!c || !(o instanceof Group) || o instanceof ActiveSelection) return; c.discardActiveObject(); const children=o.removeAll(); c.remove(o); children.forEach(child=>c.add(child)); c.requestRenderAll(); saveCanvas(); }
  function setImageFilter(kind: string, value?: number) { const o=canvas.current?.getActiveObject(); if (!(o instanceof FabricImage) || o.lockMovementX) return; if(kind==='reset') o.filters=[]; else { const constructors: Record<string, any> = { grayscale: filters.Grayscale, sepia:filters.Sepia, invert:filters.Invert, brightness:filters.Brightness, contrast:filters.Contrast, saturation:filters.Saturation, blur:filters.Blur }; const Filter=constructors[kind]; o.filters=o.filters.filter(f=>f.type.toLowerCase()!==kind); if(Filter && value!==0) o.filters.push(new Filter(value===undefined ? {} : { [kind]:value })); } o.applyFilters(); canvas.current?.requestRenderAll(); saveCanvas(); }
  function align(where: string) { const o = canvas.current?.getActiveObject(); if(!o) return; if(where==='center') updateObject({ left:(page.width-o.getScaledWidth())/2 }); if(where==='left') updateObject({ left:0 }); if(where==='right') updateObject({ left:page.width-o.getScaledWidth() }); }

  function applyStamp(options: StampOptions) {
    try {
      const current = capture(), indexes = [...new Set(selectPages(options.range, current.pages.length))];
      const pages = current.pages.map((p, index) => {
        const sequence = indexes.indexOf(index); if (sequence < 0) return p;
        const watermark = options.kind === 'watermark';
        const text = watermark ? options.text : options.text.replaceAll('{n}', String(options.start + sequence)).replaceAll('{total}', String(indexes.length)).replaceAll('{page}', String(index + 1));
        const stamp = new Textbox(text, { left: p.width / 2, top: watermark ? p.height / 2 : options.position === 'top' ? 28 : p.height - 28, originX: 'center', originY: 'center', width: Math.max(20, p.width - 60), fontFamily: 'Arial', fontSize: options.size, fill: options.color, opacity: options.opacity / 100, angle: watermark ? options.angle : 0, textAlign: 'center' });
        Object.assign(stamp, { id: uid(), name: watermark ? 'Watermark' : 'Page number' });
        return { ...p, thumb: undefined, canvas: { ...p.canvas, objects: [...((p.canvas.objects || []) as object[]), stamp.toObject()] } };
      });
      commit({ ...current, pages }, true); setModal(null); notify(`Added ${options.kind === 'watermark' ? 'watermarks' : 'page numbers'} to ${indexes.length} pages.`);
    } catch (e) { fail(e); }
  }
  function setClip(kind: string) {
    const o = canvas.current?.getActiveObject(); if (!o || o.lockMovementX) return;
    const common = { originX: 'center' as const, originY: 'center' as const, left: 0, top: 0 };
    updateObject({ clipPath: kind === 'ellipse' ? new Ellipse({ ...common, rx: o.width / 2, ry: o.height / 2 }) : kind === 'rounded' ? new Rect({ ...common, width: o.width, height: o.height, rx: Math.min(o.width, o.height) * .16, ry: Math.min(o.width, o.height) * .16 }) : undefined });
  }
  const actions = [
    { label:'Open photo editor', hint:'', icon:FileImage, run:()=>selectWorkspace('photo') },
    { label:'Open PDF MasterTool', hint:'', icon:FileText, run:()=>selectWorkspace('pdf') },
    { label:'Open diagram workspace', hint:'', icon:Layers, run:openDiagrams },
    { label:'Zoom in', hint:'Ctrl +', icon:ZoomIn, run:()=>changeZoom(zoomRef.current*1.2) },
    { label:'Zoom out', hint:'Ctrl −', icon:Minus, run:()=>changeZoom(zoomRef.current/1.2) },
    { label:'Actual size (100%)', hint:'Ctrl 1', icon:Maximize, run:()=>changeZoom(1) },
    { label:'Freehand highlight', hint:'H', icon:Highlighter, run:()=>setTool('highlight') },
    { label:'New document', hint:'Ctrl N', icon:FilePlus2, run:()=>setModal('new') }, { label:'Open PDF, image or Office file', hint:'Ctrl O', icon:FolderOpen, run:()=>openFiles() },
    { label:'Open editable project', hint:'.bide', icon:FolderOpen, run:()=>projectInput.current?.click() }, { label:'Save editable project', hint:'Ctrl S', icon:Save, run:saveProject },
    { label:'Export PDF', hint:'Ctrl E', icon:Download, run:()=>exportDialog() }, { label:'Add text box', hint:'T', icon:Type, run:addText },
    { label:'Place image', hint:'', icon:ImagePlus, run:()=>imageInput.current?.click() }, { label:'Add signature', hint:'', icon:PenLine, run:()=>setModal('signature') },
    { label:'Merge documents', hint:'', icon:Merge, run:()=>openFiles(true) }, { label:'Split PDF into pages', hint:'', icon:Scissors, run:()=>exportDialog('split') },
    { label:'Compress PDF', hint:'', icon:Scaling, run:()=>exportDialog('pdf','balanced') }, { label:'Convert Office or images to PDF', hint:'', icon:FileText, run:()=>openFiles() },
    { label:'Export pages as PNG', hint:'', icon:FileImage, run:()=>exportDialog('png') }, { label:'Export pages as JPEG', hint:'', icon:FileImage, run:()=>exportDialog('jpg') },
    { label:'Extract text to Word', hint:'', icon:FileText, run:()=>exportDialog('docx') }, { label:'Extract plain text', hint:'', icon:FileText, run:()=>exportDialog('txt') },
    { label:'Add blank page', hint:'', icon:Plus, run:addPage }, { label:'Duplicate current page', hint:'', icon:Copy, run:()=>duplicatePage() },
    { label:'Rotate current page clockwise', hint:'', icon:RotateCw, run:()=>runExport({ format:'pdf', rotation:90, range:String(project.pages.findIndex(p=>p.id===pageId)+1), reimport:true }) },
    { label:'Undo', hint:'Ctrl Z', icon:Undo2, run:()=>undo() }, { label:'Redo', hint:'Ctrl Shift Z', icon:Redo2, run:()=>undo(true) },
    { label:'Duplicate selection', hint:'Ctrl D', icon:Copy, run:duplicate }, { label:'Group selection', hint:'Ctrl G', icon:Layers, run:groupLayers },
    { label:'Ungroup selection', hint:'Ctrl Shift G', icon:Layers, run:ungroupLayers }, { label:'Fit page to window', hint:'Ctrl 0', icon:Maximize, run:fit },
    { label:'Add watermarks', hint:'', icon:Type, run:()=>setModal('watermark') },
    { label:'Add page numbers', hint:'', icon:FileText, run:()=>setModal('numbers') },
    { label:'Crop current page', hint:'', icon:Scissors, run:()=>setModal('crop') },
    { label:'Protect PDF with password', hint:'', icon:LockKeyhole, run:()=>{exportDialog();setProtect(true);} },
    { label:'Unlock password PDF', hint:'', icon:UnlockKeyhole, run:()=>openFiles() },
    { label:'Export current design as PSD', hint:'', icon:Layers, run:()=>exportDialog('psd') },
    { label:'Draw with brush', hint:'B', icon:PenLine, run:()=>setTool('brush') },
    { label:'Erase artwork', hint:'E', icon:Eraser, run:()=>setTool('eraser') },
    { label:'Keyboard shortcuts', hint:'?', icon:Command, run:()=>setModal('shortcuts') },
  ];
  const diagramActions = [
    {label:'Open photo editor',hint:'',icon:FileImage,run:()=>selectWorkspace('photo')},
    {label:'Open PDF MasterTool',hint:'',icon:FileText,run:()=>selectWorkspace('pdf')},
    {label:'New diagram',hint:'',icon:FilePlus2,run:()=>diagramCommands.current?.newDiagram()},
    {label:'Open .drawio file',hint:'',icon:FolderOpen,run:()=>diagramCommands.current?.open()},
    {label:'Save editable diagram',hint:'',icon:Save,run:()=>diagramCommands.current?.save()},
    {label:'Export diagram as PNG',hint:'',icon:FileImage,run:()=>diagramCommands.current?.export('png')},
    {label:'Export diagram as SVG',hint:'',icon:FileImage,run:()=>diagramCommands.current?.export('svg')},
    {label:'Export diagram as PDF',hint:'',icon:Download,run:()=>diagramCommands.current?.export('pdf')},
    {label:'Place diagram in document',hint:'',icon:ImagePlus,run:()=>diagramCommands.current?.export('place')},
  ];
  const filteredActions = (view==='diagrams'?diagramActions:actions).filter(a=>a.label.toLowerCase().includes(query.toLowerCase()));
  const actionRef = useRef(actions); actionRef.current=actions;

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const input = e.target instanceof HTMLElement && (['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName) || e.target.isContentEditable);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase()==='k') { e.preventDefault(); setPalette(v=>!v); setQuery(''); setCommandIndex(0); return; }
      if ((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='o') {
        e.preventDefault(); if(modal||palette||busy||loading.current)return;
        if(view==='diagrams')diagramCommands.current?.open();else actionRef.current.find(a=>a.label==='Open PDF, image or Office file')?.run();
        return;
      }
      if (view==='diagrams'||(view==='pdf'&&pdfHome)) return;
      if (modal || palette || busy || loading.current) return;
      if (input || (canvas.current?.getActiveObject() as Obj)?.isEditing) return;
      const k=e.key.toLowerCase();
      if(e.ctrlKey || e.metaKey) {
        const shortcuts: Record<string,string> = { n:'New document', o:'Open PDF, image or Office file', s:'Save editable project', e:'Export PDF', z:e.shiftKey?'Redo':'Undo', y:'Redo', d:'Duplicate selection', g:e.shiftKey?'Ungroup selection':'Group selection', '0':'Fit page to window', '1':'Actual size (100%)', '=':'Zoom in', '+':'Zoom in', '-':'Zoom out', '_':'Zoom out' };
        if(shortcuts[k]) { e.preventDefault(); actionRef.current.find(a=>a.label===shortcuts[k])?.run(); }
        if(k==='a') { e.preventDefault(); const c=canvas.current!; c.setActiveObject(new ActiveSelection(c.getObjects().filter(o=>!o.lockMovementX && o.visible),{canvas:c})); c.requestRenderAll(); syncSelection(); }
        if(k==='c') { e.preventDefault(); const o=canvas.current?.getActiveObject(); if(o) void o.clone().then(clone=>clipboard.current=clone as Obj); }
        if(k==='v' && clipboard.current) { e.preventDefault(); void clipboard.current.clone().then(clone=>{ clone.set({left:clone.left+20,top:clone.top+20}); addObject(clone as Obj,'Pasted layer'); }); }
        return;
      }
      if(e.key==='Delete' || e.key==='Backspace') { e.preventDefault(); removeSelected(); }
      if(e.key==='Escape') { canvas.current?.discardActiveObject(); canvas.current?.requestRenderAll(); setTool('select'); setMenu(null); }
      if((k==='['||k===']')&&['brush','eraser','highlight'].includes(toolRef.current)){e.preventDefault();const delta=k===']'?2:-2;if(toolRef.current==='eraser')setEraserSize(v=>brushWidth(v+delta));else if(toolRef.current==='highlight')setHighlightSize(v=>Math.min(120,brushWidth(v+delta)));else setBrushSize(v=>brushWidth(v+delta));}
      const chosen=TOOLS.find(t=>t.key.toLowerCase()===k); if(chosen) setTool(chosen.id);
      if(e.code==='Space') { e.preventDefault(); setTool('hand'); }
      if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) { const o=canvas.current?.getActiveObject(); if(o && !o.lockMovementX) { e.preventDefault(); const d=e.shiftKey?10:1; updateObject({ left:o.left+(e.key==='ArrowRight'?d:e.key==='ArrowLeft'?-d:0), top:o.top+(e.key==='ArrowDown'?d:e.key==='ArrowUp'?-d:0) }); } }
      if(e.key==='?') setModal('shortcuts');
    };
    const up=(e:KeyboardEvent)=>{ if(e.code==='Space' && toolRef.current==='hand') setTool('select'); };
    window.addEventListener('keydown',key); window.addEventListener('keyup',up);
    return ()=>{ window.removeEventListener('keydown',key); window.removeEventListener('keyup',up); };
  }, [modal,palette,busy,page,selected,view,pdfHome]);

  const selectedText = selected instanceof Textbox;
  const selectedImage = selected instanceof FabricImage;
  const pdfTools: PdfTool[] = [{category:'Organize',title:'Merge documents',desc:'Combine PDFs and images into one.',icon:Merge,run:()=>openFiles(true)},{category:'Organize',title:'Split & extract',desc:'Save individual pages or a page range.',icon:Scissors,run:()=>exportDialog('split')},{category:'Organize',title:'Compress PDF',desc:'Balance file size and image quality.',icon:Scaling,run:()=>exportDialog('pdf','balanced')},{category:'Convert',title:'Convert to PDF',desc:PUBLIC_DEMO?'Images & text. Office: local edition.':'Word, Excel, PowerPoint, images & text.',icon:FileText,run:()=>openFiles()},{category:'Convert',title:'PDF to images',desc:'Export sharp PNG, JPEG or SVG pages.',icon:FileImage,run:()=>exportDialog('png')},{category:'Convert',title:'PDF to Word',desc:'Extract editable text into a DOCX file.',icon:FileText,run:()=>exportDialog('docx')},{category:'Edit',title:'Sign a document',desc:'Draw or type your signature.',icon:PenLine,run:()=>setModal('signature')},{category:'Edit',title:'Add & edit text',desc:'Place, style and resize a text box.',icon:Type,run:()=>{setModal(null);addText();}},{category:'Edit',title:'Watermarks',desc:'Stamp editable text across a page range.',icon:Type,run:()=>setModal('watermark')},{category:'Edit',title:'Page numbers',desc:'Headers, footers and custom numbering.',icon:FileText,run:()=>setModal('numbers')},{category:'Edit',title:'Crop page',desc:'Trim the visible boundary of a page.',icon:Scissors,run:()=>setModal('crop')},{category:'Security',title:'Protect PDF',desc:'Require a password to open the export.',icon:LockKeyhole,run:()=>{exportDialog();setProtect(true);}},{category:'Security',title:'Unlock PDF',desc:'Open an encrypted PDF with its password.',icon:UnlockKeyhole,run:()=>openFiles()},{category:'Organize',title:'Organize pages',desc:'Add pages. Drag thumbnails to reorder.',icon:Layers,run:()=>{setModal(null);setLeftOpen(true);notify('Drag page thumbnails to reorder. Use the bottom bar to duplicate or delete pages.');}}];
  const currentWorkspace=workspaces.find(item=>item.id===view)!;
  const menus: Record<string, string[]> = { File:['New document','Open PDF, image or Office file','Open editable project','Save editable project','Export PDF','Export current design as PSD'], Edit:['Undo','Redo','Duplicate selection','Group selection','Ungroup selection'], Insert:['Add text box','Place image','Add signature','Add blank page'], Page:['Duplicate current page','Rotate current page clockwise','Fit page to window','Crop current page'], PDF:['Merge documents','Split PDF into pages','Compress PDF','Convert Office or images to PDF','Extract text to Word','Extract plain text','Add watermarks','Add page numbers','Protect PDF with password','Unlock password PDF'], Help:['Keyboard shortcuts'] };
  return <div className={`app workspace-${view}`} onDragOver={e=>{ if(view!=='diagrams'&&e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDraggingFile(true); } }} onDrop={e=>{ if(view!=='diagrams'&&e.dataTransfer.files.length) { e.preventDefault(); setDraggingFile(false); setPdfHome(false);void importFiles([...e.dataTransfer.files],true); } }}>
    <input ref={fileInput} type="file" multiple accept=".psd,.pdf,.png,.jpg,.jpeg,.webp,.bmp,.tif,.tiff,.doc,.docx,.odt,.rtf,.xls,.xlsx,.ods,.ppt,.pptx,.odp,.txt,.md,.svg,.bide,.folio" hidden onChange={e=>{ void importFiles([...e.target.files||[]],importMode.current==='append'); e.target.value=''; }}/>
    <input ref={imageInput} type="file" multiple accept="image/png,image/jpeg,image/webp" hidden onChange={e=>{ for(const file of [...e.target.files||[]]) void addImage(file); e.target.value=''; }}/>
    <input ref={projectInput} type="file" accept=".bide,.folio" hidden onChange={e=>{ if(e.target.files?.[0]) void loadProject(e.target.files[0]); e.target.value=''; }}/>
    <header className="topbar"><div className="brand"><img src="./favicon.svg" alt=""/><span>bide</span><span className="beta">{PUBLIC_DEMO?'DEMO':'LOCAL'}</span></div><div className="current-workspace"><currentWorkspace.icon size={15}/><span>{currentWorkspace.label}</span></div><nav className="menubar" aria-label="Application menu" style={{display:view!=='diagrams'?undefined:'none'}}>{Object.keys(menus).map(label=><div className="menu-wrapper" key={label}><button className={menu===label?'open':''} onClick={()=>setMenu(menu===label?null:label)}>{label}</button>{menu===label && <div className="dropdown">{menus[label].map(name=>{const a=actions.find(a=>a.label===name)!;return <button key={name} onClick={()=>{setMenu(null);setPdfHome(false);a.run();}}><a.icon size={14}/><span>{name}</span><kbd>{a.hint}</kbd></button>;})}</div>}</div>)}</nav><div className="topbar-right"><button className="command-button" onClick={()=>{setPalette(true);setQuery('');setCommandIndex(0);}}><Search size={14}/><span>Find a tool…</span><kbd>Ctrl K</kbd></button><span className="local-status"><span/>On your device</span></div></header>
    {menu && <div className="menu-dismiss" onClick={()=>setMenu(null)}/>}
    {PUBLIC_DEMO&&<div className="demo-notice"><span>Public demo · Files stay in your browser. Office conversion is in the local edition.</span><a href={DOWNLOAD_URL}>Download bide</a><a href="https://github.com/AOSPAndroid/Bide" target="_blank" rel="noreferrer">Source</a></div>}
    {!PUBLIC_DEMO && health.ok && !health.office && <div className="hosting-notice" role="status">{!globalThis.isSecureContext ? 'HTTP sharing: editing is available. Use trusted HTTPS for Office conversion and reliable downloads; browsers may block HTTP downloads.' : 'Office conversion is unavailable. Ask the host to enable the hosting settings in HOSTING.md.'}</div>}
    <div className="editor-shell" style={{display:view!=='diagrams'&&!(view==='pdf'&&pdfHome)?'flex':'none'}}>
    <div className="document-bar"><div className="document-name"><FileText size={16}/><input aria-label="Document name" value={project.name} onChange={e=>commit({...project,name:e.target.value})}/><span className="save-state">{saved?<><Check size={12}/>Saved locally</>:<><span className="unsaved-dot"/>Editing</>}</span></div><div className="document-actions"><IconButton icon={Undo2} label="Undo (Ctrl Z)" onClick={()=>undo()} disabled={!history.current.past.length}/><IconButton icon={Redo2} label="Redo (Ctrl Shift Z)" onClick={()=>undo(true)} disabled={!history.current.future.length}/><span className="divider"/><button className="secondary toolkit-btn" onClick={()=>view==='pdf'?selectWorkspace('pdf'):imageInput.current?.click()}>{view==='pdf'?<><SlidersHorizontal size={15}/>All PDF tools</>:<><ImagePlus size={15}/>Place image</>}</button><button className="primary" onClick={()=>exportDialog()}><Download size={15}/>Export<ChevronDown size={13}/></button></div></div>
    <div className="options-bar"><div className="tool-caption">{TOOLS.find(t=>t.id===tool)?.label || 'Select'}<ChevronDown size={12}/></div><span className="divider"/>{selectedText ? <><select aria-label="Font family" value={selected.fontFamily} onChange={e=>updateObject({fontFamily:e.target.value})}>{['Arial','Georgia','Times New Roman','Courier New','Verdana','Trebuchet MS','cursive'].map(x=><option key={x}>{x}</option>)}</select><input className="font-size" aria-label="Font size" type="number" min={4} max={500} value={selected.fontSize} onChange={e=>updateObject({fontSize:Math.max(4,Number(e.target.value))})}/><IconButton icon={Bold} label="Bold" active={selected.fontWeight==='bold'} onClick={()=>updateObject({fontWeight:selected.fontWeight==='bold'?'normal':'bold'})}/><IconButton icon={Italic} label="Italic" active={selected.fontStyle==='italic'} onClick={()=>updateObject({fontStyle:selected.fontStyle==='italic'?'normal':'italic'})}/><IconButton icon={Underline} label="Underline" active={selected.underline} onClick={()=>updateObject({underline:!selected.underline})}/></> : <><label className="check-label"><input type="checkbox" checked={snap} onChange={e=>setSnap(e.target.checked)}/>Snap to page</label><span className="options-hint">{tool==='select'?'Shift-click to select multiple layers':tool==='text'?'Click or drag on the page to add text':tool==='hand'?'Drag to pan the workspace':'Click and drag on the page'}</span></>}<div className="options-end">{selected?.diagramXml&&<button className="secondary" onClick={editDiagram}>Edit diagram</button>}{tool==='eraser'?<><span className="muted">Erase overlays</span><label className="marker-setting">Size<input aria-label="Eraser size" className="font-size" type="number" min={1} max={200} value={eraserSize} onChange={e=>setEraserSize(brushWidth(Number(e.target.value)))}/></label></>:tool==='highlight'?<><label className="marker-setting">Color<input type="color" aria-label="Highlight color" value={highlightColor} onChange={e=>setHighlightColor(e.target.value)}/></label><label className="marker-setting">Width<input className="font-size" aria-label="Highlight width" type="number" min={1} max={120} value={highlightSize} onChange={e=>setHighlightSize(Math.min(120,Math.max(1,Number(e.target.value))))}/></label><label className="marker-setting">Opacity<input className="font-size" aria-label="Highlight opacity" type="number" min={5} max={90} value={highlightOpacity} onChange={e=>setHighlightOpacity(Math.min(90,Math.max(5,Number(e.target.value))))}/> %</label></>:<><span className="muted">Fill</span><input type="color" aria-label="Fill color" value={selected && typeof selected.fill==='string' && /^#[0-9a-f]{6}$/i.test(selected.fill)?selected.fill:color} onChange={e=>{setColor(e.target.value);if(selected)updateObject({fill:e.target.value});}}/>{tool==='brush' && <><select aria-label="Brush style" value={brushKind} onChange={e=>setBrushKind(e.target.value as BrushKind)}>{Object.entries(brushNames).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select><label className="marker-setting">Size<input aria-label="Brush size" className="font-size" type="number" min={1} max={200} value={brushSize} onChange={e=>setBrushSize(brushWidth(Number(e.target.value)))}/></label><label className="marker-setting">Opacity<input aria-label="Brush opacity" className="font-size" type="number" min={5} max={100} value={brushOpacity} onChange={e=>setBrushOpacity(Math.min(100,Math.max(5,Number(e.target.value))))}/>%</label></>}</>}<span className="divider"/><div className="header-zoom"><IconButton icon={Minus} label="Decrease zoom" onClick={()=>changeZoom(zoomRef.current/1.2)}/><input key={zoom} aria-label="Zoom percentage" type="number" min={10} max={800} defaultValue={Math.round(zoom*100)} onBlur={e=>changeZoom(Number(e.target.value)/100)} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}}/><span>%</span><IconButton icon={Plus} label="Increase zoom" onClick={()=>changeZoom(zoomRef.current*1.2)}/></div><IconButton icon={Maximize} label="Fit page (Ctrl 0)" onClick={fit}/></div></div>
    <main className="workspace-layout"><aside className="tool-rail" aria-label="Drawing tools">{TOOLS.slice(0,5).map(t=><button key={t.id} title={`${t.label} (${t.key})`} aria-label={t.label} className={tool===t.id?'active':''} onClick={()=>setTool(t.id)}><t.icon size={19}/></button>)}<span className="rail-divider"/>{TOOLS.slice(5,8).map(t=><button key={t.id} title={`${t.label} (${t.key})`} aria-label={t.label} className={tool===t.id?'active':''} onClick={()=>setTool(t.id)}><t.icon size={19}/></button>)}<button title="Place image" aria-label="Place image" onClick={()=>imageInput.current?.click()}><ImagePlus size={19}/></button><button title="Add signature" aria-label="Add signature" onClick={()=>setModal('signature')}><span className="signature-icon">S</span></button><span className="rail-divider"/><button title="Pan (hold Space)" aria-label="Pan" className={tool==='hand'?'active':''} onClick={()=>setTool('hand')}><Hand size={19}/></button><button title="Zoom in (Ctrl +)" aria-label="Zoom in tool" onClick={()=>changeZoom(zoomRef.current*1.2)}><ZoomIn size={19}/></button><div className="rail-bottom"><input aria-label="Drawing color" type="color" value={color} onChange={e=>setColor(e.target.value)}/><button title="Keyboard shortcuts" aria-label="Keyboard shortcuts" onClick={()=>setModal('shortcuts')}><Command size={17}/></button></div></aside>
    {leftOpen && <aside className="pages-panel"><div className="panel-heading"><span>Pages <b>{project.pages.length}</b></span><IconButton icon={PanelLeftClose} label="Hide pages" onClick={()=>setLeftOpen(false)}/></div><div className="page-list">{project.pages.map((p,i)=><div className="page-card-wrap" key={p.id}><button onContextMenu={e=>{e.preventDefault();if(!loading.current&&!busy)setPageMenu({id:p.id,x:e.clientX,y:e.clientY});}} className={`page-card ${p.id===pageId?'active':''}`} key={p.id} onClick={()=>{if(!loading.current)setPageId(p.id);}} draggable onDragStart={()=>setPageDrag(p.id)} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();if(pageDrag && pageDrag!==p.id)reorderPage(pageDrag,p.id);setPageDrag(null);}}><div className="page-preview" style={{aspectRatio:`${p.width}/${p.height}`,background:p.color}}>{p.source && <PDFPreview source={p.source} index={p.index} scale={0.25}/>}{p.thumb && <img src={p.thumb} alt=""/>}{!p.source&&!p.thumb&&<span className="page-placeholder">{i===0?'Aa':''}</span>}</div><div className="page-caption"><span>{String(i+1).padStart(2,'0')}</span><span>{p.name}</span><GripVertical size={12}/></div></button><button className="page-more" aria-label={`Page ${i+1} actions`} onClick={e=>{const r=e.currentTarget.getBoundingClientRect();if(!loading.current&&!busy)setPageMenu({id:p.id,x:r.right,y:r.bottom});}}><MoreHorizontal size={16}/></button></div>)}</div><div className="page-panel-bottom"><button onClick={addPage}><Plus size={14}/>Add page</button><button onClick={()=>openFiles(true)}><Merge size={14}/>Import & merge</button></div></aside>}
    <section className="canvas-area"><div className="canvas-tab"><FileText size={13}/><span>{project.name || 'Untitled'}</span><span className="tab-badge">{page.source?'PDF':'DESIGN'}</span><span className="tab-page">{project.pages.findIndex(p=>p.id===pageId)+1} / {project.pages.length}</span>{!leftOpen&&<button onClick={()=>setLeftOpen(true)}><Layers size={13}/>Show pages</button>}</div><div className="ruler"><span>0</span>{Array.from({length:12},(_,i)=><span key={i}>{(i+1)*100}</span>)}</div><div ref={workspace} className={`canvas-workspace ${tool==='hand'?'panning':''}`} ><div className="artboard-wrap"><div className="artboard-label"><span>{page.name}</span><span>{Math.round(page.width)} × {Math.round(page.height)}</span></div><div ref={artboard} className="artboard" style={{width:page.width*zoom,height:page.height*zoom,backgroundColor:page.color}}>{page.source&&<PDFPreview className="pdf-background" source={page.source} index={page.index} scale={1.8} alt="Original PDF page"/>}<div className="canvas-host"><canvas ref={canvasEl}/></div></div><div className="artboard-below"><span>Double-click text to edit</span><span>Space to pan · Ctrl K for commands</span></div></div></div><div className="canvas-footer"><div><span className="engine-dot"/><span>{tool==='select'?'Select an object to start editing':TOOLS.find(t=>t.id===tool)?.label}</span></div><div className="zoom-controls"><IconButton icon={Minus} label="Zoom out" onClick={()=>changeZoom(zoomRef.current/1.2)}/><button onClick={()=>changeZoom(1)} title="Reset to 100%">{Math.round(zoom*100)}%</button><IconButton icon={Plus} label="Zoom in" onClick={()=>changeZoom(zoomRef.current*1.2)}/><span className="divider"/><IconButton icon={Maximize} label="Fit to screen" onClick={fit}/></div></div></section>
    <aside className="inspector"><div className="panel-heading"><span><Settings2 size={14}/>Properties</span><MoreHorizontal size={16}/></div><div className="properties-content">{selected ? <><div className="selected-heading"><span className="object-icon">{selectedText?<Type size={17}/>:selectedImage?<FileImage size={17}/>:<Square size={17}/>}</span><div><input aria-label="Layer name" value={selected.name||selected.type} onChange={e=>updateObject({name:e.target.value})}/><span>{selectedText?'Editable text':selectedImage?'Image layer':selected.type==='activeselection'?'Multiple layers':'Canvas object'}</span></div></div><div className="property-section"><div className="section-label">TRANSFORM<LockKeyhole size={11}/></div><div className="field-grid"><Field label="X" value={selected.left} onChange={v=>updateObject({left:v})}/><Field label="Y" value={selected.top} onChange={v=>updateObject({top:v})}/><Field label="W" value={selected.getScaledWidth()} min={1} onChange={v=>updateObject(selectedText?{width:v/selected.scaleX}:{scaleX:v/(selected.width||1)})}/><Field label="H" value={selected.getScaledHeight()} min={1} onChange={v=>updateObject({scaleY:v/(selected.height||1)})}/><Field label="Angle" value={selected.angle} onChange={v=>updateObject({angle:v})}/><Field label="Opacity %" value={selected.opacity*100} min={0} max={100} onChange={v=>updateObject({opacity:v/100})}/></div><div className="alignment-buttons"><button onClick={()=>align('left')} title="Align to page left">⇤</button><button onClick={()=>align('center')} title="Center on page">↔</button><button onClick={()=>align('right')} title="Align to page right">⇥</button><button onClick={()=>updateObject({flipX:!selected.flipX})}>Flip H</button><button onClick={()=>updateObject({flipY:!selected.flipY})}>Flip V</button></div></div>
    {selectedText && <div className="property-section"><div className="section-label">TEXT</div><textarea aria-label="Text content" value={selected.text||''} onChange={e=>updateObject({text:e.target.value})}/><div className="field-grid"><select aria-label="Text alignment" value={selected.textAlign} onChange={e=>updateObject({textAlign:e.target.value})}>{['left','center','right','justify'].map(x=><option key={x}>{x}</option>)}</select><Field label="Line height" value={(selected as Textbox).lineHeight} min={0.6} max={4} step={0.1} onChange={v=>updateObject({lineHeight:v})}/></div></div>}
    <div className="property-section"><div className="section-label">APPEARANCE</div><label className="stacked-label">Blend mode<select aria-label="Layer blend mode" disabled={!!page.source} value={selected.globalCompositeOperation} onChange={e=>updateObject({globalCompositeOperation:e.target.value})}>{Object.entries(blendModes).map(([name,value])=><option key={name} value={value}>{name}</option>)}</select></label><p className="fine-print">{page.source?'Blend modes are available on design pages.':'Blended pages are rasterized on PDF/image export; .bide keeps all layers.'}</p><label className="stacked-label">Shape mask<select aria-label="Shape mask" value={selected.clipPath instanceof Ellipse?'ellipse':selected.clipPath?'rounded':'none'} onChange={e=>setClip(e.target.value)}><option value="none">None</option><option value="ellipse">Ellipse</option><option value="rounded">Rounded rectangle</option></select></label><label className="color-field"><input type="color" aria-label="Object fill" value={typeof selected.fill==='string'&&/^#[a-f\d]{6}$/i.test(selected.fill)?selected.fill:'#173e33'} onChange={e=>updateObject({fill:e.target.value})}/><span>Fill color</span><button onClick={()=>updateObject({fill:'transparent'})}>None</button></label><div className="field-grid"><label className="color-field"><input type="color" aria-label="Stroke color" value={typeof selected.stroke==='string'&&/^#[a-f\d]{6}$/i.test(selected.stroke)?selected.stroke:'#173e33'} onChange={e=>updateObject({stroke:e.target.value,strokeWidth:Math.max(selected.strokeWidth,1)})}/><span>Stroke</span></label><Field label="Width" value={selected.strokeWidth} min={0} max={100} onChange={v=>updateObject({strokeWidth:v})}/></div></div>
    {selectedImage && <div className="property-section"><div className="section-label">IMAGE ADJUSTMENTS</div>{['brightness','contrast','saturation','blur'].map(kind=><label className="slider-field" key={kind}><span>{kind}</span><input aria-label={kind} type="range" min={kind==='blur'?0:-1} max={1} step={0.05} value={(selected.filters.find(f=>f.type.toLowerCase()===kind) as any)?.[kind] || 0} onChange={e=>setImageFilter(kind,Number(e.target.value))}/></label>)}<div className="filter-buttons">{['grayscale','sepia','invert','reset'].map(kind=><button key={kind} onClick={()=>setImageFilter(kind)}>{kind}</button>)}</div><details><summary>Crop image</summary><div className="field-grid"><Field label="Crop X" value={selected.cropX} min={0} max={selected.getOriginalSize().width-1} onChange={v=>updateObject({cropX:v,width:Math.min(selected.width,selected.getOriginalSize().width-v)})}/><Field label="Crop Y" value={selected.cropY} min={0} max={selected.getOriginalSize().height-1} onChange={v=>updateObject({cropY:v,height:Math.min(selected.height,selected.getOriginalSize().height-v)})}/><Field label="Crop width" value={selected.width} min={1} max={selected.getOriginalSize().width-selected.cropX} onChange={v=>updateObject({width:v})}/><Field label="Crop height" value={selected.height} min={1} max={selected.getOriginalSize().height-selected.cropY} onChange={v=>updateObject({height:v})}/></div></details></div>}
    <div className="selection-actions"><button onClick={duplicate}><Copy size={13}/>Duplicate</button><button onClick={removeSelected}><Trash2 size={13}/>Delete</button></div></> : <><div className="selected-heading"><span className="object-icon"><FileText size={17}/></span><div><strong>Document canvas</strong><span>{page.source?'PDF page with editable overlays':'A space for your next idea'}</span></div></div><div className="property-section"><div className="section-label">PAGE</div><div className="field-grid"><Field label="W" value={page.width} min={50} max={5000} onChange={v=>commit({...project,pages:project.pages.map(p=>p.id===pageId?{...p,width:v}:p)})}/><Field label="H" value={page.height} min={50} max={5000} onChange={v=>commit({...project,pages:project.pages.map(p=>p.id===pageId?{...p,height:v}:p)})}/></div><label className="color-field"><input type="color" aria-label="Page background" value={page.color} disabled={!!page.source} onChange={e=>commit({...project,pages:project.pages.map(p=>p.id===pageId?{...p,color:e.target.value}:p)})}/><span>Page background</span></label></div><div className="quick-insert"><div className="section-label">MAKE IT YOURS</div><button onClick={addText}><Type size={16}/><span>Add a text box</span><Plus size={13}/></button><button onClick={()=>imageInput.current?.click()}><ImagePlus size={16}/><span>Place an image</span><Plus size={13}/></button><button onClick={()=>setModal('signature')}><PenLine size={16}/><span>Add your signature</span><Plus size={13}/></button></div><div className="tip-card"><Sparkles size={16}/><p>Your tools, one shortcut away.<br/><button onClick={()=>{setPalette(true);setQuery('');}}>Open command palette <kbd>Ctrl K</kbd></button></p></div></>}</div>
    <div className="layers-header"><span><Layers size={14}/>Layers <b>{layers.length+(page.source?1:0)}</b></span><div><IconButton icon={ArrowUp} label="Bring layer forward" onClick={()=>moveLayer('up')} disabled={!selected}/><IconButton icon={ArrowDown} label="Send layer backward" onClick={()=>moveLayer('down')} disabled={!selected}/><IconButton icon={Plus} label="Add text layer" onClick={addText}/></div></div><div className="layers-list">{layers.map(o=><div className={`layer-row ${selected===o || (selected instanceof ActiveSelection && selected.contains(o))?'selected':''}`} key={o.id} onClick={()=>{canvas.current?.setActiveObject(o);canvas.current?.requestRenderAll();syncSelection();setTool('select');}}><button title={o.visible?'Hide layer':'Show layer'} aria-label={`${o.visible?'Hide':'Show'} ${o.name}`} onClick={e=>{e.stopPropagation();o.set({visible:!o.visible});canvas.current?.requestRenderAll();saveCanvas();}}>{o.visible?<Eye size={13}/>:<EyeOff size={13}/>}</button><span className="layer-type">{o instanceof Textbox?<Type size={13}/>:o instanceof FabricImage?<FileImage size={13}/>:<Square size={12}/>}</span><span className="layer-name">{o.name || o.type}</span><button aria-label={`${o.lockMovementX?'Unlock':'Lock'} ${o.name}`} title={o.lockMovementX?'Unlock layer':'Lock layer'} onClick={e=>{e.stopPropagation();toggleLock(o);}}>{o.lockMovementX?<LockKeyhole size={12}/>:<UnlockKeyhole size={12}/>}</button></div>)}{page.source&&<div className="layer-row background-layer"><Eye size={13}/><FileText size={13}/><span>Original PDF</span><LockKeyhole size={12}/></div>}{!layers.length&&!page.source&&<div className="layers-empty">Add text, images, or shapes.<br/>Your layers will appear here.</div>}</div><div className="layer-footer"><span>{selected?'Layer selected':'No layer selected'}</span><IconButton icon={Trash2} label="Delete selected layer" onClick={removeSelected} disabled={!selected}/></div></aside></main>
    {pageMenu&&<PageMenu position={pageMenu} count={project.pages.length} index={project.pages.findIndex(p=>p.id===pageMenu.id)} close={()=>setPageMenu(null)} run={action=>pageAction(action,pageMenu.id)}/>}
    <footer className="statusbar"><span><ShieldCheck size={12}/>In your browser · Files stay on this computer</span><div><button onClick={()=>duplicatePage()}><Copy size={12}/>Duplicate page</button><button disabled={project.pages.length===1} onClick={()=>deletePage()}><Trash2 size={12}/>Delete page</button><span className="status-engine"><span className={health.ok?'online':'offline'}/>{health.ok?'Browser engine ready':'Loading PDF engine…'}</span></div></footer>
    </div>
    {view==='pdf'&&pdfHome&&<PdfWorkspace tools={pdfTools} name={project.name} pages={project.pages.length} onEdit={()=>setPdfHome(false)} onRun={tool=>{setPdfHome(false);tool.run();}}/>}
    <WorkspaceDock active={view} onSelect={selectWorkspace}/>
    {diagramsVisited&&<Diagrams active={view==='diagrams'} commands={diagramCommands} onPlace={placeDiagram} onNew={()=>{diagramTarget.current=undefined;}} onPalette={()=>{setPalette(true);setQuery('');setCommandIndex(0);}}/>}
    {toast&&<div className="toast" role="status"><Check size={16}/>{toast}</div>}
    {error&&<ModalShell title="Something needs your attention" close={()=>setError('')}><p className="error-message">{error}</p><div className="dialog-actions"><button className="primary" onClick={()=>setError('')}>Got it</button></div></ModalShell>}
    {importNotice&&<ModalShell title="PSD import details" close={()=>setImportNotice('')}><p className="notice">{importNotice}</p><div className="dialog-actions"><button className="primary" onClick={()=>setImportNotice('')}>Continue editing</button></div></ModalShell>}
    {passwordPrompt&&<ModalShell title="Unlock PDF" close={()=>passwordPrompt.resolve(null)}><PasswordForm key={String(passwordPrompt.incorrect)} name={passwordPrompt.name} incorrect={passwordPrompt.incorrect} onSubmit={passwordPrompt.resolve}/></ModalShell>}
    {(busy||initializing)&&!passwordPrompt&&<div className="busy-overlay" role="status"><span className="spinner"/><span>{busy||'Restoring workspace…'}</span></div>}
    {draggingFile&&<div className="drop-overlay" onDragLeave={()=>setDraggingFile(false)}><FolderOpen size={40}/><h2>Drop files into your workspace</h2><p>PDFs, images, Office documents, or a .bide project</p></div>}
    {(modal==='watermark'||modal==='numbers')&&<ModalShell title={modal==='watermark'?'Add watermarks':'Add page numbers'} close={()=>setModal(null)}><StampForm kind={modal} onApply={applyStamp}/></ModalShell>}
    {modal==='crop'&&<ModalShell title="Crop page" close={()=>setModal(null)}><CropForm width={page.width} height={page.height} onApply={crop=>runExport({format:'pdf',range:String(project.pages.findIndex(p=>p.id===pageId)+1),crop,reimport:true})}/></ModalShell>}
    {modal==='signature'&&<ModalShell title="Your signature, your way" close={()=>setModal(null)}><Signature onAdd={(value,drawn,inkColor)=>{if(drawn)void addImage(value,'Signature');else addObject(new Textbox(value,{left:70,top:page.height-170,width:380,fontFamily:'cursive',fontStyle:'italic',fontSize:44,fill:inkColor}),'Signature');setModal(null);}}/></ModalShell>}
    {modal==='new'&&<ModalShell title="Start with a blank canvas" close={()=>setModal(null)}><p className="muted">Create a document, a design, or something in between. Your previous workspace remains available with Undo.</p><label className="stacked-label">Document name<input value={newName} onChange={e=>setNewName(e.target.value)}/></label><div className="preset-grid">{[{name:'A4 document',w:595,h:842,detail:'210 × 297 mm'},{name:'US Letter',w:612,h:792,detail:'8.5 × 11 in'},{name:'Square canvas',w:1080,h:1080,detail:'1080 × 1080'},{name:'Presentation',w:1280,h:720,detail:'16:9 landscape'}].map(p=><button className={newWidth===p.w&&newHeight===p.h?'active':''} key={p.name} onClick={()=>{setNewWidth(p.w);setNewHeight(p.h);}}><FileText size={22}/><strong>{p.name}</strong><span>{p.detail}</span></button>)}</div><div className="field-grid"><Field label="Width" value={newWidth} min={50} max={5000} onChange={setNewWidth}/><Field label="Height" value={newHeight} min={50} max={5000} onChange={setNewHeight}/></div><p className="fine-print">PDF dimensions use points (72 points = 1 inch).</p><div className="dialog-actions"><button className="secondary" onClick={()=>setModal(null)}>Cancel</button><button className="primary" onClick={()=>{const p=blankPage(newWidth,newHeight);p.name='Page 1';commit({version:1,name:newName||'Untitled',pages:[p],sources:{}},true);setPageId(p.id);setModal(null);}}>Create document<ArrowUpRight size={15}/></button></div></ModalShell>}
    {modal==='export'&&<ModalShell title="Ready for the next step" close={()=>setModal(null)}><p className="muted">Export your work with the settings that fit.</p><label className="stacked-label">Format<select value={format} onChange={e=>setFormat(e.target.value)}><option value="pdf">PDF document</option><option value="psd">Photoshop PSD · current design page</option><option value="png">PNG images · ZIP</option><option value="jpg">JPEG images · ZIP</option><option value="svg">SVG pages · ZIP</option><option value="split">Separate PDF pages · ZIP</option><option value="txt">Plain text · TXT</option><option value="docx">Editable text · Word DOCX</option></select></label>{format!=='psd'&&<label className="stacked-label">Pages<input placeholder={`All ${project.pages.length} pages (or 1-3, 5)`} value={range} onChange={e=>setRange(e.target.value)}/></label>}{['pdf','split'].includes(format)&&<label className="stacked-label">Compression<select value={compression} onChange={e=>setCompression(e.target.value)}><option value="lossless">Original quality · lossless optimization</option><option value="balanced">Balanced · optimize large images</option><option value="small">Smaller file · reduce image quality</option></select></label>}{['png','jpg'].includes(format)&&<label className="stacked-label">Resolution<select value={dpi} onChange={e=>setDpi(Number(e.target.value))}><option value={72}>72 DPI · screen</option><option value={144}>144 DPI · standard</option><option value={300}>300 DPI · high resolution</option></select></label>}{format==='psd'&&<p className="notice">Exports the current design page as named raster layers, with opacity, visibility and blend modes. Text, vectors, groups and masks are rasterized within each layer. Original PDF pages must first be exported as an image and reopened.</p>}{format==='pdf'&&<><label className="check-label"><input type="checkbox" checked={protect} onChange={e=>setProtect(e.target.checked)}/>Require a password to open the exported PDF</label>{protect&&<><label className="stacked-label">PDF password<input type="password" autoComplete="new-password" value={exportPassword} onChange={e=>setExportPassword(e.target.value)}/></label><label className="stacked-label">Confirm PDF password<input type="password" autoComplete="new-password" value={passwordConfirmation} onChange={e=>setPasswordConfirmation(e.target.value)}/></label><p className="fine-print">AES-256 encryption applies to the exported PDF. Workspace autosaves and .bide projects stay unencrypted.</p></>}</>}{format==='docx'&&<p className="notice">Extracts text in reading order. Page breaks are retained; complex layouts and images are not reconstructed. Scans require OCR before text can be extracted.</p>}{format==='pdf'&&<div className="export-note"><ShieldCheck size={18}/><span>Normal layers keep text and vectors. Blend effects rasterize design pages; forms are flattened.<br/><small>Save a .bide project to keep added layers editable.</small></span></div>}<div className="dialog-actions"><button className="secondary" onClick={saveProject}><Save size={14}/>Save project</button><button className="primary" onClick={()=>runExport()} disabled={!health.ok||(format==='psd'&&!!page.source)||(format==='pdf'&&protect&&(!exportPassword||exportPassword!==passwordConfirmation))}><Download size={15}/>Export {format==='split'?'pages':format.toUpperCase()}</button></div></ModalShell>}
    {modal==='shortcuts'&&<ModalShell title="Stay in your flow" close={()=>setModal(null)}><p className="muted">A few shortcuts that make a big difference.</p><div className="shortcut-list">{[['Command palette','Ctrl K'],['Open document','Ctrl O'],['Save editable project','Ctrl S'],['Export','Ctrl E'],['Undo / Redo','Ctrl Z / Ctrl Shift Z'],['Duplicate selection','Ctrl D'],['Group / Ungroup','Ctrl G / Ctrl Shift G'],['Select / Text / Rectangle','V / T / R'],['Ellipse / Line / Brush','O / L / B'],['Pan workspace','Hold Space'],['Fit page / Actual size','Ctrl 0 / Ctrl 1'],['Zoom in / out','Ctrl + / Ctrl -'],['Zoom at pointer','Ctrl or Alt + wheel'],['Freehand highlighter','H'],['Eraser (overlay artwork)','E'],['Brush / eraser size','[ / ]'],['Nudge / Larger nudge','Arrows / Shift + Arrows'],['Delete selection','Delete']].map(([name,key])=><div key={name}><span>{name}</span><kbd>{key}</kbd></div>)}</div></ModalShell>}
    {palette&&<ModalShell title="What would you like to do?" close={()=>setPalette(false)}><div className="palette-search"><Search size={20}/><input aria-label="Search commands" placeholder="Search tools, actions, and exports…" value={query} onChange={e=>{setQuery(e.target.value);setCommandIndex(0);}} autoFocus onKeyDown={e=>{if(e.key==='ArrowDown'){e.preventDefault();setCommandIndex(i=>Math.min(filteredActions.length-1,i+1));}if(e.key==='ArrowUp'){e.preventDefault();setCommandIndex(i=>Math.max(0,i-1));}if(e.key==='Enter'&&filteredActions[commandIndex]){e.preventDefault();setPalette(false);setPdfHome(false);filteredActions[commandIndex].run();}}}/><kbd>Esc</kbd></div><div className="command-list">{filteredActions.map((a,i)=><button key={a.label} className={i===commandIndex?'active':''} onMouseEnter={()=>setCommandIndex(i)} onClick={()=>{setPalette(false);setPdfHome(false);a.run();}}><a.icon size={17}/><span>{a.label}</span><kbd>{a.hint}</kbd></button>)}{!filteredActions.length&&<p className="muted">No matching commands. Try “PDF”, “text”, or “export”.</p>}</div><div className="palette-footer"><span>↑ ↓ Navigate</span><span>↵ Select</span></div></ModalShell>}
  </div>;
}
