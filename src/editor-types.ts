// Types and the tool list shared by the editor's modules.
import type {FabricObject} from 'fabric';
import { Blend, Brush, Circle, Copy, Crop, Eraser, Hand, Highlighter, LassoSelect, Minus, MousePointer2, MousePointerClick, PaintBucket, PenLine, PenTool, Sparkles, Square, SquareDashed, Type, Wand2, ZoomIn } from 'lucide-react';
import type {LayerStyle} from './layer-effects';
import type {SearchableCommand} from './command-search';

export type Obj = FabricObject & { layerStyle?:LayerStyle; textSoftness?:number; pdfFontData?:string;pdfOriginalFont?:string;pdfFontFallback?:string;pdfFontBold?:boolean;pdfFontItalic?:boolean;recognizedKey?:string; id?: string; name?: string; diagramXml?: string; text?: string; fontSize?: number; fontFamily?: string; fontWeight?: string | number; fontStyle?: string; underline?: boolean; textAlign?: string; isEditing?: boolean };
export type Tool = 'select' | 'pen' | 'crop' | 'wand' | 'object' | 'gradient' | 'bucket' | 'mask' | 'text' | 'rect' | 'ellipse' | 'line' | 'brush' | 'highlight' | 'eraser' | 'marquee' | 'lasso' | 'hand' | 'clone' | 'heal' | 'zoom';
export type PaletteAction = SearchableCommand & {hint:string;icon:typeof Type;run:()=>void};
export type Modal = 'imagesize' | 'canvassize' | 'new' | 'export' | 'signature' | 'shortcuts' | 'resize' | 'watermark' | 'numbers' | 'crop' | null;
export const TOOLS: { id: Tool; label: string; key: string; icon: typeof Type }[] = [
  {id:'zoom',label:'Zoom tool',key:'Z',icon:ZoomIn},
  {id:'clone',label:'Clone Stamp',key:'S',icon:Copy},{id:'heal',label:'Healing Brush',key:'J',icon:Sparkles},
  { id: 'select', label: 'Move & select', key: 'V', icon: MousePointer2 }, { id: 'crop', label: 'Crop', key: 'C', icon: Crop }, { id: 'pen', label: 'Pen', key: 'P', icon: PenTool }, { id: 'wand', label: 'Magic wand', key: 'W', icon: Wand2 }, { id: 'object', label: 'Object select (AI)', key: 'A', icon: MousePointerClick }, { id: 'text', label: 'Text box', key: 'T', icon: Type },
  { id: 'rect', label: 'Rectangle', key: 'R', icon: Square }, { id: 'ellipse', label: 'Ellipse', key: 'O', icon: Circle },
  { id: 'line', label: 'Line', key: 'U', icon: Minus }, { id: 'brush', label: 'Brush', key: 'B', icon: PenLine },
  { id: 'highlight', label: 'Highlight', key: 'H', icon: Highlighter }, { id: 'gradient', label: 'Gradient', key: 'G', icon: Blend }, { id: 'bucket', label: 'Paint bucket', key: 'K', icon: PaintBucket }, { id: 'mask', label: 'Mask brush', key: 'Q', icon: Brush }, { id: 'eraser', label: 'Eraser', key: 'E', icon: Eraser }, { id:'marquee',label:'Rectangular selection',key:'M',icon:SquareDashed }, { id:'lasso',label:'Lasso selection',key:'L',icon:LassoSelect }, { id: 'hand', label: 'Pan', key: 'Space', icon: Hand },
];
