import {useEffect, useLayoutEffect, useRef, useState} from 'react';

export default function PageMenu({position,count,index,close,run}:{position:{x:number;y:number};count:number;index:number;close:()=>void;run:(action:string)=>void}) {
  const ref=useRef<HTMLDivElement>(null);
  const [point,setPoint]=useState(position);
  useLayoutEffect(()=>{const r=ref.current!.getBoundingClientRect();setPoint({x:Math.max(8,Math.min(position.x,innerWidth-r.width-8)),y:Math.max(8,Math.min(position.y,innerHeight-r.height-8))});},[position]);
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null;
    ref.current?.querySelector('button')?.focus();
    const outside=(e:PointerEvent)=>{if(!ref.current?.contains(e.target as Node))close();};
    const key=(e:KeyboardEvent)=>{
      if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}
      if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){
        e.preventDefault();e.stopPropagation();const items=[...ref.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
        const i=items.indexOf(document.activeElement as HTMLButtonElement);
        items[e.key==='Home'?0:e.key==='End'?items.length-1:(i+(e.key==='ArrowDown'?1:-1)+items.length)%items.length]?.focus();
      }
      if(e.key==='Tab')close();
    };
    document.addEventListener('pointerdown',outside);document.addEventListener('keydown',key,true);
    window.addEventListener('resize',close);
    return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',key,true);window.removeEventListener('resize',close);previous?.focus();};
  },[]);
  return <div ref={ref} className="page-context-menu" role="menu" aria-label={`Page ${index+1} actions`} style={{left:point.x,top:point.y}}>
    <strong>Page {index+1}</strong>
    {([['duplicate','Duplicate page'],['right','Rotate clockwise'],['left','Rotate counterclockwise'],['first','Move to beginning'],['last','Move to end'],['delete','Remove page']] as const).map(([action,label])=><button key={action} role="menuitem" disabled={action==='delete'&&count===1||action==='first'&&index===0||action==='last'&&index===count-1} onClick={()=>run(action)}>{label}</button>)}
  </div>;
}
