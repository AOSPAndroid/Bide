import { useEffect,useState } from 'react';
import { pagePreview } from './engine';
export default function PDFPreview({source,index,scale,className,alt=''}:{source:string;index:number;scale:number;className?:string;alt?:string}){
 const [src,setSrc]=useState(''),[error,setError]=useState('');
 useEffect(()=>{let active=true;setSrc('');setError('');pagePreview(source,index,scale).then(url=>{if(active)setSrc(url);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[source,index,scale]);
 return src?<img src={src} className={className} alt={alt} draggable={false}/>:error?<span className="preview-error" title={error}>Preview unavailable</span>:null;
}
