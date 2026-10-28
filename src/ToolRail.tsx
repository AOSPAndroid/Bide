// The tool rail. On phones, upright or on their side, the tools do not fit, so
// each group shows one button, for the tool it used last: a tap selects that
// tool; a tap on the selected tool, or a long press, opens the group's flyout,
// and the tool picked there becomes the group's button (styles in
// mobile-chrome.css). Desktop and tablets keep every tool in view.
import {useEffect,useId,useLayoutEffect,useRef,useState,type KeyboardEvent,type MouseEvent} from 'react';
import {Command} from 'lucide-react';
import {TOOLS,type Tool} from './editor-types';
import {LONG_MS} from './touch-gestures';
import {useMedia} from './touch-ui';

const SHORT={zoom:'Zoom',select:'Move',wand:'Wand',object:'Object',pen:'Pen',crop:'Crop',marquee:'Marquee',lasso:'Lasso',hand:'Pan',text:'Text',rect:'Rectangle',ellipse:'Ellipse',line:'Line',brush:'Brush',highlight:'Highlight',eraser:'Eraser',gradient:'Gradient',bucket:'Bucket',mask:'Mask',clone:'Clone',heal:'Heal'} as Record<Tool,string>;
const info=(id:Tool)=>TOOLS.find(t=>t.id===id)!;
export const PHONE_RAIL='(max-width:600px),(pointer:coarse) and (max-height:500px)';

export default function ToolRail({tool,setTool,ai,color,setColor,shortcuts}:{tool:Tool;setTool:(t:Tool)=>void;ai?:boolean;color:string;setColor:(c:string)=>void;shortcuts:()=>void}){
 const groups:{name:string;ids:Tool[]}[]=[{name:'Select',ids:['select','marquee','lasso','wand',...(ai?['object' as const]:[]),'crop','hand','zoom']},{name:'Create',ids:['text','pen','rect','ellipse','line']},{name:'Draw',ids:['brush','highlight','eraser','gradient','bucket','mask']},{name:'Retouch',ids:['clone','heal']}];
 const phone=useMedia(PHONE_RAIL),[last,setLast]=useState<Record<string,Tool>>({}),[open,setOpen]=useState<string|null>(null);
 const base=useId(),buttons=useRef<Record<string,HTMLButtonElement|null>>({}),flyout=useRef<HTMLDivElement>(null),press=useRef({timer:0,fired:false,until:0});
 const lifted=()=>performance.now()<press.current.until;
 // A group shows the current tool however it was chosen (shortcut, palette, Layers).
 useEffect(()=>{const g=groups.find(g=>g.ids.includes(tool));if(g)setLast(l=>l[g.name]===tool?l:{...l,[g.name]:tool});},[tool]);
 // A new tool or a turned phone closes the flyout (it is placed beside its button once).
 useEffect(()=>setOpen(null),[tool,phone]);
 useEffect(()=>{if(!open)return;const shut=()=>setOpen(null);addEventListener('resize',shut);return()=>removeEventListener('resize',shut);},[open]);
 const shownOf=(g:{name:string;ids:Tool[]})=>g.ids.includes(tool)?tool:g.ids.includes(last[g.name])?last[g.name]:g.ids[0];
 // The flyout opens beside its button, inside the screen, with focus on the group's tool.
 useLayoutEffect(()=>{
  const f=flyout.current,b=open?buttons.current[open]:null,g=groups.find(g=>g.name===open);if(!f||!b||!g)return;
  const r=b.getBoundingClientRect();f.style.left=`${Math.max(4,Math.min(r.right+6,innerWidth-f.offsetWidth-4))}px`;f.style.top=`${Math.max(4,Math.min(r.top,innerHeight-f.offsetHeight-4))}px`;
  f.querySelectorAll('button')[g.ids.indexOf(shownOf(g))]?.focus();
 },[open]);
 const close=(name:string)=>{const back=flyout.current?.contains(document.activeElement);setOpen(null);if(back)buttons.current[name]?.focus();};
 const button=(id:Tool)=>{const t=info(id);return <button key={id} title={`${t.label} (${t.key})`} aria-label={t.label} aria-pressed={tool===id} className={tool===id?'active':''} onClick={()=>setTool(id)}><t.icon size={18}/><span>{SHORT[id]}</span><kbd>{t.key}</kbd></button>;};
 const group=(g:{name:string;ids:Tool[]})=>{
  const shown=shownOf(g),t=info(shown),on=open===g.name,fid=`${base}-${g.name}`;
  const release=()=>clearTimeout(press.current.timer);
  // A tap on the selected tool toggles the flyout. The click that ends a long press does
  // nothing (the browser sends it to the scrim now under the finger).
  const tap=(e:MouseEvent)=>{if(e.detail&&lifted())return;if(tool===shown)setOpen(on?null:g.name);else setTool(shown);};
  const keys=(e:KeyboardEvent)=>{if(e.key==='ArrowRight'||e.key==='ArrowDown'){e.preventDefault();e.stopPropagation();setOpen(g.name);}};
  // Arrows move through the flyout; Escape or ArrowLeft go back to the rail.
  const move=(e:KeyboardEvent<HTMLDivElement>)=>{
   const items=[...e.currentTarget.querySelectorAll('button')],i=items.indexOf(document.activeElement as HTMLButtonElement);
   const to=({ArrowDown:i+1,ArrowUp:i-1,Home:0,End:items.length-1} as Record<string,number>)[e.key];
   if(e.key==='Escape'||e.key==='ArrowLeft')close(g.name);else if(to===undefined)return;else items[(to+items.length)%items.length].focus();
   e.preventDefault();e.stopPropagation();
  };
  return <div className="tool-group" key={g.name}><h3>{g.name}</h3><div>
   <button ref={b=>{buttons.current[g.name]=b;}} title={`${g.name}: ${g.ids.map(i=>info(i).label).join(', ')}`} aria-label={t.label} aria-pressed={tool===shown} aria-expanded={on} aria-controls={on?fid:undefined} className={tool===shown?'active':''}
    onClick={tap} onKeyDown={keys} onContextMenu={e=>e.preventDefault()} onPointerCancel={release} onPointerLeave={release}
    onPointerUp={()=>{release();if(press.current.fired)press.current.until=performance.now()+500;}}
    onPointerDown={()=>{release();press.current={fired:false,until:0,timer:window.setTimeout(()=>{press.current.fired=true;setOpen(g.name);},LONG_MS)};}}>
    <t.icon size={18}/><span>{SHORT[shown]}</span><kbd>{t.key}</kbd>
   </button>
   {on&&<><div className="tool-flyout-scrim" aria-hidden="true" onClick={()=>{if(!lifted())setOpen(null);}}/>
    <div ref={flyout} id={fid} className="tool-flyout" role="group" aria-label={`${g.name} tools`} onKeyDown={move} onBlur={e=>{const to=e.relatedTarget as Node|null;if(to&&!e.currentTarget.contains(to)&&to!==buttons.current[g.name])setOpen(null);}}>
     {g.ids.map(i=>{const t=info(i);return <button key={i} title={`${t.label} (${t.key})`} aria-label={t.label} aria-pressed={tool===i} className={tool===i?'active':''} onClick={()=>{close(g.name);setTool(i);}}><t.icon size={18}/><span>{t.label}</span><kbd>{t.key}</kbd></button>;})}
    </div></>}
  </div></div>;
 };
 return <aside className={phone?'tool-rail grouped':'tool-rail'} aria-label="Drawing tools">
  {groups.map(g=>phone?group(g):<div className="tool-group" key={g.name}><h3>{g.name}</h3><div>{g.ids.map(button)}</div></div>)}
  <div className="rail-bottom"><label title="Default drawing color"><input aria-label="Drawing color" type="color" value={color} onChange={e=>setColor(e.target.value)}/><span>Color</span></label><button title="Keyboard shortcuts" aria-label="Keyboard shortcuts" onClick={shortcuts}><Command size={17}/><span>Shortcuts</span></button></div></aside>;
}
