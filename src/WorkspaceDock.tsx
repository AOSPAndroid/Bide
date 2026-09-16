import {useRef, useState} from 'react';
import {ChevronUp, FileText, Image, Network} from 'lucide-react';

export type Workspace = 'photo' | 'pdf' | 'diagrams';
export const workspaces = [
  {id:'photo' as const, label:'Photo editor', detail:'Photopea / Photoshop tools', icon:Image, short:'PHOTO'},
  {id:'pdf' as const, label:'PDF MasterTool', detail:'Edit, organize & convert', icon:FileText, short:'PDF'},
  {id:'diagrams' as const, label:'Drawio', detail:'Shapes, flows & diagrams', icon:Network, short:'DRAW'},
];

export default function WorkspaceDock({active, onSelect}: {active:Workspace; onSelect:(view:Workspace)=>void}) {
  const [hovered,setHovered]=useState(false);
  const [keyboard,setKeyboard]=useState(false);
  const [pinned,setPinned]=useState(false);
  const firstButton=useRef<HTMLButtonElement>(null);
  const open=hovered||keyboard||pinned;
  return <nav className="workspace-dock" aria-label="Main workspaces" data-open={open}
    onPointerEnter={e=>{if(e.pointerType==='mouse')setHovered(true);}}
    onPointerLeave={e=>{if(e.pointerType==='mouse')setHovered(false);}}
    onFocusCapture={e=>{if(e.target.matches(':focus-visible'))setKeyboard(true);}}
    onBlurCapture={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node|null))setKeyboard(false);}}
    onKeyDown={e=>{if(e.key==='Escape'){setPinned(false);setKeyboard(false);(document.activeElement as HTMLElement)?.blur();}}}>
    <button className="dock-handle" aria-label="Show workspaces" aria-expanded={open} aria-controls="workspace-dock-items"
      onClick={()=>setPinned(v=>!v)} onKeyDown={e=>{if(e.key==='ArrowUp'){e.preventDefault();setKeyboard(true);requestAnimationFrame(()=>firstButton.current?.focus());}}}>
      <span className="dock-grip"/><span>Workspaces</span><ChevronUp size={12}/>
    </button>
    <div id="workspace-dock-items" className="dock-items" aria-hidden={!open}>
      {workspaces.map((item,index)=><button key={item.id} ref={index===0?firstButton:undefined}
        className={`dock-item ${active===item.id?'active':''}`} aria-label={item.label} aria-current={active===item.id?'page':undefined}
        tabIndex={open?0:-1} onClick={e=>{onSelect(item.id);setPinned(false);if(e.detail>0)e.currentTarget.blur();}}>
        <span className="dock-tooltip"><strong>{item.label}</strong><span>{item.detail}</span></span>
        <span className="dock-icon"><item.icon size={26} strokeWidth={1.6}/><span>{item.short}</span></span>
        <span className="dock-indicator"/>
      </button>)}
    </div>
  </nav>;
}
