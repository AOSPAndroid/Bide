// Invented documents for the edit benchmark (nothing here is real). Each
// template is HTML built from named fields, so the same document can be
// generated again with one field changed: that render is the reference an
// edit made in the app is compared with.
//   field(id): <span data-f="id">text</span>, measured in the browser.
//   edits: [field id, new text, kind]
//     own    the line's own letters can write it
//     page   a letter the line lacks, present on another line in the same style
//     new    a letter found nowhere on the page
//     longer / shorter   the text changes length (own letters)
import {readFile} from 'node:fs/promises';

const face=async(family,file,weight=400)=>`@font-face{font-family:"${family}";font-weight:${weight};src:url(data:font/ttf;base64,${(await readFile(new URL('../../src/browser/fonts/'+file,import.meta.url))).toString('base64')})}`;
const f=(fields,id,style='')=>`<span data-f="${id}"${style?` style="${style}"`:''}>${fields[id]}</span>`;
const row=(a,b,style='')=>`<div style="display:flex;justify-content:space-between;${style}"><span>${a}</span><span>${b}</span></div>`;

export const templates={
 // A bike workshop invoice: sans labels, right-aligned amounts, a bold total.
 workshop:{width:430,height:330,
  fields:{title:'Atelier Roue Libre',ref:'Facture 2026-0418',date:'12 mars 2026',l1:'Révision complète',a1:'64,00 €',l2:'Chambre à air (x2)',a2:'17,80 €',l3:'Câble de frein',a3:'9,50 €',l4:'Main-d’œuvre 1 h 30',a4:'52,50 €',total:'143,80 €',note:'Payé par carte le 12/03/2026'},
  html:(v)=>`<div style="font-family:Arial,'Liberation Sans',sans-serif;color:#1c1c1e;padding:28px 36px;font-size:10px;line-height:2.2">
   <div style="font-size:15px;font-weight:bold">${f(v,'title')}</div>
   ${row(f(v,'ref'),f(v,'date'),'color:#555')}
   <div style="border-top:1px solid #999;margin:6px 0"></div>
   ${row(f(v,'l1'),f(v,'a1'))}${row(f(v,'l2'),f(v,'a2'))}${row(f(v,'l3'),f(v,'a3'))}${row(f(v,'l4'),f(v,'a4'))}
   <div style="border-top:1px solid #999;margin:6px 0"></div>
   ${row('<b>Total TTC</b>',`<b>${f(v,'total')}</b>`,'font-size:12px')}
   <div style="color:#555;margin-top:8px">${f(v,'note')}</div></div>`,
  edits:[['a1','46,00 €','own'],['a2','18,70 €','own'],['a4','55,20 €','own'],['a3','9,60 €','page'],['a1','64,30 €','page'],['total','148,30 €','own'],['total','143,90 €','page'],['a2','117,80 €','longer'],['date','21 mars 2026','own'],['date','12 mars 2027','page'],['l3','Câble de frein avant','page'],['note','Payé par carte le 15/03/2026','page'],['ref','Facture 2026-0481','own'],['a3','7,50 €','page']]},

 // A club's letter: serif body text.
 letter:{width:460,height:330,
  fields:{from:'Club nautique de la Pointe',date:'Le 4 février 2026',to:'Madame Hélène Garnier',s1:'Votre inscription au stage de voile',s2:'du 14 au 18 avril est confirmée.',s3:'Le règlement de 285 euros a bien été reçu.',s4:'Rendez-vous à 9 h 30 au ponton nord.',sign:'Le secrétaire, Paul Kermarec'},
  html:(v)=>`<div style="font-family:'Times New Roman','Liberation Serif',serif;color:#141414;padding:30px 40px;font-size:11.5px;line-height:1.9">
   <div style="font-weight:bold;font-size:14px">${f(v,'from')}</div><div style="text-align:right">${f(v,'date')}</div>
   <div style="margin:10px 0 6px">${f(v,'to')}</div>
   <div>${f(v,'s1')}</div><div>${f(v,'s2')}</div><div>${f(v,'s3')}</div><div>${f(v,'s4')}</div>
   <div style="margin-top:14px;font-style:italic">${f(v,'sign')}</div></div>`,
  edits:[['s2','du 18 au 14 avril est confirmée.','own'],['s3','Le règlement de 258 euros a bien été reçu.','own'],['s3','Le règlement de 295 euros a bien été reçu.','page'],['s4','Rendez-vous à 9 h 00 au ponton nord.','own'],['s4','Rendez-vous à 8 h 30 au ponton nord.','page'],['date','Le 6 février 2026','own'],['date','Le 4 février 2028','page'],['to','Madame Hélène Garnier-Roux','new'],['s1','Votre inscription au stage de kayak','new'],['s2','du 14 au 18 mai est confirmée.','shorter'],['s4','Rendez-vous à 9 h 30 au ponton sud.','own'],['s3','Le règlement de 1 285 euros a bien été reçu.','page']]},

 // A parcel slip set on a typewriter.
 slip:{width:430,height:250,
  fields:{n1:'COLETTE MARCHAND',n2:'27 RUE DES ARDOISES',n3:'49100 ANGERS',r1:'REF 5521-0934  COLIS 1/2',r2:'POIDS 3,40 KG',r3:'DEPOT LE 08/11/2026'},
  html:(v)=>`<div style="font-family:'Courier New','Liberation Mono',monospace;color:#18181a;padding:30px 36px;font-size:11px;line-height:1.75;white-space:pre">
   <div>${f(v,'n1')}</div><div>${f(v,'n2')}</div><div>${f(v,'n3')}</div><div style="margin-top:12px">${f(v,'r1')}</div><div>${f(v,'r2')}</div><div>${f(v,'r3')}</div></div>`,
  edits:[['n2','72 RUE DES ARDOISES','own'],['n2','29 RUE DES ARDOISES','page'],['n3','49000 ANGERS','own'],['n3','49300 ANGERS','page'],['r1','REF 5521-0943  COLIS 1/2','own'],['r1','REF 5521-0934  COLIS 2/2','own'],['r2','POIDS 4,30 KG','own'],['r2','POIDS 3,90 KG','page'],['r3','DEPOT LE 18/11/2026','own'],['r3','DEPOT LE 08/12/2026','own'],['n1','COLETTE MARCHAL','shorter'],['n3','49100 ANGERS CEDEX','new']]},

 // A meter readings table: small grey digits, banded rows.
 readings:{width:440,height:300,
  fields:{h:'Relevés du compteur 0427 — immeuble Les Tilleuls',m1:'Janvier',k1:'1 482',c1:'4,8',e1:'211,36',m2:'Février',k2:'1 397',c2:'5,1',e2:'199,24',m3:'Mars',k3:'1 205',c3:'6,3',e3:'171,86',m4:'Avril',k4:'986',c4:'7,9',e4:'140,62',m5:'Mai',k5:'734',c5:'9,4',e5:'104,68'},
  html:(v)=>`<div style="font-family:Arial,'Liberation Sans',sans-serif;color:#3a3d42;padding:24px 30px;font-size:8px">
   <div style="font-size:10px;font-weight:bold;color:#1c1c1e;margin-bottom:8px">${f(v,'h')}</div>
   <table style="border-collapse:collapse;width:100%"><tr style="background:#2f3640;color:#fff"><td style="padding:5px 8px">Mois</td><td style="padding:5px 8px;text-align:right">kWh</td><td style="padding:5px 8px;text-align:right">°C moyen</td><td style="padding:5px 8px;text-align:right">Montant (€)</td></tr>
   ${[1,2,3,4,5].map(i=>`<tr style="background:${i%2?'#fff':'#eef1f5'}"><td style="padding:5px 8px">${f(v,'m'+i)}</td><td style="padding:5px 8px;text-align:right">${f(v,'k'+i)}</td><td style="padding:5px 8px;text-align:right">${f(v,'c'+i)}</td><td style="padding:5px 8px;text-align:right">${f(v,'e'+i)}</td></tr>`).join('')}</table></div>`,
  edits:[['c1','8,4','own'],['c1','5,8','page'],['k1','1 428','own'],['k2','1 379','own'],['k2','1 367','page'],['e1','211,63','own'],['e2','199,42','own'],['e3','171,68','own'],['e4','140,26','own'],['e4','148,62','page'],['e5','104,86','own'],['k4','968','own'],['k5','743','own'],['c3','3,6','own'],['e3','171,96','page']]},

 // A booking screen: dark header, large light title, badge, semi-bold labels.
 screen:{width:390,height:330,fonts:async()=>[await face('RobotoB','library/roboto-Regular.ttf'),await face('RobotoB','library/roboto-Bold.ttf',700),await face('RobotoL','weights/Roboto-Light.ttf')].join(''),
  fields:{bar:'Réservation confirmée',place:'Gîte du Vieux Moulin',where:'Saint-Antonin, Tarn-et-Garonne',d1:'Arrivée',v1:'sam. 18 juil. 2026',d2:'Départ',v2:'sam. 25 juil. 2026',d3:'Voyageurs',v3:'2 adultes, 1 enfant',d4:'Total payé',v4:'742,00 €',code:'Code d’accès : 4831',badge:'ANNULATION GRATUITE'},
  html:(v)=>`<div style="font-family:RobotoB,sans-serif;color:#1f2328;font-size:11px">
   <div style="background:#1f6f5c;color:#fff;padding:12px 18px;font-size:12px;font-weight:700">${f(v,'bar')}</div>
   <div style="padding:14px 18px"><div style="font-family:RobotoL;font-size:21px">${f(v,'place')}</div><div style="color:#667">${f(v,'where')}</div>
   <div style="margin:8px 0"><span style="background:#ffe9a8;color:#6b4e00;font-size:8px;font-weight:700;padding:3px 6px;border-radius:3px">${f(v,'badge')}</span></div>
   ${[1,2,3,4].map(i=>row(`<span style="color:#667">${f(v,'d'+i)}</span>`,`<span style="font-weight:${i===4?700:400}">${f(v,'v'+i)}</span>`,'line-height:2.1;border-bottom:1px solid #e3e6ea')).join('')}
   <div style="margin-top:10px;color:#1f6f5c;font-weight:700">${f(v,'code')}</div></div></div>`,
  edits:[['v1','sam. 11 juil. 2026','own'],['v2','sam. 22 juil. 2026','own'],['v1','sam. 18 juil. 2025','page'],['v2','sam. 25 juil. 2027','page'],['v4','724,00 €','own'],['v4','742,80 €','page'],['v3','2 adultes, 2 enfant','own'],['v3','3 adultes, 1 enfant','page'],['code','Code d’accès : 4318','own'],['code','Code d’accès : 4837','page'],['place','Gîte du Vieux Lavoir','page'],['place','Gîte du Moulin Vieux','own'],['bar','Réservation modifiée','page'],['where','Saint-Antonin, Tarn','shorter']]},

 // A tradesman's card: white text on a pink-to-purple gradient, a thin
 // Raleway Light name and contact lines, a heavy Nunito ExtraBold list of
 // services. The edits a business owner asks for: a new phone number, email,
 // name and services.
 ad:{width:560,height:340,fonts:async()=>[await face('RalewayL','weights/Raleway-Light.ttf'),await face('NunitoX','weights/Nunito-ExtraBold.ttf')].join(''),
  fields:{name:'ATELIER LAMBERT',role:'Plombier Chauffagiste',s1:'Dépannage - Rénovation',s2:'Salle de bain clé en main',s3:'Chauffe-eau thermodynamique',s4:'Entretien chaudière',mail:'contact@atelier-lambert.fr',tel:'06 48 27 15 90'},
  html:(v)=>`<div style="width:560px;height:340px;background:linear-gradient(120deg,#e2336b 0%,#c93f8e 55%,#9b3fa3 100%);color:#fff;padding:30px 40px;box-sizing:border-box">
   <div style="font-family:RalewayL;font-size:30px;letter-spacing:.5px">${f(v,'name')}</div>
   <div style="width:60px;border-top:1px solid #fff8;margin:12px 0"></div>
   <div style="font-family:RalewayL;font-size:18px;margin-bottom:12px">${f(v,'role')}</div>
   <div style="font-family:NunitoX;font-size:17px;line-height:1.3">${[1,2,3,4].map(i=>`<div>${f(v,'s'+i)}</div>`).join('')}</div>
   <div style="font-family:RalewayL;font-size:18px;margin-top:14px">${f(v,'mail')}</div>
   <div style="font-family:RalewayL;font-size:18px">${f(v,'tel')}</div></div>`,
  edits:[['tel','06 48 27 51 09','own'],['tel','07 33 61 26 84','new'],['mail','atelier.lambert@gmail.com','page'],['mail','contact@lambert.fr','shorter'],['name','ATELIER MARTIN','new'],['name','ATELIER BERTAL','own'],['role','Plombier Couvreur','page'],['s1','Rénovation - Dépannage','own'],['s2','Salle de bain','shorter'],['s3','Chauffe-eau solaire','page'],['s4','Entretien chaudière gaz','new']]},
};

// How each document reaches the app. `dpi`: pixels per inch of the scan (a CSS
// px is a point); `blur` in scan pixels; `rotate` in degrees; `noise` in grey
// levels; `jpeg`: quality of the scan itself; `as`: the file opened.
export const variants={
 clean:{dpi:200,as:'png'},
 pdf:{dpi:200,as:'scanpdf'},
 fine:{dpi:300,as:'scanpdf'},
 soft:{dpi:200,blur:1.1,noise:5,jpeg:.82,as:'jpg'},
 softpdf:{dpi:200,blur:1.3,noise:4,as:'scanpdf'},
 tilt:{dpi:200,rotate:1.3,blur:.5,as:'png'},
 low:{dpi:130,blur:.4,as:'png'},
 // A screenshot: device pixels, no scanner.
 shot:{dpi:216,as:'png'},
};

// The documents measured: every template clean and as a scanned PDF, and the
// degradations where they are most common.
export const cases=[
 ['workshop','clean'],['workshop','pdf'],['workshop','soft'],['workshop','tilt'],['workshop','softpdf'],
 ['letter','clean'],['letter','fine'],['letter','soft'],
 ['slip','clean'],['slip','pdf'],['slip','low'],
 ['readings','clean'],['readings','fine'],['readings','soft'],
 ['screen','shot'],['screen','soft'],
 ['ad','clean'],['ad','soft'],['ad','shot'],
];
