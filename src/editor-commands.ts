// The command palette and menu commands, with the reason each is unavailable.
// Built on every render from the editor's state and actions.
import {Canvas,Rect,FabricImage,Path,ActiveSelection} from 'fabric';
import {LassoSelect,SquareDashed,Wand2,PaintBucket,Blend,Brush,PenTool,Crop,Ruler,History as HistoryIcon,ArrowDown,ArrowUp,Bold,ChevronLeft,ChevronRight,Circle,Command,Copy,Download,Eraser,Eye,EyeOff,FileImage,FilePlus2,FileText,FolderOpen,Highlighter,ImagePlus,Italic,Layers,LockKeyhole,Maximize,Merge,Minus,MousePointer2,PanelLeftClose,PenLine,Plus,Receipt,Redo2,RotateCw,Save,Scaling,Scissors,Search,Settings2,SlidersHorizontal,Sparkles,Square,Trash2,Type,Underline,Undo2,UnlockKeyhole,ZoomIn} from 'lucide-react';
import type {RefObject,Dispatch,SetStateAction} from 'react';
import {type SelectionAction} from './SelectionBar';
import {type Guides} from './Rulers';
import {effectLabels,type EffectName,type LayerStyle} from './layer-effects';
import {maskBounds,type Mask} from './pixel-mask';
import {layerPixelsMask,hasLayerMask} from './selection-canvas';
import {Textbox} from './text-appearance';
import {type Page,type Project} from './model';
import {blendModes} from './browser/layer-utils';
import {type Workspace} from './WorkspaceDock';
import {bundledFonts,systemFonts} from './font-catalog';
import {type SelectionPoint} from './selection-mask';
import {brushWidth,brushNames,type BrushKind} from './brushes';
import {type TextRegion} from './text-regions';
import {type ColorStyle} from './DesignTools';
import {framePresets,layoutLabels,type LayoutAction} from './design-layout';
import {type Tilt} from './browser/straighten';
import {type FormFieldType} from './forms';
import {TOOLS,type Obj,type Tool,type PaletteAction,type Modal} from './editor-types';

export type EditorCommandsDeps={
  selectWorkspace:(next: Workspace) => void;
  setShowDetectedText:Dispatch<SetStateAction<boolean>>;
  setTextScanRevision:Dispatch<SetStateAction<number>>;
  setTool:Dispatch<SetStateAction<Tool>>;
  changeZoom:(value: number, at?: { x: number; y: number; } | undefined) => void;
  zoomRef:RefObject<number>;
  setModal:Dispatch<SetStateAction<Modal>>;
  openFiles:(append?: boolean) => void;
  projectInput:RefObject<HTMLInputElement | null>;
  saveProject:() => void;
  exportDialog:(nextFormat?: string, nextCompression?: string, makeSearchable?: boolean) => void;
  addText:() => void;
  imageInput:RefObject<HTMLInputElement | null>;
  addPage:() => void;
  duplicatePage:(target?: string) => void;
  pageAction:(action: string, target: string) => void;
  pageId:string;
  undo:(redo?: boolean) => void;
  duplicate:() => Promise<void>;
  groupLayers:() => void;
  ungroupLayers:() => void;
  fit:() => void;
  setProtect:Dispatch<SetStateAction<boolean>>;
  page:Page;
  unlockOriginalPdf:() => Promise<void>;
  runSelection:(action: SelectionAction, amount?: number) => void;
  region:{ id: string; points: SelectionPoint[]; mask?: Mask | undefined; outline?: string | undefined; } | null;
  aiReady:boolean | undefined;
  selectSubject:() => Promise<void>;
  openColorRange:() => void;
  mergeDown:() => void;
  addAdjustment:(kind: "levels" | "curves" | "hueSaturation") => void;
  openWarp:() => void;
  project:Project;
  selected:Obj | null;
  canvas:RefObject<Canvas | null>;
  syncSelection:() => void;
  setRegion:Dispatch<SetStateAction<{ id: string; points: SelectionPoint[]; mask?: Mask | undefined; outline?: string | undefined; } | null>>;
  copyToClipboard:() => void;
  pasteFromClipboard:() => Promise<void>;
  setMobilePanel:Dispatch<SetStateAction<"pages" | "properties" | null>>;
  togglePathEdit:() => void;
  trimToContent:() => void;
  selectionPixels:(r: { id: string; points: SelectionPoint[]; mask?: Mask | undefined; outline?: string | undefined; }) => Mask;
  cropTo:(rect: { left: number; top: number; width: number; height: number; }, angle?: number) => void;
  toggleRulers:() => void;
  setShowGuides:Dispatch<SetStateAction<boolean>>;
  guides:Guides;
  setGuides:(next: Guides) => void;
  setSidePanel:Dispatch<SetStateAction<"layers" | "history">>;
  openPerspective:() => void;
  addLayerMask:() => void;
  invertSelectedMask:() => void;
  applyLayerMask:() => void;
  deleteLayerMask:() => void;
  addEffect:(name: keyof LayerStyle) => void;
  setLayerStyle:(style: LayerStyle | undefined, save?: boolean) => void;
  selectionTarget:RefObject<string | null>;
  showMask:(id: string, mask: Mask) => void;
  removeBackground:() => Promise<void>;
  exportTransparentPng:(textOnly?: boolean) => Promise<void>;
  aiSharpenSelected:() => Promise<void>;
  aiRemove:() => Promise<void>;
  straightenPage:(known?: Tilt | undefined) => Promise<void>;
  flattenPageAi:() => Promise<void>;
  textRegions:TextRegion[];
  setRedactOpen:Dispatch<SetStateAction<boolean>>;
  addFormField:(type: FormFieldType) => void;
  setProofOpen:Dispatch<SetStateAction<boolean>>;
  setFindOpen:Dispatch<SetStateAction<boolean>>;
  convertAllDetectedText:() => Promise<void>;
  updateObject:(values: Record<string, unknown>, save?: boolean) => void;
  setView:Dispatch<SetStateAction<Workspace>>;
  documentView:RefObject<"photo" | "pdf">;
  setPdfHome:Dispatch<SetStateAction<boolean>>;
  setLeftOpen:Dispatch<SetStateAction<boolean>>;
  setPageId:Dispatch<SetStateAction<string>>;
  deletePage:(target?: string) => void;
  clipboard:RefObject<Obj | null>;
  copyPending:RefObject<Promise<Obj> | null>;
  removeSelected:() => void;
  moveLayer:(direction: "up" | "down") => void;
  toggleLock:(o: Obj) => void;
  saveCanvas:() => void;
  align:(where: string) => void;
  applySelection:(mode: "copy" | "keep" | "hide") => Promise<void>;
  setClip:(kind: string) => void;
  setImageFilter:(kind: string, value?: number | undefined) => void;
  changeTextFont:(family: string) => Promise<void>;
  setBrushKind:Dispatch<SetStateAction<BrushKind>>;
  addArtboard:(index: number) => void;
  setLayoutGrid:Dispatch<SetStateAction<boolean>>;
  layoutSelection:(action: LayoutAction) => void;
  colorStyles:ColorStyle[];
  applyColorStyle:(fill: string) => void;
  tool:Tool;
  setEraserSize:Dispatch<SetStateAction<number>>;
  setRetouchSize:Dispatch<SetStateAction<number>>;
  setHighlightSize:Dispatch<SetStateAction<number>>;
  setBrushSize:Dispatch<SetStateAction<number>>;
  setSnap:Dispatch<SetStateAction<boolean>>;
  layers:Obj[];
};

export function editorCommands(d:EditorCommandsDeps){
  const {selectWorkspace,setShowDetectedText,setTextScanRevision,setTool,changeZoom,zoomRef,setModal,openFiles,projectInput,saveProject,exportDialog,addText,imageInput,addPage,duplicatePage,pageAction,pageId,undo,duplicate,groupLayers,ungroupLayers,fit,setProtect,page,unlockOriginalPdf,runSelection,region,aiReady,selectSubject,openColorRange,mergeDown,addAdjustment,openWarp,project,selected,canvas,syncSelection,setRegion,copyToClipboard,pasteFromClipboard,setMobilePanel,togglePathEdit,trimToContent,selectionPixels,cropTo,toggleRulers,setShowGuides,guides,setGuides,setSidePanel,openPerspective,addLayerMask,invertSelectedMask,applyLayerMask,deleteLayerMask,addEffect,setLayerStyle,selectionTarget,showMask,removeBackground,exportTransparentPng,aiSharpenSelected,aiRemove,straightenPage,flattenPageAi,textRegions,setRedactOpen,addFormField,setProofOpen,setFindOpen,convertAllDetectedText,updateObject,setView,documentView,setPdfHome,setLeftOpen,setPageId,deletePage,clipboard,copyPending,removeSelected,moveLayer,toggleLock,saveCanvas,align,applySelection,setClip,setImageFilter,changeTextFont,setBrushKind,addArtboard,setLayoutGrid,layoutSelection,colorStyles,applyColorStyle,tool,setEraserSize,setRetouchSize,setHighlightSize,setBrushSize,setSnap,layers}=d;
  const actions: PaletteAction[] = [
    { label:'Open photo editor', hint:'', icon:FileImage, run:()=>selectWorkspace('photo') },
    { label:'Open PDF MasterTool', hint:'', icon:FileText, run:()=>selectWorkspace('pdf') },
    { label:'Open Documents workspace', hint:'', icon:Receipt, run:()=>selectWorkspace('documents') },
    {label:'Recognize text on current page',hint:'',icon:Type,keywords:'ocr scan edit pdf image text font',run:()=>{setShowDetectedText(true);setTextScanRevision(v=>v+1);}},
    {label:'Toggle detected text regions',hint:'',icon:Type,run:()=>setShowDetectedText(v=>!v)},
    {label:'Zoom tool',hint:'Z',icon:ZoomIn,run:()=>setTool('zoom')},
    { label:'Zoom in', hint:'Ctrl +', icon:ZoomIn, run:()=>changeZoom(zoomRef.current*1.2) },
    { label:'Zoom out', hint:'Ctrl −', icon:Minus, run:()=>changeZoom(zoomRef.current/1.2) },
    { label:'Actual size (100%)', hint:'Ctrl 1', icon:Maximize, run:()=>changeZoom(1) },
    { label:'Freehand highlight', hint:'H', icon:Highlighter, run:()=>setTool('highlight') },
    { label:'New document', hint:'Ctrl N', icon:FilePlus2, run:()=>setModal('new') }, { label:'Open PDF, image or Office file', hint:'Ctrl O', icon:FolderOpen, run:()=>openFiles() },
    { label:'Open editable project', hint:'.bide', icon:FolderOpen, run:()=>projectInput.current?.click() }, { label:'Save editable project', hint:'Ctrl S', icon:Save, run:saveProject },
    { label:'Export PDF', hint:'Ctrl Shift E', icon:Download, run:()=>exportDialog('pdf') }, { label:'Add text box', hint:'T', icon:Type, run:addText },
    { label:'Place image', hint:'', icon:ImagePlus, run:()=>imageInput.current?.click() }, { label:'Add signature', hint:'', icon:PenLine, run:()=>setModal('signature') },
    { label:'Merge documents', hint:'', icon:Merge, run:()=>openFiles(true) }, { label:'Split PDF into pages', hint:'', icon:Scissors, run:()=>exportDialog('split') },
    { label:'Compress PDF', hint:'', icon:Scaling, run:()=>exportDialog('pdf','balanced') }, { label:'Convert Office or images to PDF', hint:'', icon:FileText, run:()=>openFiles() },
    { label:'Export pages as PNG', hint:'', icon:FileImage, run:()=>exportDialog('png') }, { label:'Export pages as JPEG', hint:'', icon:FileImage, run:()=>exportDialog('jpg') },
    { label:'Extract text to Word', hint:'', icon:FileText, run:()=>exportDialog('docx') },
    { label:'Make PDF searchable (OCR)', hint:'', icon:Search, keywords:'scan text layer copy select find ocr pdf', run:()=>exportDialog('pdf','lossless',true) }, { label:'Extract plain text', hint:'', icon:FileText, run:()=>exportDialog('txt') },
    { label:'Add blank page', hint:'', icon:Plus, run:addPage }, { label:'Duplicate current page', hint:'', icon:Copy, run:()=>duplicatePage() },
    { label:'Rotate current page clockwise', hint:'', icon:RotateCw, run:()=>pageAction('right',pageId) },
    { label:'Undo', hint:'Ctrl Z', icon:Undo2, run:()=>undo() }, { label:'Redo', hint:'Ctrl Shift Z', icon:Redo2, run:()=>undo(true) },
    { label:'Duplicate selection', hint:'Ctrl D', icon:Copy, run:duplicate }, { label:'Group selection', hint:'Ctrl G', icon:Layers, run:groupLayers },
    { label:'Ungroup selection', hint:'Ctrl Shift G', icon:Layers, run:ungroupLayers }, { label:'Fit page to window', hint:'Ctrl 0', icon:Maximize, run:fit },
    { label:'Add watermarks', hint:'', icon:Type, run:()=>setModal('watermark') },
    { label:'Add page numbers', hint:'', icon:FileText, run:()=>setModal('numbers') },
    { label:'Crop current page', hint:'', icon:Scissors, run:()=>setModal('crop') },
    { label:'Protect PDF with password', hint:'', icon:LockKeyhole, run:()=>{exportDialog('pdf');setProtect(true);} },
    { label:'Unlock password PDF', hint:'', icon:UnlockKeyhole, run:()=>openFiles() },
    { label:'Export current design as PSD', hint:'', icon:Layers, run:()=>exportDialog('psd') },
    {label:'Unlock Original PDF as image layer',hint:'Marquee · Lasso · rasterize',icon:UnlockKeyhole,disabled:!page.source?'This page is already editable':undefined,run:()=>void unlockOriginalPdf()},
    {label:'Rectangular layer selection',hint:'M',icon:SquareDashed,run:()=>setTool('marquee')},
    {label:'Freehand lasso selection',hint:'L',icon:LassoSelect,run:()=>setTool('lasso')},
    {label:'Magic wand',hint:'W',icon:Wand2,keywords:'select colour color similar tolerance',run:()=>setTool('wand')},
    {label:'Select all pixels',hint:'',icon:SquareDashed,run:()=>runSelection('all')},
    {label:'Inverse selection',hint:'Ctrl Shift I',icon:SquareDashed,disabled:region?undefined:'Make a selection first',run:()=>runSelection('inverse')},
    {label:'Select subject with AI',hint:'',icon:Sparkles,keywords:'person object cut out isolate',disabled:aiReady?undefined:'AI models are not bundled in this build.',run:()=>void selectSubject()},
    {label:'Select color range',hint:'',icon:SquareDashed,keywords:'similar colour sky background',run:openColorRange},
    { label:'Draw with brush', hint:'B', icon:PenLine, run:()=>setTool('brush') },
    { label:'Erase artwork', hint:'E', icon:Eraser, run:()=>setTool('eraser') },
    {label:'Clone Stamp',hint:'S',icon:Copy,keywords:'sample retouch texture alt click',run:()=>setTool('clone')},
    {label:'Healing Brush',hint:'J',icon:Sparkles,keywords:'heal repair blend texture alt click',run:()=>setTool('heal')},
    {label:'Merge Down',hint:'Ctrl E',icon:Layers,run:mergeDown},
    {label:'New adjustment layer: Levels',hint:'',keywords:'levels contrast black white point gamma exposure tone',icon:SlidersHorizontal,run:()=>addAdjustment('levels')},
    {label:'New adjustment layer: Curves',hint:'',keywords:'curves tone contrast shadows highlights',icon:SlidersHorizontal,run:()=>addAdjustment('curves')},
    {label:'New adjustment layer: Hue/Saturation',hint:'',keywords:'hue saturation lightness colour color desaturate black and white grayscale vibrance',icon:SlidersHorizontal,run:()=>addAdjustment('hueSaturation')},
    {label:'Warp selected layer',hint:'',icon:Scaling,run:openWarp},
    { label:'Keyboard shortcuts', hint:'?', icon:Command, run:()=>setModal('shortcuts') },
  ];
  const currentIndex=project.pages.findIndex(p=>p.id===pageId);
  const requireLayer=!selected?'Select a layer first':selected.lockMovementX&&!(selected instanceof Textbox&&selected.isEditing)?'Unlock the layer first':undefined;
  const requireImage=!(selected instanceof FabricImage)?'Select an image layer first':requireLayer;
  const requireText=!(selected instanceof Textbox)?'Select a text layer first':requireLayer;
  const selectAllLayers=()=>{const c=canvas.current;if(!c)return;c.setActiveObject(new ActiveSelection(c.getObjects().filter(o=>!o.lockMovementX&&o.visible),{canvas:c}));c.requestRenderAll();syncSelection();};
  const clearSelection=()=>{setRegion(null);canvas.current?.discardActiveObject();canvas.current?.requestRenderAll();syncSelection();setTool('select');};
  const copyLayers=copyToClipboard;
  const pasteLayers=()=>void pasteFromClipboard();
  const focusSetting=(label:string)=>{/* OCR settings sit in their own dropdown, not in the Properties drawer. */if(!document.querySelector(`.ocr-settings [aria-label="${label}"]`))setMobilePanel('properties');requestAnimationFrame(()=>{const input=document.querySelector<HTMLElement>(`[aria-label="${label}"]`);/* Settings tucked into a closed menu open first. */for(let d=input?.closest('details');d;d=d.parentElement?.closest('details')??null)d.open=true;input?.scrollIntoView({block:'nearest'});input?.focus();});};
  const moreActions:PaletteAction[] = [
    {label:'Pen tool',hint:'P',icon:PenTool,keywords:'path bezier curve vector shape draw',run:()=>setTool('pen')},
    {label:'Edit path points',hint:'',icon:PenTool,keywords:'node anchor handle bezier',disabled:selected instanceof Path?requireLayer:'Select a path or pen shape first',run:()=>{setTool('select');togglePathEdit();}},
    {label:'Crop tool',hint:'C',icon:Crop,keywords:'straighten trim rotate page',run:()=>setTool('crop')},
    {label:'Image size…',hint:'',icon:Scaling,keywords:'resample resize scale pixels dimensions',run:()=>setModal('imagesize')},
    {label:'Canvas size…',hint:'',icon:Scaling,keywords:'extend border space anchor',run:()=>setModal('canvassize')},
    {label:'Trim to content',hint:'',icon:Crop,keywords:'transparent pixels crop auto',run:trimToContent},
    {label:'Crop to selection',hint:'',icon:Crop,disabled:region?undefined:'Make a selection first',run:()=>{const b=region&&maskBounds(selectionPixels(region));if(b){setRegion(null);cropTo(b);}}},
    {label:'Toggle rulers',hint:'Ctrl R',icon:Ruler,run:toggleRulers},
    {label:'Toggle guides',hint:'Ctrl ;',icon:Ruler,run:()=>setShowGuides(v=>!v)},
    {label:'Clear guides',hint:'',icon:Ruler,disabled:guides.x.length||guides.y.length?undefined:'This page has no guides',run:()=>setGuides({x:[],y:[]})},
    {label:'Show history',hint:'',icon:HistoryIcon,keywords:'undo steps states',run:()=>{setSidePanel('history');setMobilePanel('properties');}},
    {label:'Perspective distort',hint:'',icon:Scaling,keywords:'free transform corners keystone',disabled:requireLayer,run:openPerspective},
    {label:'Gradient tool',hint:'G',icon:Blend,keywords:'fill blend fade linear radial',run:()=>setTool('gradient')},
    {label:'Paint bucket',hint:'K',icon:PaintBucket,keywords:'fill flood colour color area',run:()=>setTool('bucket')},
    {label:'Mask brush',hint:'Q',icon:Brush,keywords:'paint layer mask hide reveal',run:()=>setTool('mask')},
    {label:'Add layer mask',hint:'',icon:Layers,disabled:requireLayer??(hasLayerMask(selected)?'This layer already has a mask':undefined),run:addLayerMask},
    {label:'Invert layer mask',hint:'',icon:Layers,disabled:requireLayer??(hasLayerMask(selected)?undefined:'Add a layer mask first'),run:invertSelectedMask},
    {label:'Apply layer mask',hint:'',icon:Layers,disabled:requireLayer??(hasLayerMask(selected)?undefined:'Add a layer mask first'),run:applyLayerMask},
    {label:'Delete layer mask',hint:'',icon:Layers,disabled:requireLayer??(hasLayerMask(selected)?undefined:'Add a layer mask first'),run:deleteLayerMask},
    ...(Object.keys(effectLabels) as EffectName[]).map(name=>({label:`Add layer style: ${effectLabels[name]}`,hint:'',icon:Sparkles,keywords:'effect fx shadow glow outline stroke overlay',disabled:requireLayer,run:()=>addEffect(name)})),
    {label:'Clear layer style',hint:'',icon:Sparkles,disabled:requireLayer??((selected as Obj|null)?.layerStyle?undefined:'This layer has no style'),run:()=>setLayerStyle(undefined)},
    {label:'Select layer pixels',hint:'',icon:SquareDashed,keywords:'transparency alpha load selection',disabled:requireLayer,run:()=>{const c=canvas.current,o=c?.getActiveObject() as Obj|undefined;if(!c||!o)return;selectionTarget.current=o.id||null;showMask(o.id!,layerPixelsMask(c,page,o));setTool('marquee');}},
    {label:'Remove background with AI',hint:'',icon:Eraser,keywords:'cut out subject transparent isolate',disabled:!aiReady?'AI models are not bundled in this build.':requireImage,run:()=>void removeBackground()},
    {label:'Export text as transparent PNG',hint:'',icon:Download,disabled:requireText,run:()=>void exportTransparentPng(true)},
    {label:'Export page as transparent PNG',hint:'',icon:Download,disabled:page.source?'Unlock Original PDF first':undefined,run:()=>void exportTransparentPng()},
    {label:'Sharpen image layer with AI (2×)',hint:'',keywords:'upscale enhance super resolution blurry esrgan',icon:SlidersHorizontal,disabled:!aiReady?'AI models are not bundled in this build.':requireImage,run:()=>void aiSharpenSelected()},
    {label:'Remove selection with AI fill',hint:'',keywords:'inpaint erase object content aware lama',icon:Eraser,disabled:!aiReady?'AI models are not bundled in this build.':region?undefined:'Draw a Marquee or Lasso selection first',run:()=>void aiRemove()},
    {label:'Straighten page (fix tilt and rotation)',hint:'',keywords:'deskew skew tilt rotate upright orientation scan photo ocr level',icon:RotateCw,disabled:page.source?'Unlock Original PDF first':undefined,run:()=>void straightenPage()},
    ...(aiReady?[{label:'Flatten photographed page (AI)',hint:'',keywords:'dewarp perspective curved curl unwarp document photo scan keystone',icon:Wand2,disabled:page.source?'Unlock Original PDF first':undefined,run:()=>void flattenPageAi()}]:[]),
    {label:'Find & redact (remove personal data)',hint:'',keywords:'redact redaction black out censor hide remove personal data privacy gdpr email phone iban card name confidential',icon:EyeOff,disabled:textRegions.length?undefined:'Open a page with text first',run:()=>setRedactOpen(true)},
    {label:'Add form field: Text',hint:'',keywords:'form field input fillable acroform text box',icon:Type,run:()=>addFormField('text')},
    {label:'Add form field: Checkbox',hint:'',keywords:'form field fillable acroform tick box',icon:Square,run:()=>addFormField('checkbox')},
    {label:'Add form field: Dropdown',hint:'',keywords:'form field fillable acroform select list choice combo',icon:Square,run:()=>addFormField('dropdown')},
    {label:'Add form field: Radio button',hint:'',keywords:'form field fillable acroform option choice',icon:Square,run:()=>addFormField('radio')},
    {label:'Proofread image text',hint:'',keywords:'spelling spell check ocr mistakes typo misread dictionary',icon:Type,disabled:textRegions.some(r=>r.kind==='ocr')?undefined:'Open an image or scanned page with text first',run:()=>setProofOpen(true)},
    {label:'Find and replace in image text',hint:'',keywords:'ocr rename typo correct name word everywhere',icon:Type,disabled:textRegions.some(r=>r.kind==='ocr')?undefined:'Open an image or scanned page with detected text first.',run:()=>setFindOpen(true)},
    {label:'Convert all detected text',hint:'',keywords:'ocr sharpen crisp blurry replace every line all text',icon:Type,disabled:textRegions.some(r=>r.kind==='ocr')?undefined:'Open an image or scanned page with detected text first.',run:()=>void convertAllDetectedText()},
    {label:'Choose OCR languages',hint:'',keywords:'german deutsch spanish español italian italiano dutch nederlands portuguese português english french language',icon:Type,run:()=>focusSetting('OCR languages')},
    {label:'Choose OCR scan depth',hint:'',keywords:'thorough sparse buttons badges labels screenshot',icon:Type,run:()=>focusSetting('OCR scan depth')},
    {label:'Choose OCR selection grouping',hint:'',keywords:'teams avatar initials split words lines',icon:Type,run:()=>focusSetting('OCR selection grouping')},
    {label:'Choose OCR replacement font',hint:'',keywords:'teams segoe aptos calibri corporate',icon:Type,run:()=>focusSetting('OCR replacement font')},
    {label:'Choose OCR replacement weight',hint:'',keywords:'bold regular italic text',icon:Bold,run:()=>focusSetting('OCR replacement weight')},
    {label:'Adjust replacement background',hint:'',icon:SlidersHorizontal,run:()=>focusSetting('Text replacement background')},
    {label:'Adjust text cleanup padding',hint:'',icon:SlidersHorizontal,run:()=>focusSetting('Text cleanup padding')},
    {label:'Adjust letter spacing',hint:'',icon:SlidersHorizontal,disabled:requireText,run:()=>focusSetting('Letter spacing')},
    {label:'Adjust text softness',hint:'',keywords:'blur sharpness scan match',icon:SlidersHorizontal,disabled:requireText,run:()=>focusSetting('Text softness')},
    ...Object.keys(blendModes).map(name=>({label:`Set blend mode: ${name}`,hint:'',icon:Layers,disabled:page.source?'Blend modes require a design page':requireLayer,run:()=>updateObject({globalCompositeOperation:blendModes[name as keyof typeof blendModes]})})),
    ...['Font size','Font family','Text content','Object fill','Stroke color','Layer blend mode','Shape mask'].map(setting=>({label:`Edit ${setting.toLowerCase()}`,hint:'',icon:Settings2,disabled:setting.startsWith('Font')||setting==='Text content'?requireText:requireLayer,run:()=>focusSetting(setting)})),
    ...['brightness','contrast','saturation','blur','Crop X','Crop Y','Crop width','Crop height'].map(setting=>({label:`Adjust image ${setting.toLowerCase()}`,hint:'',icon:SlidersHorizontal,disabled:requireImage,run:()=>{setMobilePanel('properties');requestAnimationFrame(()=>{document.querySelectorAll<HTMLDetailsElement>('.properties-content details').forEach(d=>{d.open=true;});focusSetting(setting);});}})),
    {label:'Change drawing color',hint:'',icon:PenLine,run:()=>focusSetting('Drawing color')},
    {label:'Change page background',hint:'',icon:Square,run:()=>{clearSelection();focusSetting('Page background');}},
    {label:'Return to document editor',hint:'',icon:FileText,run:()=>{setView(documentView.current);setPdfHome(false);}},
    {label:'Show pages',hint:'',icon:Layers,run:()=>{setLeftOpen(true);setMobilePanel('pages');}},
    {label:'Hide pages',hint:'',icon:PanelLeftClose,run:()=>{setLeftOpen(false);setMobilePanel(null);}},
    {label:'Show properties and layers',hint:'',icon:Settings2,run:()=>setMobilePanel('properties')},
    {label:'Previous page',hint:'',icon:ChevronLeft,disabled:currentIndex===0?'Already on the first page':undefined,run:()=>setPageId(project.pages[currentIndex-1].id)},
    {label:'Next page',hint:'',icon:ChevronRight,disabled:currentIndex===project.pages.length-1?'Already on the last page':undefined,run:()=>setPageId(project.pages[currentIndex+1].id)},
    ...project.pages.map((p,i)=>({label:`Go to page ${i+1}: ${p.name}`,hint:'',icon:FileText,keywords:`jump navigate page ${i+1}`,run:()=>setPageId(p.id)})),
    {label:'Remove current page',hint:'',icon:Trash2,disabled:project.pages.length===1?'Keep at least one page':undefined,run:()=>deletePage()},
    {label:'Rotate page counterclockwise',hint:'',icon:RotateCw,run:()=>pageAction('left',pageId)},
    {label:'Move page to beginning',hint:'',icon:ArrowUp,disabled:currentIndex===0?'Already first':undefined,run:()=>pageAction('first',pageId)},
    {label:'Move page to end',hint:'',icon:ArrowDown,disabled:currentIndex===project.pages.length-1?'Already last':undefined,run:()=>pageAction('last',pageId)},
    {label:'Resize page',hint:'',icon:Scaling,run:()=>setModal('resize')},
    {label:'Export pages as SVG',hint:'',icon:FileImage,run:()=>exportDialog('svg')},
    {label:'Select all layers',hint:'Ctrl A',icon:Layers,run:selectAllLayers},
    {label:'Deselect everything',hint:'Esc',icon:MousePointer2,run:clearSelection},
    {label:'Copy selected layers',hint:'Ctrl C',icon:Copy,disabled:!selected&&!region?'Select an area or layer first':undefined,run:copyLayers},
    {label:'Paste copied layers',hint:'Ctrl V',icon:Copy,disabled:!clipboard.current&&!copyPending.current?'Copy an area or layer first':undefined,run:pasteLayers},
    {label:'Delete selected layers',hint:'Delete',icon:Trash2,disabled:requireLayer,run:removeSelected},
    {label:'Bring layer forward',hint:'',icon:ArrowUp,disabled:requireLayer,run:()=>moveLayer('up')},
    {label:'Send layer backward',hint:'',icon:ArrowDown,disabled:requireLayer,run:()=>moveLayer('down')},
    {label:'Toggle layer lock',hint:'',icon:LockKeyhole,disabled:!selected?'Select a layer first':undefined,run:()=>{if(selected)toggleLock(selected);}},
    {label:'Toggle layer visibility',hint:'',icon:Eye,disabled:!selected?'Select a layer first':undefined,run:()=>{if(selected){selected.set({visible:!selected.visible});canvas.current?.requestRenderAll();saveCanvas();}}},
    ...(['left','center','right'] as const).map(where=>({label:`Align layer ${where} on page`,hint:'',icon:Scaling,disabled:requireLayer,run:()=>align(where)})),
    {label:'Flip layer horizontally',hint:'',icon:Scaling,disabled:requireLayer,run:()=>updateObject({flipX:!selected?.flipX})},
    {label:'Flip layer vertically',hint:'',icon:Scaling,disabled:requireLayer,run:()=>updateObject({flipY:!selected?.flipY})},
    ...(['keep','hide','copy'] as const).map(mode=>({label:mode==='keep'?'Keep artwork inside selection':mode==='hide'?'Hide artwork inside selection':'Copy selection to new layer',hint:'',icon:SquareDashed,disabled:!region?'Draw a rectangular or lasso selection first':undefined,run:()=>void applySelection(mode)})),
    ...(['none','ellipse','rounded'] as const).map(kind=>({label:kind==='none'?'Remove layer mask':`Apply ${kind} layer mask`,hint:'',icon:Circle,disabled:requireLayer,run:()=>setClip(kind)})),
    ...(['grayscale','sepia','invert','reset'] as const).map(kind=>({label:kind==='reset'?'Reset image filters':`Apply ${kind} image filter`,hint:'',icon:SlidersHorizontal,disabled:requireImage,run:()=>setImageFilter(kind)})),
    {label:'Toggle bold text',hint:'',icon:Bold,disabled:requireText,run:()=>updateObject({fontWeight:selected?.fontWeight==='bold'?'normal':'bold'})},
    {label:'Toggle italic text',hint:'',icon:Italic,disabled:requireText,run:()=>updateObject({fontStyle:selected?.fontStyle==='italic'?'normal':'italic'})},
    {label:'Toggle underline text',hint:'',icon:Underline,disabled:requireText,run:()=>updateObject({underline:!selected?.underline})},
    ...(['left','center','right','justify'] as const).map(where=>({label:`Align text ${where}`,hint:'',icon:Type,disabled:requireText,run:()=>updateObject({textAlign:where})})),
    ...[...bundledFonts.map(f=>f.family),...systemFonts].map(family=>({label:`Set font: ${family}`,hint:'',icon:Type,disabled:requireText,run:()=>void changeTextFont(family)})),
    ...Object.entries(brushNames).map(([kind,name])=>({label:`Use ${name.toLowerCase()} brush`,hint:'',icon:PenLine,run:()=>{setBrushKind(kind as BrushKind);setTool('brush');}})),
    ...framePresets.map((f,i)=>({label:`Add artboard: ${f.name}`,hint:`${f.width} × ${f.height}`,icon:Square,keywords:'figma frame screen preset',run:()=>addArtboard(i)})),
    {label:'Toggle layout grid',hint:'',icon:SquareDashed,keywords:'figma grid guides',run:()=>setLayoutGrid(v=>!v)},
    ...Object.entries(layoutLabels).map(([key,label])=>({label,hint:'',icon:Scaling,keywords:'figma layout alignment spacing tidy',disabled:(canvas.current?.getActiveObjects().length||0)<(key.startsWith('distribute')?3:key==='row'||key==='column'?2:1)?'Select more layers first':canvas.current?.getActiveObjects().some(o=>o.lockMovementX||o.lockMovementY)?'Unlock the selected layers first':undefined,run:()=>layoutSelection(key as LayoutAction)})),
    ...['Grid size','Layout gap','Color style name','Corner radius'].map(setting=>({label:`Edit ${setting.toLowerCase()}`,hint:'',icon:Settings2,keywords:'figma design properties',disabled:setting==='Corner radius'&&!(selected instanceof Rect)?'Select a rectangle first':undefined,run:()=>{document.querySelector<HTMLDetailsElement>('.design-tools')?.setAttribute('open','');focusSetting(setting);}})),
    ...colorStyles.map(style=>({label:`Apply color style: ${style.name}`,hint:style.color,icon:Circle,keywords:'figma swatch fill',run:()=>applyColorStyle(style.color)})),
    {label:'Increase drawing size',hint:']',icon:Plus,run:()=>{if(tool==='eraser')setEraserSize(v=>brushWidth(v+2));else if(tool==='clone'||tool==='heal')setRetouchSize(v=>brushWidth(v+2));else if(tool==='highlight')setHighlightSize(v=>Math.min(120,v+2));else {setTool('brush');setBrushSize(v=>brushWidth(v+2));}}},
    {label:'Decrease drawing size',hint:'[',icon:Minus,run:()=>{if(tool==='eraser')setEraserSize(v=>brushWidth(v-2));else if(tool==='clone'||tool==='heal')setRetouchSize(v=>brushWidth(v-2));else if(tool==='highlight')setHighlightSize(v=>Math.max(1,v-2));else {setTool('brush');setBrushSize(v=>brushWidth(v-2));}}},
    {label:'Toggle snapping to page',hint:'',icon:Maximize,run:()=>setSnap(v=>!v)},
    ...TOOLS.filter(t=>['select','text','rect','ellipse','line','hand'].includes(t.id)).map(t=>({label:`Use ${t.label.toLowerCase()} tool`,hint:t.key,icon:t.icon,run:()=>setTool(t.id)})),
    ...layers.map(layer=>({label:`Select layer: ${layer.name||layer.type}`,hint:'',category:'Layers',icon:Layers,run:()=>{canvas.current?.setActiveObject(layer);canvas.current?.requestRenderAll();syncSelection();setTool('select');}})),
  ];
  // The Documents workspace has no canvas, so its palette only switches workspaces.
  const documentsActions=actions.filter(a=>['Open photo editor','Open PDF MasterTool','Open Documents workspace'].includes(a.label));
  return {actions,requireLayer,focusSetting,moreActions,documentsActions};
}
