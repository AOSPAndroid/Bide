// Scoring for the edit benchmark. Pure functions: the text ones run in Node,
// the pixel ones in the browser page that decoded the images.

const norm=s=>s.replace(/[  ]/g,' ').replace(/\s+/g,' ').trim();
// Typography folded away, to tell a misread from a wrong mark.
const plain=s=>norm(s).replace(/[’‘ʼ]/g,"'").replace(/[−–—]/g,'-');

// How each true field was read. `regions` and `fields` in image pixels.
//   exact    one region with exactly the field's text
//   merged   one region holding the field and more (still editable)
//   split    several regions that together spell it
//   mark     right but for an apostrophe or dash
//   misread / missed
export function ocrFields(fields,regions){
 return fields.map(f=>{
  const fa=f.w*f.h,hit=regions.filter(r=>{const x=Math.min(f.x+f.w,r.left+r.width)-Math.max(f.x,r.left),y=Math.min(f.y+f.h,r.top+r.height)-Math.max(f.y,r.top);return x>0&&y>0&&x*y>=fa*.4;}).sort((a,b)=>a.left-b.left);
  const want=norm(f.text);let status='missed',region;
  if(hit.length===1){const got=norm(hit[0].text);region=hit[0];status=got===want?'exact':got.includes(want)?'merged':plain(got)===plain(want)?'mark':'misread';}
  else if(hit.length>1){
   const whole=hit.find(r=>norm(r.text)===want)??hit.find(r=>norm(r.text).includes(want));
   if(whole){region=whole;status=norm(whole.text)===want?'exact':'merged';}
   else status=[hit.map(r=>norm(r.text)).join(' '),hit.map(r=>norm(r.text)).join('')].some(t=>t===want||t.replace(/ /g,'')===want.replace(/ /g,''))?'split':'misread';
  }
  return {id:f.id,text:f.text,status,region:region?.id,read:hit.map(r=>r.text)};
 });
}

// Letter cells against the true character boxes of a field read exactly:
// each boundary between two letters of a word, as a share of the font size.
export function cellErrors(field,region){
 if(!region.glyphs||region.angle)return undefined;
 const chars=field.chars.filter(c=>/\S/.test(c.ch)),g=region.glyphs.filter(c=>c.ch!=='￼');if(chars.length!==g.length||chars.some((c,i)=>c.ch!==g[i].ch))return undefined;
 const out=[];for(let i=0;i+1<chars.length;i++){if(chars[i+1].i!==chars[i].i+1)continue;out.push(Math.abs(g[i].x1-(chars[i].x1+chars[i+1].x0)/2)/field.size);}
 return out;
}

// --- Pixels ------------------------------------------------------------------
// `img`: {w,h,data} RGBA. Ink is contrast with the area's own background (its
// median luminance), so dark-on-light and light-on-dark text score alike.
const lum=(d,i)=>.299*d[i]+.587*d[i+1]+.114*d[i+2];
function ink(img,x0,y0,w,h){
 const l=new Float32Array(w*h);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const xx=x+x0,yy=y+y0;l[y*w+x]=xx<0||yy<0||xx>=img.w||yy>=img.h?NaN:lum(img.data,(yy*img.w+xx)*4);}
 const sorted=Array.from(l).filter(v=>!Number.isNaN(v)).sort((a,b)=>a-b),bg=sorted[sorted.length>>1]??255;
 for(let i=0;i<l.length;i++)l[i]=Number.isNaN(l[i])?0:Math.abs(l[i]-bg);
 return {v:l,bg};
}
const top=(v,share)=>{const s=Array.from(v).filter(x=>x>40).sort((a,b)=>b-a);if(!s.length)return 0;const n=Math.max(1,Math.ceil(s.length*share));let t=0;for(let i=0;i<n;i++)t+=s[i];return t/n;};
// Roughness of the paper around the letters (pixels with little ink): a patch
// of flat colour on a noisy scan shows when zoomed in.
const grain=(img,x0,y0,w,h,v)=>{let n=0,sum=0,sq=0;for(let y=0;y<h;y++)for(let x=0;x<w;x++){if(v[y*w+x]>10)continue;const xx=x+x0,yy=y+y0;if(xx<0||yy<0||xx>=img.w||yy>=img.h)continue;const l=lum(img.data,(yy*img.w+xx)*4);n++;sum+=l;sq+=l*l;}return n>20?Math.sqrt(Math.max(0,sq/n-(sum/n)**2)):0;};
const edges=(v,w,h)=>{let e=0,m=0;for(let y=1;y<h;y++)for(let x=1;x<w;x++){const i=y*w+x;e+=Math.abs(v[i]-v[i-1])+Math.abs(v[i]-v[i-w]);m+=v[i];}return m?e/m:0;};

// An edited field against the same field in the regenerated document.
// `box`: {x,y,w,h} covering the field before and after, in pixels.
//   shift     where the edit sits against the reference (px; x then y)
//   mismatch  0 = the same ink once aligned, 1 = no ink in common
//   mass      ink of the edit / ink of the reference
//   core      darkest ink of the edit − of the reference (levels; − = lighter)
//   sharp     edge sharpness of the edit / of the reference
//   grain     paper noise around the edit's letters / around the reference's (1 on clean paper)
export function fieldScore(edited,reference,box,dpi){
 const k=dpi/200,mx=Math.round(26*k),my=Math.round(7*k),x0=Math.round(box.x)-mx,y0=Math.round(box.y)-my,w=Math.round(box.w)+2*mx,h=Math.round(box.h)+2*my;
 const E=ink(edited,x0,y0,w,h),R=ink(reference,x0,y0,w,h),sx=Math.round(24*k),sy=Math.round(5*k);
 let best={dx:0,dy:0,cost:Infinity};
 const cost=(dx,dy,limit)=>{let c=0;for(let y=0;y<h;y++){const yy=y+dy;for(let x=0;x<w;x++){const xx=x+dx,e=xx<0||yy<0||xx>=w||yy>=h?0:E.v[yy*w+xx];c+=Math.abs(e-R.v[y*w+x]);}if(c>limit)return c;}return c;};
 // The edit at (x+dx, y+dy) lies over the reference at (x, y).
 for(let dy=-sy;dy<=sy;dy++)for(let dx=-sx;dx<=sx;dx++){const c=cost(dx,dy,best.cost);if(c<best.cost||c===best.cost&&Math.abs(dx)+Math.abs(dy)<Math.abs(best.dx)+Math.abs(best.dy))best={dx,dy,cost:c};}
 let union=0,sumE=0,sumR=0;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const xx=x+best.dx,yy=y+best.dy,e=xx<0||yy<0||xx>=w||yy>=h?0:E.v[yy*w+xx],r=R.v[y*w+x];union+=Math.max(e,r);sumE+=E.v[y*w+x];sumR+=r;}
 // Only the field itself: its margins are untouched paper in both.
 const fx=Math.round(box.x),fy=Math.round(box.y),fw=Math.round(box.w),fh=Math.round(box.h),FE=ink(edited,fx,fy,fw,fh),FR=ink(reference,fx,fy,fw,fh),gr=grain(reference,fx,fy,fw,fh,FR.v);
 return {shift:[best.dx,best.dy],mismatch:union?best.cost/union:0,mass:sumR?sumE/sumR:0,core:top(E.v,.08)-top(R.v,.08),sharp:(edges(R.v,w,h)?edges(E.v,w,h)/edges(R.v,w,h):1),grain:gr<1?1:grain(edited,fx,fy,fw,fh,FE.v)/gr,area:{x:x0,y:y0,w,h}};
}
// Pixels changed away from the field: the edit against the document as opened.
export function collateral(edited,original,area){
 let n=0;const w=Math.min(edited.w,original.w),h=Math.min(edited.h,original.h);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){if(x>=area.x&&x<area.x+area.w&&y>=area.y&&y<area.y+area.h)continue;const i=(y*original.w+x)*4,j=(y*edited.w+x)*4;if(Math.abs(lum(edited.data,j)-lum(original.data,i))>48)n++;}
 return n;
}

// What a reader would notice. Limits scale with the scan's resolution.
export function verdict(m,dpi){
 const k=dpi/200,problems=[];
 if(Math.hypot(...m.shift)>2.5*k)problems.push('moved');
 if(m.mismatch>.32)problems.push('shape');
 if(m.mass<.9||m.mass>1.1)problems.push(m.mass<1?'thin':'heavy');
 if(Math.abs(m.core)>16)problems.push(m.core<0?'pale':'dark');
 if(m.sharp<.8||m.sharp>1.3)problems.push(m.sharp<1?'soft':'crisp');
 if(m.grain!==undefined&&(m.grain<.6||m.grain>1.6))problems.push(m.grain<1?'flat':'rough');
 if(m.outside>60*k*k)problems.push('spill');
 return problems;
}
