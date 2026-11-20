// Invented pages that are hard to read rather than to edit (nothing here is
// real), in the shape of docs.mjs: BENCH_DOCS=reading node scripts/edit-bench.mjs
// reports how each field was read ("=== Reading"). Three kinds, in nine faces:
//   codes   words with O next to reference codes with 0 ("COLIS 0934", "REF AB0CD")
//   gaps    spacing that looks like a lost or an extra space: tabular digits,
//           initials, dot leaders, letter-spacing, tight and wide word spaces
//   tables  small digits with decimal points, or with commas beside a
//           version, a date and a time written with full stops
// The faces are those installed where it was measured (Liberation, DejaVu,
// JetBrains Mono, Courier 10 Pitch, Inter, Bitstream Charter); a missing one
// falls back to the browser's generic face of its kind.
import {variants as base} from './docs.mjs';
const f=(fields,id,style='')=>`<span data-f="${id}"${style?` style="${style}"`:''}>${fields[id]}</span>`;
const fonts={mono:"'Courier New','Liberation Mono',monospace",dejamono:"'DejaVu Sans Mono',monospace",jet:"'JetBrains Mono',monospace",pitch:"'Courier 10 Pitch',monospace",sans:"Arial,'Liberation Sans',sans-serif",serif:"'Times New Roman','Liberation Serif',serif",inter:"Inter,sans-serif",deja:"'DejaVu Sans',sans-serif",charter:"'Bitstream Charter',serif"};

const codeLines=['COLIS 0934 DEPOT','REF AB0CD LOT B0B','BON 2026 ZONE 40','W1A 0AX MODELE K0LA','TOTAL 100,00 NOTE','PORTO 8080 OSLO','CODE X0Z ROUTE 66','No 0O12 MOTO 500'];
const codes=(names,size=11)=>{const fields={};for(const n of names)codeLines.forEach((t,i)=>fields[`${n}${i}`]=t);
 return {width:430,height:Math.ceil(60+names.length*codeLines.length*size*1.75/2),fields,edits:[],
  html:v=>`<div style="color:#18181a;padding:24px 30px;font-size:${size}px;line-height:1.75;white-space:pre;display:grid;grid-template-columns:1fr 1fr;column-gap:20px">${names.map(n=>codeLines.map((_,i)=>`<div style="font-family:${fonts[n]}">${f(v,`${n}${i}`)}</div>`).join('')).join('')}</div>`};};

const gapLines=[['a','Total T.V.A. 20 % du prix'],['b','L’AVION To WAVE Type 4'],['c','J.-P. Dupont, 3 rue A. Briand'],['d','Prix : 1 482,36 € (x2)'],['e','Total ........ 12'],['f','n° 12 à 90 km/h vers 9 h 30'],['g','«Bonjour» dit-il, "ok" !'],['h','Le chat dort sur le lit.','word-spacing:-1px'],['i','Un deux trois quatre','word-spacing:6px'],['j','Vu et approuvé, le 5 mai','font-style:italic'],['k','Net à payer 1 250,00 €','font-weight:bold'],['l','RESERVATION','letter-spacing:.3em'],['m','Tél. 04 78 12 34 56'],['n','Art. 12 - Litiges, p. 4'],['o','12mm x 4cm = 48m2'],['p','www.exemple.fr/a_b?c=1']];
const gaps=(names,size=11)=>{const fields={};for(const n of names)for(const [id,t] of gapLines)fields[`${n}${id}`]=t;
 return {width:460,height:Math.ceil(60+names.length*gapLines.length*size*1.9/2),fields,edits:[],
  html:v=>`<div style="color:#141414;padding:24px 30px;font-size:${size}px;line-height:1.9;display:grid;grid-template-columns:1fr 1fr;column-gap:24px">${names.map(n=>gapLines.map(([id,,style])=>`<div style="font-family:${fonts[n]}">${f(v,`${n}${id}`,style??'')}</div>`).join('')).join('')}</div>`};};

// The readings table of docs.mjs with other numbers: decimal points (an English
// page), or commas with a version, a date and a time under it.
const table=(rows,head,foot='')=>{const fields={h:head};rows.forEach((r,i)=>r.forEach((t,k)=>fields[`${'mkce'[k]}${i+1}`]=t));if(foot)fields.foot=foot;
 return {width:440,height:300,fields,edits:[],
  html:v=>`<div style="font-family:Arial,'Liberation Sans',sans-serif;color:#3a3d42;padding:24px 30px;font-size:8px">
   <div style="font-size:10px;font-weight:bold;color:#1c1c1e;margin-bottom:8px">${f(v,'h')}</div>
   <table style="border-collapse:collapse;width:100%"><tr style="background:#2f3640;color:#fff"><td style="padding:5px 8px">Month</td><td style="padding:5px 8px;text-align:right">kWh</td><td style="padding:5px 8px;text-align:right">°C</td><td style="padding:5px 8px;text-align:right">Amount</td></tr>
   ${rows.map((_,j)=>{const i=j+1;return `<tr style="background:${i%2?'#fff':'#eef1f5'}"><td style="padding:5px 8px">${f(v,'m'+i)}</td><td style="padding:5px 8px;text-align:right">${f(v,'k'+i)}</td><td style="padding:5px 8px;text-align:right">${f(v,'c'+i)}</td><td style="padding:5px 8px;text-align:right">${f(v,'e'+i)}</td></tr>`;}).join('')}</table>${foot?`<div style="margin-top:8px">${f(v,'foot')}</div>`:''}</div>`};};

export const templates={
 codesA:codes(['mono','dejamono','sans']),codesB:codes(['serif','jet','pitch']),codesC:codes(['inter','deja','charter']),
 gapsA:gaps(['serif','sans']),gapsB:gaps(['mono','inter']),gapsC:gaps(['charter','dejamono']),
 points:table([['January','1,482','4.8','211.36'],['February','1,397','5.1','199.24'],['March','1,205','6.3','171.86'],['April','986','7.9','140.62'],['May','734','9.4','104.68']],'Meter 0427 readings — Lime Court'),
 mixed:table([['Janvier','1 482','4,8','211,36'],['Février','1 397','5,1','199,24'],['Mars','1 205','6,3','171,86'],['Avril','986','7,9','140,62'],['Mai','734','9,4','104,68']],'Relevés du compteur 0427 — immeuble Les Tilleuls','Relevé v2.1 du 12.03.2026 à 18.42, coefficient 1.5 appliqué'),
 // Like `mixed`, but its only decimal points are these two small ones.
 lone:table([['Janvier','1 482','4,8','211,36'],['Février','1 397','5,1','199,24'],['Mars','1 205','6,3','171,86'],['Avril','986','7,9','140,62'],['Mai','734','9,4','104,68']],'Relevés du compteur 0427 — immeuble Les Tilleuls','Version 2.1 du relevé, coefficient 1.5'),
};
export const variants={...base,softer:{dpi:200,blur:1.6,noise:5,jpeg:.8,as:'jpg'},low2:{dpi:150,blur:.8,noise:3,jpeg:.85,as:'jpg'}};
export const cases=Object.keys(templates).flatMap(t=>['clean','soft','softpdf','low','softer','low2'].map(v=>[t,v]));
