// Edit a line of a digital PDF in place: the text-showing operators that draw
// it get the new text in the line's own font (same resource, its own codes),
// so the page looks as if it had been generated with the new value. Whatever
// cannot be done exactly (a glyph the subset lacks, an unknown font type, a
// shared form, a layout this cannot reproduce) throws Unsafe, and the caller
// keeps the text-box path. The saved page is checked against the original
// before it is used: other text, drawings and images must be unchanged.
import * as mupdf from 'mupdf';
import {tokenize,parseOps,parseToUnicode,codesOf,placeGlyphs,showOp,splitEdit,alignsRight,type Val,type Kern,type Placed,type Box} from '../pdf-content';
import type {TextRegion} from '../text-regions';

export class Unsafe extends Error{}
type M=number[];
const mul=(a:M,b:M):M=>[a[0]*b[0]+a[1]*b[2],a[0]*b[1]+a[1]*b[3],a[2]*b[0]+a[3]*b[2],a[2]*b[1]+a[3]*b[3],a[4]*b[0]+a[5]*b[2]+b[4],a[4]*b[1]+a[5]*b[3]+b[5]];
const shift=(tx:number,ty:number,m:M)=>mul([1,0,0,1,tx,ty],m);
const latin1=(b:Uint8Array)=>{let s='';for(let i=0;i<b.length;i+=32768)s+=String.fromCharCode(...b.subarray(i,i+32768));return s;};
const read=(obj:mupdf.PDFObject)=>{const b=obj.readStream();try{return latin1(b.asUint8Array());}finally{b.destroy();}};
const space=(c:string)=>/\s/.test(c);
// MuPDF's text extraction spells out these ligatures.
const ligatures=['ff','fi','fl','ffi','ffl','st','st'];
// A dictionary entry, or null when the dictionary itself is missing.
const at=(o:mupdf.PDFObject,...path:string[])=>o.isNull()?o:o.get(...path);

type Glyphinfo={u:string;gid:number;w:number;adv:number;ink?:boolean};
type Font={num:number;name:string;kind:'type0'|'simple'|'type3';size:1|2;embedded:boolean;win:boolean;tu?:Map<number,string>;info:Map<number,Glyphinfo>;used:Map<number,number>;kerns:Map<string,Kern[]>};
type Src={obj:mupdf.PDFObject;text:string;num:number;uses:number;form:boolean};
type Show={src:number;start:number;end:number;op:string;args:Val[];font:Font|null;size:number;tc:number;tw:number;th:number;ts:number;tr:number;ctm:M;
 pen0:number;pen1:number;k:number;sx:number;flat:boolean;glyphs:Glyph[];trailing:Kern[]};
type Glyph={show:Show;code:number;u:string;x:number;y:number;adv:number;n:number;before:Kern[]};
type Ev={t:'BT'}|{t:'Tm';m:M}|{t:'Td';x:number;y:number}|{t:'show';s:Show};

const items=(s:{op:string;args:Val[]}):Val[]=>s.op==='TJ'?(s.args[0]?.t==='arr'?s.args[0].v:[]):s.args.length?[s.args[s.args.length-1]]:[];
const nums=(v:Val[],n:number)=>v.length>=n&&v.slice(-n).every(a=>a.t==='num')?v.slice(-n).map(a=>(a as {v:number}).v):undefined;

function loadFont(ref:mupdf.PDFObject,fonts:Map<number,Font|null>):Font|null{
 if(!ref.isIndirect())return null;const num=ref.asIndirect();if(fonts.has(num))return fonts.get(num)!;
 let font:Font|null=null;
 try{
  const f=ref.resolve(),subtype=f.get('Subtype').asName(),enc=f.get('Encoding');
  const kind=subtype==='Type0'?'type0':subtype==='Type3'?'type3':['Type1','MMType1','TrueType'].includes(subtype)?'simple':undefined;
  // Composite fonts: two-byte Identity-H codes only (codes are CIDs).
  if(kind&&(kind!=='type0'||enc.isName()&&enc.asName()==='Identity-H')){
   const desc=kind==='type0'?f.get('DescendantFonts',0,'FontDescriptor'):f.get('FontDescriptor');
   const base=enc.isDictionary()?enc.get('BaseEncoding'):enc,tu=f.get('ToUnicode');
   font={num,name:f.get('BaseFont').isName()?f.get('BaseFont').asName():'',kind,size:kind==='type0'?2:1,embedded:kind==='type3'||!desc.isNull()&&['FontFile','FontFile2','FontFile3'].some(k=>!desc.get(k).isNull()),
    win:base.isName()&&base.asName()==='WinAnsiEncoding',info:new Map(),used:new Map(),kerns:new Map()};
   if(tu.isStream()){const parsed=parseToUnicode(read(tu));if(parsed.size===font.size)font.tu=parsed.map;}
  }
 }catch{font=null;}
 fonts.set(num,font);return font;
}

// The page's text-showing operators, in drawing order, with the state they draw in.
function interpret(page:mupdf.PDFPage){
 const pageObj=page.getObject(),srcs:Src[]=[],events:Ev[]=[],fonts=new Map<number,Font|null>();
 type G={ctm:M;font:Font|null;size:number;tc:number;tw:number;th:number;tl:number;ts:number;tr:number};
 let g:G={ctm:page.getTransform() as M,font:null,size:0,tc:0,tw:0,th:1,tl:0,ts:0,tr:0},budget=0;
 const run=(streams:mupdf.PDFObject[],res:mupdf.PDFObject,depth:number,form:boolean)=>{
  const stack:G[]=[];
  for(const obj of streams){
   const num=obj.isIndirect()?obj.asIndirect():0,text=read(obj),src=srcs.push({obj,text,num,uses:1,form})-1;
   if((budget+=text.length)>64e6)throw new Unsafe('This page is too large to edit in place.');
   for(const o of parseOps(tokenize(text))){
    const a=o.args,n1=nums(a,1)?.[0];
    switch(o.op){
     case 'q':stack.push({...g});break;
     case 'Q':g=stack.pop()??g;break;
     case 'cm':{const m=nums(a,6);if(m)g.ctm=mul(m,g.ctm);break;}
     case 'BT':events.push({t:'BT'});break;
     case 'Tm':{const m=nums(a,6);if(m)events.push({t:'Tm',m});break;}
     case 'Td':case 'TD':{const m=nums(a,2);if(m){if(o.op==='TD')g.tl=-m[1];events.push({t:'Td',x:m[0],y:m[1]});}break;}
     case 'T*':events.push({t:'Td',x:0,y:-g.tl});break;
     case 'Tc':if(n1!==undefined)g.tc=n1;break;
     case 'Tw':if(n1!==undefined)g.tw=n1;break;
     case 'Tz':if(n1!==undefined)g.th=n1/100;break;
     case 'TL':if(n1!==undefined)g.tl=n1;break;
     case 'Ts':if(n1!==undefined)g.ts=n1;break;
     case 'Tr':if(n1!==undefined)g.tr=n1;break;
     case 'Tf':{const name=a[0];if(name?.t==='name'&&a[1]?.t==='num'){g.size=a[1].v;const ref=at(res,'Font',name.v);g.font=ref.isNull()?null:loadFont(ref,fonts);}break;}
     case 'gs':{const name=a[0];if(name?.t==='name'&&!at(res,'ExtGState',name.v,'Font').isNull())g.font=null;break;}
     case "'":case '"':case 'Tj':case 'TJ':{
      if(o.op==='"'){const m=nums(a.slice(0,2),2);if(m){g.tw=m[0];g.tc=m[1];}}
      if(o.op!=='Tj'&&o.op!=='TJ')events.push({t:'Td',x:0,y:-g.tl});
      const s:Show={src,start:o.start,end:o.end,op:o.op,args:a,font:g.font,size:g.size,tc:g.tc,tw:g.tw,th:g.th,ts:g.ts,tr:g.tr,ctm:g.ctm,pen0:NaN,pen1:NaN,k:NaN,sx:NaN,flat:false,glyphs:[],trailing:[]};
      if(s.font)for(const v of items(s))if(v.t==='str')for(const c of codesOf(v.v,s.font.size)??[])s.font.used.set(c,(s.font.used.get(c)??0)+1);
      events.push({t:'show',s});break;}
     case 'Do':{
      const name=a[0];if(name?.t!=='name'||depth>=8)break;const x=at(res,'XObject',name.v);
      if(!x.isStream()||x.get('Subtype').asName()!=='Form')break;
      const saved={...g},m=x.get('Matrix'),own=x.get('Resources');
      if(m.isArray()&&m.length===6)g.ctm=mul([0,1,2,3,4,5].map(i=>m.get(i).asNumber()),g.ctm);
      run([x],own.isNull()?res:own,depth+1,true);g=saved;break;}
    }
   }
  }
 };
 const contents=pageObj.get('Contents'),list:mupdf.PDFObject[]=[];
 if(contents.isArray())contents.forEach(c=>{if(c.isStream())list.push(c);});else if(contents.isStream())list.push(contents);
 run(list,pageObj.getInheritable('Resources'),0,false);
 // A form drawn twice on this page (or a stream listed twice) cannot change for one of them.
 for(const s of srcs)s.uses=srcs.filter(o=>o.num===s.num).length;
 return {srcs,events,fonts};
}

// Each code as MuPDF draws it with this font: text, glyph, width (thousandths
// of the size) and, with `ink`, whether the glyph paints anything.
function probe(pdoc:mupdf.PDFDocument,f:Font,codes:number[],ink:boolean){
 const todo=[...new Set(codes)].filter(c=>!f.info.has(c)||ink&&f.info.get(c)!.ink===undefined);if(!todo.length)return;
 const hex=(c:number)=>c.toString(16).padStart(f.size*2,'0'),seen:{gid:number;u:string;e:number;adv:number;ink?:boolean}[]=[];
 const ref=pdoc.newIndirect(f.num),obj=pdoc.addPage([0,0,10,10],0,{Font:{P:ref}},'BT /P 1000 Tf '+todo.map(c=>`1 0 0 1 0 0 Tm <${hex(c)}${hex(c)}> Tj`).join(' ')+' ET');
 pdoc.insertPage(-1,obj);const page=pdoc.loadPage(pdoc.countPages()-1);
 const device=new mupdf.Device({fillText(text,ctm){text.walk({showGlyph(font,trm,gid,u){
  // Further characters of a ligature come as glyph -1.
  if(gid<0){if(seen.length)seen[seen.length-1].u+=String.fromCodePoint(u);return;}
  const item:{gid:number;u:string;e:number;adv:number;ink?:boolean}={gid,u:u>0?String.fromCodePoint(u):'',e:trm[4],adv:gid>0&&f.embedded?font.advanceGlyph(gid,0)*1000:NaN};
  if(ink&&seen.length%2===0&&gid>0){const t=new mupdf.Text();try{t.showGlyph(font,trm,gid,u);const b=t.getBounds(null as never,ctm);item.ink=b[2]-b[0]>.5&&b[3]-b[1]>.5;}finally{t.destroy();}}
  seen.push(item);}});}});
 try{page.runPageContents(device,mupdf.Matrix.identity);device.close();}
 finally{device.destroy();page.destroy();pdoc.deletePage(pdoc.countPages()-1);obj.destroy();}
 if(seen.length!==todo.length*2)throw new Unsafe('This PDF font could not be read.');
 todo.forEach((c,i)=>{const a=seen[2*i],b=seen[2*i+1];f.info.set(c,{u:a.u,gid:a.gid,w:Math.round((b.e-a.e)*1000)/1000,adv:a.adv,ink:a.ink??f.info.get(c)?.ink});});
}

// Glyph positions on the page (MuPDF page space), from the probed widths.
function place(events:Ev[]){
 const glyphs:Glyph[]=[];let tm:M|null=null,tlm:M|null=null;
 for(const e of events){
  if(e.t==='BT'){tm=tlm=[1,0,0,1,0,0];continue;}
  if(e.t==='Tm'){tm=tlm=e.m;continue;}
  if(e.t==='Td'){if(tlm)tm=tlm=shift(e.x,e.y,tlm);continue;}
  const s=e.s,f=s.font;
  // Text in a font that cannot be measured leaves the pen unknown until the next line move.
  if(!tm||!f){tm=null;continue;}
  let m=mul(tm,s.ctm),pending:Kern[]=[],ok=true;
  s.sx=m[0];s.flat=m[0]>0&&Math.abs(m[1])<=1e-6*m[0]&&Math.abs(m[2])<=1e-6*Math.abs(m[3]);
  s.k=m[0]*s.size*s.th/1000;s.pen0=m[4]+s.ts*m[2];
  for(const v of items(s)){
   if(v.t==='num'){pending.push({raw:v.raw,v:v.v});tm=shift(-(v.v/1000)*s.size*s.th,0,tm);continue;}
   if(v.t!=='str')continue;const codes=codesOf(v.v,f.size);if(!codes){ok=false;break;}
   for(const code of codes){
    const info=f.info.get(code);if(!info||!Number.isFinite(info.w)){ok=false;break;}
    m=mul(tm,s.ctm);const tx=((info.w/1000)*s.size+s.tc+(f.size===1&&code===32?s.tw:0))*s.th;
    const g:Glyph={show:s,code,u:info.u.replace(/[\ufb00-\ufb06]/g,c=>ligatures[c.charCodeAt(0)-0xfb00]),x:m[4]+s.ts*m[2],y:m[5]+s.ts*m[3],adv:tx*m[0],n:glyphs.length,before:pending};
    glyphs.push(g);s.glyphs.push(g);pending=[];tm=shift(tx,0,tm);
   }
   if(!ok)break;
  }
  if(!ok){s.glyphs.forEach(g=>g.x=NaN);s.glyphs=[];tm=null;continue;}
  s.trailing=pending;m=mul(tm,s.ctm);s.pen1=m[4]+s.ts*m[2];
 }
 return glyphs;
}

// Kerning the producer used between two codes of a font: the numbers of its TJ
// arrays, or the small jumps between the pieces some split a line into (Chromium).
function learnKerning(glyphs:Glyph[]){
 for(let i=1;i<glyphs.length;i++){
  const a=glyphs[i-1],b=glyphs[i],f=b.show.font;if(!f||a.show.font!==f||!Number.isFinite(a.x+b.x))continue;const key=a.code+','+b.code;
  if(a.show===b.show){if(Math.abs(b.before.reduce((n,k)=>n+k.v,0))<=300&&(!f.kerns.has(key)||b.before.length&&!f.kerns.get(key)!.length))f.kerns.set(key,b.before);continue;}
  const gap=b.x-(a.x+a.adv),k=b.show.k;
  if(Math.abs(b.y-a.y)<1e-3&&k>0&&!f.kerns.get(key)?.length){const v=Math.round(-gap/k*1e4)/1e4;if(Math.abs(v)<=300)f.kerns.set(key,Math.abs(gap)>1e-4?[{raw:String(v),v}]:[]);}
 }
}

type Match=(Glyph|null)[];
// The glyphs drawing a detected line (null for spaces MuPDF added in gaps).
// `index`: glyphs by first character and whole page unit of their x.
function matchRegion(r:TextRegion,index:Map<string,Glyph[]>):Match|undefined{
 const chars=Array.from(r.text),quads=r.quads??[];if(quads.length!==chars.length)return;
 const out:Match=[];let last=-1,lig:{g:Glyph;rest:string[]}|undefined;
 for(let i=0;i<chars.length;i++){
  const ch=chars[i],q=quads[i];
  if(lig?.rest[0]===ch){out.push(lig.g);lig.rest.shift();if(!lig.rest.length)lig=undefined;continue;}lig=undefined;
  const top=Math.min(q[1],q[3],q[5],q[7])-.25,bottom=Math.max(q[1],q[3],q[5],q[7])+.25;
  const near=[-1,0,1].flatMap(d=>index.get(ch+'@'+(Math.round(q[4])+d))??[]);
  const g=near.filter(g=>g.n>last&&Math.abs(g.x-q[4])<.15&&g.y>=top&&g.y<=bottom).sort((a,b)=>a.n-b.n)[0];
  if(g){out.push(g);last=g.n;const rest=Array.from(g.u).slice(1);if(rest.length)lig={g,rest};continue;}
  if(space(ch)){out.push(null);continue;}
  return;
 }
 // Glyphs of one operator in a row: one MuPDF left out (a doubled glyph) would stay on the page.
 const real=out.filter((g,i)=>g&&g!==out[i-1]) as Glyph[];
 for(let i=1;i<real.length;i++)if(real[i].show===real[i-1].show&&real[i].n!==real[i-1].n+1)return;
 return out;
}
// Runs of glyphs set together: a gap MuPDF filled with a space, or a jump
// between operators, starts another (a table's next column on the same line).
function segments(m:Match,size:number){
 const seg:number[]=[];let id=0,prev:Glyph|null=null;
 m.forEach((g,i)=>{if(!g){seg.push(-1);prev=null;if(i)id++;return;}
  if(prev&&g!==prev&&g.show!==prev.show&&Math.abs(g.x-(prev.x+prev.adv))>.25*size)id++;seg.push(id);prev=g;});
 return seg;
}
const boxOf=(gs:{x:number;adv:number}[],r:TextRegion):Box=>{const ys=(r.quads??[]).flatMap(q=>[q[1],q[3],q[5],q[7]]);return {left:Math.min(...gs.map(g=>g.x)),right:Math.max(...gs.map(g=>g.x+g.adv)),top:Math.min(...ys),bottom:Math.max(...ys)};};

// A changed content stream must not also be used elsewhere: another page's
// contents/resources, or an annotation appearance on any page. Walk the full
// reference graph (including soft masks and named appearance states), and
// refuse if a depth/budget limit prevents proving the stream is unshared.
function usedElsewhere(doc:mupdf.PDFDocument,index:number,nums:Set<number>){
 let budget=20000,hit=false;const seen=new Set<number>();
 const visit=(o:mupdf.PDFObject,depth:number)=>{
  if(hit||o.isNull())return;
  if(--budget<0||depth>64){hit=true;return;}
  if(o.isIndirect()){const n=o.asIndirect();if(nums.has(n)){hit=true;return;}if(seen.has(n))return;seen.add(n);}
  if(o.isArray()||o.isDictionary())o.forEach(v=>visit(v,depth+1));
 };
 for(let i=0;i<doc.countPages()&&!hit;i++){
  const p=doc.findPage(i);
  if(i!==index){visit(p.get('Contents'),0);visit(p.getInheritable('Resources'),0);}
  p.get('Annots').forEach(a=>visit(a.get('AP'),0));
 }
 return hit;
}

export type Prediction={glyphs:{u:string;x:number;y:number}[];box:Box};
// Rewrites `region` (a line from detectPdfText) of page `index` to `text`.
export function rewriteText(doc:mupdf.PDFDocument,pdoc:mupdf.PDFDocument,index:number,region:TextRegion,regions:TextRegion[],text:string):Prediction{
 const page=doc.loadPage(index) as mupdf.PDFPage;
 try{
  const {srcs,events,fonts}=interpret(page);
  // A font MuPDF cannot measure only leaves its own text unknown (not editable).
  for(const f of fonts.values())if(f?.used.size)try{probe(pdoc,f,[...f.used.keys()],false);}catch{f.info.clear();}
  const glyphs=place(events);learnKerning(glyphs);
  const index_=new Map<string,Glyph[]>();for(const g of glyphs)if(Number.isFinite(g.x)&&g.show.tr!==3&&g.show.tr!==7){const k=(Array.from(g.u)[0]??'')+'@'+Math.round(g.x);index_.get(k)?.push(g)??index_.set(k,[g]);}
  const match=matchRegion(region,index_);if(!match)throw new Unsafe('This line could not be found in the page content.');
  const seg=segments(match,region.size),before=Array.from(region.text),after=Array.from(text);
  let {p,s}=splitEdit(before,after);
  // Never split a ligature glyph between kept and changed text.
  while(p>0&&p<before.length&&match[p]&&match[p]===match[p-1])p--;
  while(s>0&&s<before.length&&match[before.length-s]&&match[before.length-s]===match[before.length-s-1])s--;
  const midEnd=before.length-s,mid=match.slice(p,midEnd);
  if(mid.some(g=>!g))throw new Unsafe('The change spans separately placed parts of this line. Edit each part on its own.');
  const id=mid.length?seg[p]:p>0&&match[p-1]?seg[p-1]:s>0&&match[midEnd]?seg[midEnd]:-1;
  if(id<0||mid.some((_,i)=>seg[p+i]!==id))throw new Unsafe('The change spans separately placed parts of this line. Edit each part on its own.');
  const distinct=(from:number,to:number)=>{const out:Glyph[]=[];for(let i=from;i<to;i++){const g=match[i];if(g&&seg[i]===id&&g!==out[out.length-1])out.push(g);}return out;};
  const P=distinct(0,p),Mid=distinct(p,midEnd),X=distinct(midEnd,before.length),run=[...P,...Mid,...X];
  const ins=(Mid[0]??P[P.length-1]??X[0]).show,f=ins.font!;
  if(f.kind==='type3')throw new Unsafe('This PDF font (Type 3) cannot be rewritten.');
  // Codes for the new characters: the font must map and draw each one.
  const fresh=after.slice(p,after.length-s);
  const wanted=[...new Set(fresh)],choices=new Map<string,number>();
  if(wanted.length){
   const candidates=f.kind==='type0'?[...f.tu??[]].filter(([,u])=>wanted.includes(u)).map(([c])=>c):Array.from({length:256},(_,i)=>i);
   probe(pdoc,f,candidates,true);
   for(const ch of wanted){
    const undefinedWin=(c:number)=>f.win&&[0x7f,0x81,0x8d,0x8f,0x90,0x9d].includes(c)&&!f.used.has(c);
    const ok=candidates.filter(c=>{const g=f.info.get(c);return !!g&&g.u===ch&&g.gid>0&&g.w>0&&!undefinedWin(c)&&(space(ch)||g.ink===true)&&(!f.embedded||space(ch)||Math.abs(g.adv-g.w)<=Math.max(2,.05*g.w));});
    const cp=ch.codePointAt(0)!,best=ok.sort((a,b)=>(f.used.get(b)??0)-(f.used.get(a)??0)||+(b===cp)-+(a===cp)||a-b)[0];
    if(best===undefined)throw new Unsafe(f.kind==='type0'&&!f.tu?'This PDF font has no Unicode map.':`This PDF's font has no “${ch}”.`);
    choices.set(ch,best);
   }
  }
  const codes=fresh.map(ch=>choices.get(ch)!),width=(c:number)=>((f.info.get(c)!.w/1000)*ins.size+ins.tc+(f.size===1&&c===32?ins.tw:0))*ins.th*ins.sx;
  // New letter pairs need evidence from this font on this page. A subset often
  // omits its producer's kerning/shaping tables: an unseen AV or To pair must
  // not silently acquire zero kerning. Numbers/punctuation keep the PDF's own
  // advances, Tc/Tw and observed adjustments; absent producer layout tables
  // still prevent a universal claim of regenerated-document equivalence.
  // A monospaced font keeps every character on one pitch: when no pair in
  // this font on the page is adjusted, an unseen pair is not adjusted either.
  const widths=[...f.used.keys(),...codes].map(c=>f.info.get(c)?.w).filter((w):w is number=>!!w);
  const pitched=widths.length>1&&widths.every(w=>Math.abs(w-widths[0])<=1)&&[...f.kerns.values()].every(k=>!k.reduce((n,x)=>n+x.v,0));
  const kern=(a:number|undefined,b:number|undefined)=>{
   if(a===undefined||b===undefined)return;
   const known=f.kerns.get(a+','+b),left=f.info.get(a)?.u??'',right=f.info.get(b)?.u??'';
   if(known===undefined&&pitched)return [];
   if(known===undefined&&/^\p{L}+$/u.test(left)&&/^\p{L}+$/u.test(right))throw new Unsafe(`This PDF does not establish the original spacing for “${left}${right}”.`);
   return known;
  };
  const effect=(k?:Kern[])=>-(k?.reduce((n,x)=>n+x.v,0)??0)*ins.k;
  // The new codes from the end of the kept start, with the producer's kerning.
  const lastP=P[P.length-1],firstX=X[0],same=(g?:Glyph)=>g&&g.show.font===f?g.code:undefined;
  const lastM=Mid[Mid.length-1],a=lastP?lastP.x+lastP.adv:(Mid[0]??firstX).x,b=firstX?firstX.x:lastM?lastM.x+lastM.adv:a;
  let x=0,prev=same(lastP);const placed:Placed[]=codes.map(code=>{const k=kern(prev,code);x+=effect(k);const g={code,x,adv:width(code),before:k};x+=g.adv;prev=code;return g;});
  const tail=firstX&&same(firstX)!==undefined?kern(prev,firstX.code):undefined;x+=effect(tail);
  const delta=x-(b-a);
  if(!run.every(g=>g.show.flat&&Number.isFinite(g.show.pen1))||!ins.flat)throw new Unsafe('This line is not set horizontally.');
  // Keep the right edge of a right-aligned run (an amount in a column), else its start.
  const runBox=boxOf(run,region),others=()=>regions.filter(r=>r.id!==region.id).flatMap(r=>{const m=matchRegion(r,index_);
   if(!m?.some(Boolean))return [{left:r.left,right:r.left+r.width,top:r.top,bottom:r.top+r.height}];
   const sg=segments(m,r.size);return [...new Set(sg.filter(v=>v>=0))].map(k=>boxOf(m.filter((g,i)=>g&&sg[i]===k) as Glyph[],r));});
  const right=Math.abs(delta)>1e-4&&alignsRight({...runBox,text:run.map(g=>g.u).join(''),size:region.size},others());
  const startShift=right?-delta:0,endShift=right?0:delta,desired=new Map<Glyph,number>();
  for(const g of P)desired.set(g,g.x+startShift);for(const g of X)desired.set(g,g.x+endShift);
  placed.forEach(g=>g.x+=a+startShift);
  const layout=[...P.map(g=>({u:g.u,x:desired.get(g)!,adv:g.adv,y:g.y})),...placed.map(g=>({u:f.info.get(g.code)!.u,x:g.x,adv:g.adv,y:ins.glyphs[0].y})),...X.map(g=>({u:g.u,x:desired.get(g)!,adv:g.adv,y:g.y}))];
  const newL=layout.length?Math.min(...layout.map(g=>g.x)):a+startShift,newR=layout.length?Math.max(...layout.map(g=>g.x+g.adv)):newL;
  // The moving edge must not run into other text, nor leave text it touched
  // (the line goes on in another style, which would have to move too).
  if(Math.abs(delta)>1e-4){
   const line=glyphs.filter(g=>Number.isFinite(g.x)&&g.show.tr!==3&&g.show.tr!==7&&!run.includes(g)&&!space(g.u)&&Math.abs(g.y-run[0].y)<.5*region.size);
   const gap=right?runBox.left-Math.max(-Infinity,...line.filter(g=>g.x+g.adv<=runBox.left+.01).map(g=>g.x+g.adv)):Math.min(Infinity,...line.filter(g=>g.x>=runBox.right-.01).map(g=>g.x))-runBox.right;
   if(gap<.3*region.size)throw new Unsafe('This text runs on into the text next to it, which would have to move too.');
   if(right?newL<runBox.left-gap+.1:newR>runBox.right+gap-.1)throw new Unsafe('The new text would run into the text next to it.');
  }
  // Rewrite each operator that draws part of the run, or gets the new codes.
  const touched=[...new Set([...run.map(g=>g.show),ins])],edits=new Map<number,{start:number;end:number;text:string}[]>();
  for(const sh of touched){
   const src=srcs[sh.src];
   if(!sh.font||!sh.flat||!Number.isFinite(sh.pen1))throw new Unsafe('This line is not set horizontally.');
   const list:Placed[]=[];let changed=false,prevKept:Glyph|undefined;
   const insertHere=()=>{list.push(...placed);changed=true;prevKept=undefined;};
   sh.glyphs.forEach(g=>{
    if(sh===ins&&(Mid.length?g===Mid[0]:!lastP&&g===firstX))insertHere();
    if(Mid.includes(g)){changed=true;prevKept=undefined;return;}
    const want=desired.get(g)??g.x;if(Math.abs(want-g.x)>1e-5)changed=true;
    const follows=list.length===0?sh.glyphs[0]===g:prevKept!==undefined&&sh.glyphs[sh.glyphs.indexOf(g)-1]===prevKept;
    list.push({code:g.code,x:want,adv:g.adv,before:g===firstX&&placed.length+Mid.length?tail:follows?g.before:undefined});prevKept=g;
    if(sh===ins&&!Mid.length&&g===lastP)insertHere();
   });
   if(!changed)continue;
   if(src.uses!==1)throw new Unsafe('This text is in a form drawn more than once.');
   const first=items(sh).find(v=>v.t==='str') as {raw:string;hex:boolean}|undefined;
   const op=showOp(sh.op,placeGlyphs(sh.pen0,sh.pen1,sh.k,list,sh.trailing),{size:sh.font.size,hex:first?.hex??sh.font.size===2,upper:/[A-F]/.test(first?.raw??'')&&!/[a-f]/.test(first?.raw??''),
    aw:sh.args[0]?.t==='num'?sh.args[0].raw:undefined,ac:sh.args[1]?.t==='num'?sh.args[1].raw:undefined});
   edits.get(sh.src)?.push({start:sh.start,end:sh.end,text:op})??edits.set(sh.src,[{start:sh.start,end:sh.end,text:op}]);
  }
  if(!edits.size)throw new Unsafe('Nothing to change.');
  if(usedElsewhere(doc,index,new Set([...edits.keys()].map(i=>srcs[i].num).filter(Boolean))))throw new Unsafe('This text is drawn from content other pages share.');
  for(const [i,list] of edits){let t=srcs[i].text;for(const e of list.sort((a,b)=>b.start-a.start))t=t.slice(0,e.start)+e.text+t.slice(e.end);srcs[i].obj.writeStream(Uint8Array.from(t,c=>c.charCodeAt(0)));}
  // Where the new line's glyphs must be (its other parts stay), and the area that may change, for the check after saving.
  const rest=match.filter((g,i)=>g&&seg[i]!==id&&g!==match[i-1]) as Glyph[];
  return {glyphs:[...layout,...rest].filter(g=>!space(g.u)),box:{left:Math.min(newL,runBox.left),right:Math.max(newR,runBox.right),top:runBox.top,bottom:runBox.bottom}};
 }finally{page.destroy();}
}

type Char={c:string;q:number[]};
function pageChars(page:mupdf.Page){
 const out:Char[]=[],t=page.toStructuredText('preserve-whitespace');
 try{t.walk({onChar(c,_o,_f,_s,q){out.push({c,q:[...q]});}});}finally{t.destroy();}
 return out;
}
// The saved page against the original: the new glyphs where predicted, every
// other character where it was, and no pixel changed outside the edited line.
export function verifyRewrite(before:mupdf.Page,after:mupdf.Page,region:TextRegion,predicted:Prediction){
 const quads=region.quads??[],chars=Array.from(region.text),same=(a:number[],b:number[],tol:number)=>a.every((v,i)=>Math.abs(v-b[i])<=tol);
 const old=pageChars(before).filter(ch=>!space(ch.c)&&!chars.some((c,i)=>c===ch.c&&same(quads[i],ch.q,1e-3)));
 const fresh=pageChars(after).filter(ch=>!space(ch.c));
 for(const g of predicted.glyphs){
  const i=fresh.findIndex(ch=>ch.c===Array.from(g.u)[0]&&Math.abs(ch.q[4]-g.x)<.15&&g.y>=Math.min(ch.q[1],ch.q[5])-.25&&g.y<=Math.max(ch.q[1],ch.q[5])+.25);
  if(i<0)throw new Unsafe('The rewritten line did not check out.');fresh.splice(i,1);
 }
 const key=(a:Char,b:Char)=>a.c<b.c?-1:a.c>b.c?1:a.q[4]-b.q[4]||a.q[5]-b.q[5];old.sort(key);fresh.sort(key);
 if(old.length!==fresh.length||old.some((ch,i)=>ch.c!==fresh[i].c||!same(ch.q,fresh[i].q,.02)))throw new Unsafe('The rewrite would change other text on the page.');
 const [x0,y0,x1,y1]=before.getBounds(),scale=Math.min(1,Math.sqrt(4e6/Math.max(1,(x1-x0)*(y1-y0))));
 const pa=before.toPixmap(mupdf.Matrix.scale(scale,scale),mupdf.ColorSpace.DeviceRGB,false,true),pb=after.toPixmap(mupdf.Matrix.scale(scale,scale),mupdf.ColorSpace.DeviceRGB,false,true);
 try{
  if(pa.getWidth()!==pb.getWidth()||pa.getHeight()!==pb.getHeight())throw new Unsafe('The rewrite changed the page size.');
  const A=pa.getPixels(),B=pb.getPixels(),w=pa.getWidth(),h=pa.getHeight(),n=pa.getNumberOfComponents(),ox=pa.getX(),oy=pa.getY(),b=predicted.box,pad=2+.25*region.size;
  const l=(b.left-pad)*scale-ox,r=(b.right+pad)*scale-ox,t=(b.top-pad)*scale-oy,u=(b.bottom+pad)*scale-oy;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){if(x>=l&&x<=r&&y>=t&&y<=u)continue;const i=(y*w+x)*n;for(let k=0;k<n;k++)if(A[i+k]!==B[i+k])throw new Unsafe('The rewrite would change the page outside this line.');}
 }finally{pa.destroy();pb.destroy();}
}
