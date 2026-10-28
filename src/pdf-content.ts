// PDF content streams as text: tokens with their byte offsets (so an operator
// can be replaced in place), string codes, ToUnicode maps, and the TJ arrays
// that put new codes where an edit wants them. Streams are handled as latin1
// strings: one char per byte, offsets are byte offsets.

export type Tok={t:'num';v:number;raw:string;start:number;end:number}|{t:'name';v:string;start:number;end:number}|{t:'str';v:string;hex:boolean;raw:string;start:number;end:number}
 |{t:'op';v:string;start:number;end:number}|{t:'['|']'|'<<'|'>>'|'{'|'}';start:number;end:number}|{t:'data';start:number;end:number};
export type Val={t:'num';v:number;raw:string}|{t:'name';v:string}|{t:'str';v:string;hex:boolean;raw:string}|{t:'arr';v:Val[]}|{t:'dict';v:Record<string,Val>}|{t:'kw';v:string};
export type Op={op:string;args:Val[];start:number;end:number};

const white=(c:number)=>c===32||c===10||c===13||c===9||c===12||c===0;
const delim=(c:number)=>c===40||c===41||c===60||c===62||c===91||c===93||c===123||c===125||c===47||c===37;
const regular=(c:number)=>!white(c)&&!delim(c);
const hexValue=(c:number)=>c>=48&&c<=57?c-48:c>=65&&c<=70?c-55:c>=97&&c<=102?c-87:-1;

export function tokenize(s:string):Tok[]{
 const out:Tok[]=[],n=s.length;let i=0;
 while(i<n){
  const c=s.charCodeAt(i);
  if(white(c)){i++;continue;}
  if(c===37){while(i<n&&s.charCodeAt(i)!==10&&s.charCodeAt(i)!==13)i++;continue;}
  const start=i;
  if(c===40){// literal string: balanced parentheses, backslash escapes
   let depth=1,v='';i++;
   while(i<n&&depth){const d=s.charCodeAt(i);
    if(d===92){i++;const e=s[i];if(e===undefined)break;
     if(e>='0'&&e<='7'){let o='';while(o.length<3&&s[i]>='0'&&s[i]<='7')o+=s[i++];v+=String.fromCharCode(parseInt(o,8)&255);continue;}
     if(e==='\r'){i++;if(s[i]==='\n')i++;continue;}if(e==='\n'){i++;continue;}
     v+=({n:'\n',r:'\r',t:'\t',b:'\b',f:'\f'} as Record<string,string>)[e]??e;i++;continue;}
    if(d===40)depth++;else if(d===41&&!--depth){i++;break;}
    // A bare end of line in a string reads as a line feed.
    if(d===13){v+='\n';i++;if(s[i]==='\n')i++;continue;}
    v+=s[i++];}
   out.push({t:'str',v,hex:false,raw:s.slice(start,i),start,end:i});continue;}
  if(c===60&&s.charCodeAt(i+1)===60){out.push({t:'<<',start,end:i+2});i+=2;continue;}
  if(c===62&&s.charCodeAt(i+1)===62){out.push({t:'>>',start,end:i+2});i+=2;continue;}
  if(c===60){let digits='';i++;while(i<n&&s.charCodeAt(i)!==62){if(hexValue(s.charCodeAt(i))>=0)digits+=s[i];i++;}i++;
   if(digits.length%2)digits+='0';let v='';for(let k=0;k<digits.length;k+=2)v+=String.fromCharCode(parseInt(digits.slice(k,k+2),16));
   out.push({t:'str',v,hex:true,raw:s.slice(start,i),start,end:i});continue;}
  if(c===91||c===93||c===123||c===125){out.push({t:s[i] as '['|']'|'{'|'}',start,end:i+1});i++;continue;}
  if(c===62||c===41){i++;continue;}// stray delimiter
  if(c===47){i++;let v='';while(i<n&&regular(s.charCodeAt(i))){if(s[i]==='#'&&hexValue(s.charCodeAt(i+1))>=0&&hexValue(s.charCodeAt(i+2))>=0){v+=String.fromCharCode(parseInt(s.slice(i+1,i+3),16));i+=3;}else v+=s[i++];}
   out.push({t:'name',v,start,end:i});continue;}
  while(i<n&&regular(s.charCodeAt(i)))i++;
  const word=s.slice(start,i);
  if(/^[+-]?(\d+\.?\d*|\.\d+)$/.test(word)){out.push({t:'num',v:Number(word),raw:word,start,end:i});continue;}
  out.push({t:'op',v:word,start,end:i});
  // Inline image data: binary up to an EI between white space.
  if(word==='ID'){i++;const from=i;let at=i;
   for(;;){at=s.indexOf('EI',at);if(at<0){at=n;break;}if(white(s.charCodeAt(at-1))&&(at+2>=n||white(s.charCodeAt(at+2))||delim(s.charCodeAt(at+2))))break;at+=2;}
   out.push({t:'data',start:from,end:at});i=at;}
 }
 return out;
}

// Operators with their operands. `start` is where the first operand begins.
export function parseOps(tokens:Tok[]):Op[]{
 const ops:Op[]=[];let args:Val[]=[],first=-1;const stack:{items:Val[];dict:boolean}[]=[];
 const push=(v:Val,start:number)=>{if(stack.length)stack[stack.length-1].items.push(v);else{if(first<0)first=start;args.push(v);}};
 for(const tok of tokens){
  if(tok.t==='['||tok.t==='<<'){if(!stack.length&&first<0)first=tok.start;stack.push({items:[],dict:tok.t==='<<'});continue;}
  if(tok.t===']'||tok.t==='>>'){const top=stack.pop();if(!top)continue;let v:Val;
   if(top.dict){const d:Record<string,Val>={};for(let k=0;k+1<top.items.length;k+=2){const key=top.items[k];if(key.t==='name')d[key.v]=top.items[k+1];}v={t:'dict',v:d};}else v={t:'arr',v:top.items};
   push(v,tok.start);continue;}
  if(tok.t==='{'||tok.t==='}'||tok.t==='data')continue;
  if(tok.t==='num'){push({t:'num',v:tok.v,raw:tok.raw},tok.start);continue;}
  if(tok.t==='name'){push({t:'name',v:tok.v},tok.start);continue;}
  if(tok.t==='str'){push({t:'str',v:tok.v,hex:tok.hex,raw:tok.raw},tok.start);continue;}
  if(tok.t!=='op')continue;
  if(tok.v==='true'||tok.v==='false'||tok.v==='null'){push({t:'kw',v:tok.v},tok.start);continue;}
  if(stack.length){stack[stack.length-1].items.push({t:'kw',v:tok.v});continue;}
  ops.push({op:tok.v,args,start:first<0?tok.start:first,end:tok.end});args=[];first=-1;
 }
 return ops;
}

// Codes of a string shown with a font whose codes are `size` bytes long.
export function codesOf(bytes:string,size:1|2):number[]|null{
 if(size===1)return Array.from(bytes,c=>c.charCodeAt(0));
 if(bytes.length%2)return null;
 const out:number[]=[];for(let i=0;i<bytes.length;i+=2)out.push(bytes.charCodeAt(i)<<8|bytes.charCodeAt(i+1));return out;
}
export function encodeCodes(codes:number[],size:1|2,hex:boolean,upper=false){
 if(hex){const h=codes.map(c=>c.toString(16).padStart(size*2,'0')).join('');return `<${upper?h.toUpperCase():h}>`;}
 const bytes=size===1?codes:codes.flatMap(c=>[c>>8,c&255]);
 return '('+bytes.map(b=>b===40||b===41||b===92?'\\'+String.fromCharCode(b):b<32||b>126?'\\'+b.toString(8).padStart(3,'0'):String.fromCharCode(b)).join('')+')';
}

const utf16=(bytes:string)=>{let s='';for(let i=0;i+1<bytes.length;i+=2)s+=String.fromCharCode(bytes.charCodeAt(i)<<8|bytes.charCodeAt(i+1));return s;};
const bytesValue=(b:string)=>{let v=0;for(const c of b)v=v*256+c.charCodeAt(0);return v;};
// A ToUnicode CMap: code → text, and the code length of its code space.
export function parseToUnicode(cmap:string){
 const tokens=tokenize(cmap),map=new Map<number,string>();let size=0,i=0,budget=200000;
 const str=(k:number)=>{const t=tokens[k];return t?.t==='str'?t.v:undefined;};
 while(i<tokens.length){
  const t=tokens[i++];if(t.t!=='op')continue;
  if(t.v==='begincodespacerange'){while(i<tokens.length&&!(tokens[i].t==='op'))i++;const lo=str(i-2);if(lo)size=Math.max(size,lo.length);continue;}
  if(t.v==='beginbfchar'){while(i+1<tokens.length&&tokens[i].t==='str'){const src=str(i)!,dst=tokens[i+1];if(dst.t==='str')map.set(bytesValue(src),utf16(dst.v));if(!size)size=src.length;i+=2;}continue;}
  if(t.v==='beginbfrange'){
   while(i+2<tokens.length&&tokens[i].t==='str'&&tokens[i+1].t==='str'){
    const lo=bytesValue(str(i)!),hi=bytesValue(str(i+1)!);if(!size)size=str(i)!.length;const dst=tokens[i+2];i+=3;
    if(hi<lo||hi-lo>65535||(budget-=hi-lo+1)<0)return {map,size:size||2};
    if(dst.t==='str'){const base=utf16(dst.v);if(!base)continue;const head=base.slice(0,-1),last=base.charCodeAt(base.length-1);for(let c=lo;c<=hi;c++)map.set(c,head+String.fromCharCode(last+c-lo));}
    else if(dst.t==='['){let c=lo;while(i<tokens.length&&tokens[i].t==='str'){if(c<=hi)map.set(c,utf16(str(i)!));c++;i++;}if(tokens[i]?.t===']')i++;}
   }
   continue;}
 }
 return {map,size:size||2};
}

// Common start and end of two texts (in code points).
export function splitEdit(before:string[],after:string[]){
 let p=0;while(p<before.length&&p<after.length&&before[p]===after[p])p++;
 let s=0;while(s<before.length-p&&s<after.length-p&&before[before.length-1-s]===after[after.length-1-s])s++;
 return {p,s};
}

// A run is right-aligned when its right edge lines up with other runs of its
// column (amounts in a table) more than its left edge does. A tie goes right
// for amounts, left for words.
export type Box={left:number;right:number;top:number;bottom:number};
export function alignsRight(run:Box&{text:string;size:number},others:Box[]){
 const tol=Math.max(.35,run.size*.03),apart=(o:Box)=>Math.min(o.bottom,run.bottom)-Math.max(o.top,run.top)<.5*Math.min(o.bottom-o.top,run.bottom-run.top);
 const column=others.filter(apart),rights=column.filter(o=>Math.abs(o.right-run.right)<tol).length,lefts=column.filter(o=>Math.abs(o.left-run.left)<tol).length;
 const digits=run.text.replace(/\D/g,'').length,letters=run.text.replace(/[^\p{L}]/gu,'').length;
 return rights>lefts||(rights>0&&rights===lefts&&digits>letters);
}

export type Kern={raw:string;v:number};
// One glyph of a rewritten operator: its code, where it must start and its
// advance (page units along the line), and the numbers that stood before it.
export type Placed={code:number;x:number;adv:number;before?:Kern[]};
export type Piece={n:number;raw:string}|{codes:number[]};
const fmt=(n:number)=>{const r=Math.round(n*1e4)/1e4;return Object.is(r,-0)?'0':String(r);};
// TJ pieces drawing `glyphs` where they must start, from the pen at `pen`,
// leaving the pen at `end` as before (following text does not move). `k` is
// how far one TJ unit moves the pen. Original numbers are kept when they still fit.
export function placeGlyphs(pen:number,end:number,k:number,glyphs:Placed[],after?:Kern[]):Piece[]{
 const out:Piece[]=[],eps=1e-5;
 const move=(target:number,reuse?:Kern[])=>{
  const n=-(target-pen)/k,sum=reuse?.reduce((a,b)=>a+b.v,0);
  if(reuse?.length&&Math.abs(sum!-n)<=1e-6*Math.max(1,Math.abs(n))){for(const r of reuse)out.push({n:r.v,raw:r.raw});pen-=sum!*k;return;}
  if(Math.abs(target-pen)<=eps)return;const raw=fmt(n),v=Number(raw);out.push({n:v,raw});pen-=v*k;
 };
 for(const g of glyphs){move(g.x,g.before);const last=out[out.length-1];if(last&&'codes' in last)last.codes.push(g.code);else out.push({codes:[g.code]});pen+=g.adv;}
 move(end,after);
 return out;
}
// The operator drawing `pieces`, in the original's kind and string style.
// ' and " keep their line move (and " its spacing) when they become TJ.
export function showOp(op:string,pieces:Piece[],{size,hex,upper,aw,ac}:{size:1|2;hex:boolean;upper?:boolean;aw?:string;ac?:string}){
 const str=(codes:number[])=>encodeCodes(codes,size,hex,upper);
 const simple=pieces.length===1&&'codes' in pieces[0]?str(pieces[0].codes):pieces.length===0?str([]):undefined;
 const array='['+pieces.map(p=>'codes' in p?str(p.codes):p.raw).join(' ')+'] TJ';
 if(op==="'")return simple?`${simple} '`:`T* ${array}`;
 if(op==='"')return simple?`${aw} ${ac} ${simple} "`:`${aw} Tw ${ac} Tc T* ${array}`;
 return simple&&op==='Tj'?`${simple} Tj`:array;
}
