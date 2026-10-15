import {effectDefaults,effectLabels,hasEffects,type EffectName,type LayerStyle} from './layer-effects';

type Field={key:string;label:string;kind:'color'|'range'|'number'|'position';min?:number;max?:number;step?:number};
const shadow:Field[]=[{key:'color',label:'Color',kind:'color'},{key:'opacity',label:'Opacity %',kind:'range',min:0,max:100},{key:'angle',label:'Angle °',kind:'number',min:-180,max:360},{key:'distance',label:'Distance',kind:'number',min:0,max:200},{key:'size',label:'Size',kind:'number',min:0,max:150},{key:'spread',label:'Spread %',kind:'number',min:0,max:100}];
const glow:Field[]=[{key:'color',label:'Color',kind:'color'},{key:'opacity',label:'Opacity %',kind:'range',min:0,max:100},{key:'size',label:'Size',kind:'number',min:0,max:150},{key:'spread',label:'Spread %',kind:'number',min:0,max:100}];
const fields:Record<EffectName,Field[]>={
 dropShadow:shadow,innerShadow:shadow,outerGlow:glow,innerGlow:glow,
 stroke:[{key:'color',label:'Color',kind:'color'},{key:'size',label:'Size',kind:'number',min:1,max:100},{key:'position',label:'Position',kind:'position'},{key:'opacity',label:'Opacity %',kind:'range',min:0,max:100}],
 colorOverlay:[{key:'color',label:'Color',kind:'color'},{key:'opacity',label:'Opacity %',kind:'range',min:0,max:100}],
 gradientOverlay:[{key:'from',label:'From',kind:'color'},{key:'to',label:'To',kind:'color'},{key:'angle',label:'Angle °',kind:'number',min:-180,max:360},{key:'opacity',label:'Opacity %',kind:'range',min:0,max:100}],
};
const order:EffectName[]=['dropShadow','outerGlow','stroke','innerShadow','innerGlow','colorOverlay','gradientOverlay'];

// Layer style editor: each effect switches on with defaults and shows its settings.
export default function LayerStylePanel({style,disabled,onChange}:{style?:LayerStyle;disabled?:boolean;onChange:(style:LayerStyle|undefined,save:boolean)=>void}){
 const set=(name:EffectName,patch:Record<string,unknown>|null,save=true)=>{
  const next:LayerStyle={...style};
  if(patch===null)delete next[name];else (next as Record<string,unknown>)[name]={...effectDefaults[name],...style?.[name],...patch};
  onChange(Object.keys(next).length?next:undefined,save);
 };
 return <details className="property-section layer-style" open={hasEffects(style)||undefined}><summary className="section-label">LAYER STYLE{hasEffects(style)?' · on':''}</summary>
  {order.map(name=>{const e=style?.[name] as Record<string,unknown>|undefined,on=!!e?.enabled;return <div key={name} className="effect">
   <label className="effect-toggle"><input type="checkbox" aria-label={effectLabels[name]} disabled={disabled} checked={on} onChange={ev=>set(name,ev.target.checked?{enabled:true}:null)}/>{effectLabels[name]}</label>
   {on&&<div className="effect-fields">{fields[name].map(f=>{const v=e![f.key] as string|number,id=`${effectLabels[name]} · ${f.label.replace(/ [%°]$/,'').toLowerCase()}`;
    return <label key={f.key}><span>{f.label}</span>{f.kind==='color'?<input type="color" aria-label={id} value={String(v)} onChange={ev=>set(name,{[f.key]:ev.target.value})}/>
     :f.kind==='position'?<select aria-label={id} value={String(v)} onChange={ev=>set(name,{[f.key]:ev.target.value})}><option value="outside">Outside</option><option value="center">Center</option><option value="inside">Inside</option></select>
     :<input type={f.kind} aria-label={id} min={f.min} max={f.max} step={f.step??1} value={Number(v)} onChange={ev=>set(name,{[f.key]:Math.min(f.max??1e4,Math.max(f.min??0,Number(ev.target.value)||0))},f.kind!=='range')} onPointerUp={()=>f.kind==='range'&&set(name,{},true)}/>}</label>;})}
   </div>}
  </div>;})}
  {style&&<button className="secondary" disabled={disabled} onClick={()=>onChange(undefined,true)}>Clear layer style</button>}
 </details>;
}
