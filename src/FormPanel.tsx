import {useEffect,useState} from 'react';
import {fieldLabels,isChecked,type FormField,type FormFieldType,type PdfFormField} from './forms';

// A text value is committed when the field loses focus or Enter is pressed,
// not on every key (each change of a PDF field writes a new PDF).
function TextValue({field,onCommit,label}:{field:FormField;onCommit:(v:string)=>void;label:string}){
 const [draft,setDraft]=useState(field.value);useEffect(()=>setDraft(field.value),[field.value]);
 const commit=()=>{if(draft!==field.value)onCommit(draft);};
 return field.multiline?<textarea aria-label={label} value={draft} disabled={field.readOnly} onChange={e=>setDraft(e.target.value)} onBlur={commit}/>
  :<input aria-label={label} value={draft} disabled={field.readOnly} onChange={e=>setDraft(e.target.value)} onBlur={commit} onKeyDown={e=>{if(e.key==='Enter')commit();}}/>;
}

// Choices show at once; the saved value catches up when the PDF is rewritten.
function Value({field,onCommit}:{field:FormField;onCommit:(v:string)=>void}){
 const label=`Form field ${field.name}${field.type==='radio'?` · ${field.option}`:''}`,[shown,setShown]=useState(field.value);
 useEffect(()=>setShown(field.value),[field.value]);
 const pick=(v:string)=>{setShown(v);onCommit(v);};
 if(field.type==='text')return <TextValue field={field} onCommit={onCommit} label={label}/>;
 if(field.type==='dropdown')return <select aria-label={label} value={shown} disabled={field.readOnly} onChange={e=>pick(e.target.value)}><option value=""/>{field.options?.map(o=><option key={o}>{o}</option>)}</select>;
 return <input type="checkbox" aria-label={label} checked={isChecked(shown)} disabled={field.readOnly} onChange={e=>pick(e.target.checked?'Yes':'Off')}/>;
}

// Fill the page's PDF form fields and the fields added in bide; add,
// rename, edit options of and delete bide's own fields.
export default function FormPanel({pdfFields,fields,fillPdf,update,add,remove}:{pdfFields:PdfFormField[];fields:FormField[];fillPdf:(f:PdfFormField,value:string)=>void;update:(id:string,patch:Partial<FormField>)=>void;add:(type:FormFieldType)=>void;remove:(id:string)=>void}){
 const count=pdfFields.length+fields.length,[open,setOpen]=useState(count>0);
 useEffect(()=>{if(count)setOpen(true);},[count>0]);
 return <details className="property-section form-panel" open={open} onToggle={e=>setOpen((e.target as HTMLDetailsElement).open)}><summary className="section-label">FORM FIELDS{count?` (${count})`:''}</summary>
  {pdfFields.map(f=><div key={f.id} className="form-field-row"><span title={f.name}>{f.name}{f.type==='radio'?` · ${f.option}`:''}</span><Value field={f} onCommit={v=>fillPdf(f,v)}/></div>)}
  {fields.map(f=><div key={f.id} className="form-field-row own">
   <input className="form-field-name" aria-label={`Name of ${f.name}`} defaultValue={f.name} onBlur={e=>{const name=e.target.value.trim();if(name&&name!==f.name)update(f.id,{name});}}/>
   <Value field={f} onCommit={value=>update(f.id,{value})}/>
   <button aria-label={`Delete ${f.name}`} title="Delete field" onClick={()=>remove(f.id)}>×</button>
   {f.type==='dropdown'&&<input className="form-field-options" aria-label={`Options of ${f.name}`} defaultValue={f.options?.join(', ')} title="Options, separated by commas" onBlur={e=>update(f.id,{options:e.target.value.split(',').map(s=>s.trim()).filter(Boolean)})}/>}
   {f.type==='radio'&&<input className="form-field-options" aria-label={`Option of ${f.name}`} defaultValue={f.option} title="This button's option; buttons with the same name form one choice" onBlur={e=>update(f.id,{option:e.target.value.trim()||f.option})}/>}
  </div>)}
  <div className="form-add" role="group" aria-label="Add form field">{(Object.keys(fieldLabels) as FormFieldType[]).map(t=><button key={t} onClick={()=>add(t)}>+ {fieldLabels[t]}</button>)}</div>
  <p className="fine-print">Drag a field's outline on the page to move it, its corner to resize. PDF export flattens fields unless "Keep form fields fillable" is on.</p>
 </details>;
}

// Field outlines over the page. Bide's own fields can be dragged (the box) and
// resized (its corner) when `editable`; PDF fields only show where they are.
export function FormOverlay({pdfFields,fields,zoom,editable,move}:{pdfFields:PdfFormField[];fields:FormField[];zoom:number;editable:boolean;move:(id:string,box:{left:number;top:number;width:number;height:number})=>void}){
 const [drag,setDrag]=useState<{id:string;mode:'move'|'size';x:number;y:number;box:FormField}|null>(null),[live,setLive]=useState<{id:string;left:number;top:number;width:number;height:number}|null>(null);
 const start=(e:React.PointerEvent,f:FormField,mode:'move'|'size')=>{if(!editable)return;e.stopPropagation();e.preventDefault();(e.currentTarget as Element).setPointerCapture(e.pointerId);setDrag({id:f.id,mode,x:e.clientX,y:e.clientY,box:f});};
 const over=(e:React.PointerEvent)=>{if(!drag)return;const dx=(e.clientX-drag.x)/zoom,dy=(e.clientY-drag.y)/zoom,b=drag.box;
  setLive(drag.mode==='move'?{id:b.id,left:Math.round(b.left+dx),top:Math.round(b.top+dy),width:b.width,height:b.height}:{id:b.id,left:b.left,top:b.top,width:Math.max(8,Math.round(b.width+dx)),height:Math.max(8,Math.round(b.height+dy))});};
 const end=()=>{if(drag&&live)move(drag.id,live);setDrag(null);setLive(null);};
 const box=(f:FormField)=>{const b=live?.id===f.id?live:f;return {left:b.left*zoom,top:b.top*zoom,width:b.width*zoom,height:b.height*zoom};};
 return <div className="form-overlay" aria-label="Form fields on the page" onPointerMove={over} onPointerUp={end} onPointerCancel={end}>
  {pdfFields.map(f=><div key={f.id} className="form-box pdf" style={box(f)} title={`${f.name} (PDF field)`}/>)}
  {fields.map(f=><div key={f.id} className={`form-box own${editable?' editable':''}`} style={box(f)} title={f.name} aria-label={`Form field box ${f.name}`} onPointerDown={e=>start(e,f,'move')}>
   <span className="form-box-label">{f.type==='checkbox'||f.type==='radio'?'':f.value||f.name}</span>
   {editable&&<i className="form-box-size" aria-label={`Resize ${f.name}`} onPointerDown={e=>start(e,f,'size')}/>}
  </div>)}
 </div>;
}
