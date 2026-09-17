export type Box={left:number;top:number;width:number;height:number};
export type LayoutAction='left'|'center'|'right'|'top'|'middle'|'bottom'|'distribute-x'|'distribute-y'|'row'|'column';
export const framePresets=[{name:'Phone',width:390,height:844},{name:'Tablet',width:834,height:1194},{name:'Desktop',width:1440,height:1024},{name:'Presentation',width:1920,height:1080},{name:'Social square',width:1080,height:1080}];
export const layoutLabels:Record<LayoutAction,string>={left:'Align left',center:'Align horizontal centers',right:'Align right',top:'Align top',middle:'Align vertical centers',bottom:'Align bottom','distribute-x':'Distribute horizontal spacing','distribute-y':'Distribute vertical spacing',row:'Arrange in row',column:'Arrange in column'};
export function layoutOffsets(boxes:Box[],action:LayoutAction,page:Box,gap=16):{x:number;y:number}[]{
  const result=boxes.map(()=>({x:0,y:0}));if(!boxes.length)return result;
  const left=Math.min(...boxes.map(b=>b.left)),top=Math.min(...boxes.map(b=>b.top)),right=Math.max(...boxes.map(b=>b.left+b.width)),bottom=Math.max(...boxes.map(b=>b.top+b.height));
  const bounds=boxes.length===1?page:{left,top,width:right-left,height:bottom-top};
  if(action.startsWith('distribute')||action==='row'||action==='column'){
    const horizontal=action==='distribute-x'||action==='row',distribute=action.startsWith('distribute');if(boxes.length<(distribute?3:2))return result;
    const start=horizontal?'left':'top',size=horizontal?'width':'height';
    const sorted=boxes.map((b,i)=>({b,i})).sort((a,b)=>a.b[start]-b.b[start]||a.i-b.i);
    const first=sorted[0].b,last=sorted.at(-1)!.b;
    const spacing=distribute?(last[start]+last[size]-first[start]-boxes.reduce((s,b)=>s+b[size],0))/(boxes.length-1):Math.max(0,Math.min(1000,Number.isFinite(gap)?gap:16));
    let cursor=first[start];for(const {b,i} of sorted){result[i]=horizontal?{x:cursor-b.left,y:distribute?0:top-b.top}:{x:distribute?0:left-b.left,y:cursor-b.top};cursor+=b[size]+spacing;}return result;
  }
  boxes.forEach((b,i)=>{if(action==='left')result[i].x=bounds.left-b.left;if(action==='center')result[i].x=bounds.left+(bounds.width-b.width)/2-b.left;if(action==='right')result[i].x=bounds.left+bounds.width-b.width-b.left;if(action==='top')result[i].y=bounds.top-b.top;if(action==='middle')result[i].y=bounds.top+(bounds.height-b.height)/2-b.top;if(action==='bottom')result[i].y=bounds.top+bounds.height-b.height-b.top;});return result;
}
