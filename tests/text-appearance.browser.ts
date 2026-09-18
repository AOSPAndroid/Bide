import {StaticCanvas} from 'fabric';
import {Textbox} from '../src/text-appearance';
import '../src/model';
const output=document.querySelector('pre')!;
try {
 const c=new StaticCanvas('test',{width:600,height:130,enableRetinaScaling:false});
 const text=new Textbox('Matching text',{left:30,top:30,fontFamily:'Arial',fontSize:38,width:450,objectCaching:false});
 c.add(text);c.renderAll();
 const edge=()=>{const d=c.getContext().getImageData(0,0,600,130).data;let partial=0,ink=0;for(let i=3;i<d.length;i+=4){if(d[i]>0&&d[i]<255)partial++;ink+=d[i];}return {partial,ink};};
 const crisp=edge();if(!text.toSVG().includes('<text'))throw Error('Crisp text must stay vector');
 text.set({textSoftness:.6});c.renderAll();const soft=edge();
 if(soft.partial<=crisp.partial*1.5)throw Error('Softness did not broaden the antialiased edges');
 if(Math.abs(soft.ink/crisp.ink-1)>.08)throw Error('Softness changed ink coverage too much');
 const svg=c.toSVG();if(!svg.includes('<image')||svg.includes('<text'))throw Error('Softened export must embed its appearance');
 const img=new Image();img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);await img.decode();document.body.appendChild(img);
 const snapshot=c.toObject();await c.loadFromJSON(snapshot);c.renderAll();const restored=c.getObjects()[0] as Textbox;
 if(!(restored instanceof Textbox)||restored.textSoftness!==.6)throw Error('Softness not restored');
 const after=edge();if(after.partial!==soft.partial)throw Error('Reload changed pixels');
 output.textContent=JSON.stringify({passed:true,crisp,soft,reloaded:after,softness:restored.textSoftness});
}catch(e){output.textContent=String(e);}
