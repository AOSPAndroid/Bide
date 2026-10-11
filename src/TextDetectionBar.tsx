import {bundledFonts,systemFonts} from './font-catalog';
import type {OcrGrouping} from './ocr-segmentation';
import type {ReplacementBackground} from './detected-text';
import type {TextRegion} from './text-regions';

export type OcrSettings={font:string;style:string;grouping:OcrGrouping;background:ReplacementBackground;color:string;padding:number};
export const defaultOcrSettings:OcrSettings={font:'Liberation Sans',style:'auto',grouping:'smart',background:'sampled',color:'#ffffff',padding:-1};

type Props={status:string;regions:TextRegion[];show:boolean;onShow:(show:boolean)=>void;settings:OcrSettings;onChange:(patch:Partial<OcrSettings>)=>void;scanning:boolean;onRescan:()=>void};

export default function TextDetectionBar({status,regions,show,onShow,settings,onChange,scanning,onRescan}:Props){
 return <div className="text-detection-bar">
  <label><input type="checkbox" checked={show} onChange={e=>onShow(e.target.checked)}/>Edit detected text</label>
  <span>{status||'Open a page to detect its text'}</span>
  {regions.some(r=>r.kind==='ocr')&&<>
   <label title="Images contain no font metadata. Choose the closest appearance before editing; use Font family afterward.">OCR font<select aria-label="OCR replacement font" value={settings.font} onChange={e=>onChange({font:e.target.value})}>
    <optgroup label="Bundled · available offline">{bundledFonts.map(f=><option key={f.family} value={f.family}>{f.family}</option>)}</optgroup>
    <optgroup label="Workplace / system · must be installed">{systemFonts.map(f=><option key={f} value={f}>{f}</option>)}</optgroup>
   </select></label>
   <label title="Choose the original lettering style before clicking detected text; sizing uses this font face.">OCR weight<select aria-label="OCR replacement weight" value={settings.style} onChange={e=>onChange({style:e.target.value})}>
    <option value="auto">Auto (match strokes)</option><option value="regular">Regular</option><option value="bold">Bold</option><option value="italic">Italic</option><option value="bold-italic">Bold italic</option>
   </select></label>
  </>}
  <label title="Smart splits large gaps such as avatar initials beside a message. Words lets you edit each word separately.">OCR selection<select aria-label="OCR selection grouping" value={settings.grouping} onChange={e=>onChange({grouping:e.target.value as OcrGrouping})}>
   <option value="smart">Smart groups</option><option value="words">Individual words</option><option value="lines">Whole lines</option>
  </select></label>
  <label title="Applies to the next detected image text. Smooth repair follows nearby gradients; use Clone or Healing for detailed textures.">Replacement background<select aria-label="Text replacement background" value={settings.background} onChange={e=>onChange({background:e.target.value as ReplacementBackground})}>
   <option value="repair">Repair smooth background</option><option value="sampled">Sampled color</option><option value="solid">Solid color</option><option value="transparent">Clear to transparent</option>
  </select></label>
  <label title="Leave blank for the automatic 0.8.6 cleanup margin, or set a custom pixel margin">Cleanup padding<input aria-label="Text cleanup padding" type="number" min="0" max="20" step="1" placeholder="Auto" value={settings.padding<0?'':settings.padding} onChange={e=>onChange({padding:e.target.value===''?-1:Math.max(0,Math.min(20,Number(e.target.value)||0))})}/></label>
  {settings.background==='solid'&&<input type="color" aria-label="Replacement background color" value={settings.color} onChange={e=>onChange({color:e.target.value})}/>}
  <button disabled={scanning} onClick={onRescan}>Rescan</button>
 </div>;
}
