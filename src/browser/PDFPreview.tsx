import {useEffect,useRef,useState} from 'react';
import {pagePreview} from './engine';
export default function PDFPreview({source,index,scale,className,alt='',lazy=false}:{source:string;index:number;scale:number;className?:string;alt?:string;lazy?:boolean}){
 const [preview,setPreview]=useState<{key:string;url:string}|null>(null),[error,setError]=useState(''),[visible,setVisible]=useState(!lazy);
 const key=`${source}/${index}`,src=preview?.key===key?preview.url:'';
 const placeholder=useRef<HTMLSpanElement>(null);
 useEffect(()=>{if(!lazy||visible)return;const node=placeholder.current;if(!node)return;if(typeof IntersectionObserver==='undefined'){setVisible(true);return;}const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){setVisible(true);observer.disconnect();}},{rootMargin:'160px'});observer.observe(node);return()=>observer.disconnect();},[lazy,visible]);
 useEffect(()=>{if(!visible)return;let active=true;setError('');const timer=setTimeout(()=>{pagePreview(source,index,scale).then(url=>{if(active)setPreview({key,url});}).catch(e=>{if(active)setError(e.message);});},lazy?0:120);return()=>{active=false;clearTimeout(timer);};},[source,index,scale,visible,lazy,key]);
 return src?<img src={src} className={className} alt={alt} draggable={false}/>:error?<span className="preview-error" title={error}>Preview unavailable</span>:<span ref={placeholder} aria-hidden="true" style={{display:'block',position:'absolute',inset:0}}/>;
}
