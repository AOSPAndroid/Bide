// Touch screens keep :hover on the last tapped element, so a tapped button keeps its hover look:
// an orange button turns pale and reads as disabled, a tapped icon looks like the active tool.
// No stylesheet rule can undo the generic `button:hover` per button (its specificity beats the
// class rules), so on touch-only devices every hover rule moves under @media (hover:hover), as if
// the stylesheets had been written that way. Desktops (hover:hover) are left untouched.
const hoverOnly='(hover:hover)';
// Top-level selectors of a list, so `a:hover,a:focus-visible` keeps its focus half.
const selectors=(list:string)=>{const out=[''];let depth=0;for(const c of list){if(c==='('||c==='[')depth++;else if(c===')'||c===']')depth--;if(c===','&&!depth)out.push('');else out[out.length-1]+=c;}return out.map(s=>s.trim());};

function gate(owner:CSSStyleSheet|CSSGroupingRule){
 for(let i=owner.cssRules.length-1;i>=0;i--){
  const rule=owner.cssRules[i];
  if(rule instanceof CSSStyleRule){
   if(!rule.selectorText.includes(':hover'))continue;
   const all=selectors(rule.selectorText),hover=all.filter(s=>s.includes(':hover')),rest=all.filter(s=>!s.includes(':hover')),body=rule.style.cssText;
   owner.deleteRule(i);owner.insertRule(`@media ${hoverOnly}{${hover.join(',')}{${body}}}`,i);
   if(rest.length)owner.insertRule(`${rest.join(',')}{${body}}`,i);
  }else if('cssRules' in rule&&!(rule instanceof CSSMediaRule&&rule.media.mediaText.includes('hover')))gate(rule as CSSGroupingRule);
 }
}
const gateSheet=(sheet:CSSStyleSheet|null)=>{try{if(sheet)gate(sheet);}catch{/* a sheet from another origin */}};

export function gateTouchHover(){
 if(typeof matchMedia!=='function'||!matchMedia('(hover:none)').matches)return;
 for(const sheet of document.styleSheets)gateSheet(sheet);
 // A stylesheet still loading has no rules yet.
 for(const link of document.querySelectorAll<HTMLLinkElement>('link[rel=stylesheet]'))if(!link.sheet)link.addEventListener('load',()=>gateSheet(link.sheet),{once:true});
}
