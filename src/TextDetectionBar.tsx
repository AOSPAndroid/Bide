import {bundledFonts,systemFonts} from './font-catalog';
import type {OcrGrouping} from './ocr-segmentation';
import type {ReplacementBackground} from './detected-text';
import type {TextRegion} from './text-regions';
import {useEffect,useState} from 'react';
import {bundledOcrLanguages,defaultOcrLanguages,languageLabel,type OcrLanguage} from './ocr-languages';

export type OcrSettings={font:string;style:string;grouping:OcrGrouping;background:ReplacementBackground;color:string;padding:number;thorough:boolean;languages:string[];matchBlur:boolean;engine:'tesseract'|'paddle';aiSharpen:boolean};
export const defaultOcrSettings:OcrSettings={font:'Liberation Sans',style:'auto',grouping:'smart',background:'sampled',color:'#ffffff',padding:-1,thorough:false,languages:defaultOcrLanguages,matchBlur:true,engine:'paddle',aiSharpen:false};

type Props={ai:boolean;status:string;regions:TextRegion[];show:boolean;onShow:(show:boolean)=>void;settings:OcrSettings;onChange:(patch:Partial<OcrSettings>)=>void;scanning:boolean;onRescan:()=>void;onConvertAll:()=>void};

export default function TextDetectionBar({ai,status,regions,show,onShow,settings,onChange,scanning,onRescan,onConvertAll}:Props){
 const [available,setAvailable]=useState<OcrLanguage[]>([]);
 useEffect(()=>{let live=true;void bundledOcrLanguages().then(list=>{if(live)setAvailable(list);});return()=>{live=false;};},[]);
 const toggle=(code:string,on:boolean)=>{const next=available.map(l=>l.code).filter(c=>c===code?on:settings.languages.includes(c));if(next.length)onChange({languages:next});};
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
   <label title="Soften each replacement to match the blur measured on the original letters, so it blends in. Convert all always makes crisp text."><input type="checkbox" aria-label="Match original blur" checked={settings.matchBlur} onChange={e=>onChange({matchBlur:e.target.checked})}/>Match blur</label>
   <button disabled={scanning} title="Replace every detected line with crisp editable text in one step. Undo restores the original." onClick={onConvertAll}>Convert all</button>
  </>}
  <label title="Smart splits large gaps such as avatar initials beside a message. Words lets you edit each word separately.">OCR selection<select aria-label="OCR selection grouping" value={settings.grouping} onChange={e=>onChange({grouping:e.target.value as OcrGrouping})}>
   <option value="smart">Smart groups</option><option value="words">Individual words</option><option value="lines">Whole lines</option>
  </select></label>
  {ai&&<label title="AI OCR (PaddleOCR, bundled) reads blurry screenshots and photos better and covers all Latin-script languages at once. Standard uses Tesseract with the languages chosen below.">OCR engine<select aria-label="OCR engine" value={settings.engine} onChange={e=>onChange({engine:e.target.value as OcrSettings['engine']})}>
   <option value="tesseract">Standard</option><option value="paddle">AI (PaddleOCR)</option>
  </select></label>}
  {ai&&<label title="Before reading small or soft text, enlarge and sharpen the image with AI (Real-ESRGAN). Slower; skipped for large pages."><input type="checkbox" aria-label="AI sharpen before OCR" checked={settings.aiSharpen} onChange={e=>onChange({aiSharpen:e.target.checked})}/>AI sharpen</label>}
  {settings.engine==='tesseract'&&available.length>1&&<details className="ocr-languages"><summary aria-label="OCR languages" title="Languages on the page. Fewer languages scan faster and misread less.">OCR languages: {languageLabel(settings.languages,available)}</summary><div>{available.map(l=><label key={l.code}><input type="checkbox" aria-label={`OCR language ${l.name}`} checked={settings.languages.includes(l.code)} disabled={settings.languages.length===1&&settings.languages.includes(l.code)} onChange={e=>toggle(l.code,e.target.checked)}/>{l.name}</label>)}</div></details>}
  {(!ai||settings.engine==='tesseract')&&<label title="Thorough adds a second, sparse-text pass that can find isolated labels such as buttons and badges. Takes about twice as long.">OCR scan<select aria-label="OCR scan depth" value={settings.thorough?'thorough':'standard'} onChange={e=>onChange({thorough:e.target.value==='thorough'})}>
   <option value="standard">Standard</option><option value="thorough">Thorough (slower)</option>
  </select></label>}
  <label title="Applies to the next detected image text. Smooth repair follows nearby gradients; use Clone or Healing for detailed textures.">Replacement background<select aria-label="Text replacement background" value={settings.background} onChange={e=>onChange({background:e.target.value as ReplacementBackground})}>
   <option value="repair">Repair smooth background</option>{ai&&<option value="ai">AI fill (textures, photos)</option>}<option value="sampled">Sampled color</option><option value="solid">Solid color</option><option value="transparent">Clear to transparent</option>
  </select></label>
  <label title="Leave blank for the automatic 0.8.6 cleanup margin, or set a custom pixel margin">Cleanup padding<input aria-label="Text cleanup padding" type="number" min="0" max="20" step="1" placeholder="Auto" value={settings.padding<0?'':settings.padding} onChange={e=>onChange({padding:e.target.value===''?-1:Math.max(0,Math.min(20,Number(e.target.value)||0))})}/></label>
  {settings.background==='solid'&&<input type="color" aria-label="Replacement background color" value={settings.color} onChange={e=>onChange({color:e.target.value})}/>}
  <button disabled={scanning} onClick={onRescan}>Rescan</button>
 </div>;
}
