// Benchmark pages: each line of known text is an element with class "l"
// (nowrap, so one element is one line on the page). All names, companies and
// numbers are invented. `degrade` imitates a scan, a phone photo or a small image.
const l=(text,style='')=>`<div class="l" style="white-space:nowrap;${style}">${text}</div>`;
const page=(body,style='')=>`<div style="padding:48px 56px;font-family:Arial,sans-serif;color:#1d1d1f;background:#fff;${style}">${body}</div>`;

const letter=page([
 l('Société Lumière & Fils — 14 rue des Acacias, 69003 Lyon','font-weight:bold;font-size:15px'),
 l('Lyon, le 21 octobre 2026','margin:18px 0 18px;font-size:14px'),
 l('Objet : confirmation de votre réservation n° 48213','font-weight:bold;font-size:14px;margin-bottom:12px'),
 ...['Madame, Monsieur,','Nous avons le plaisir de vous confirmer votre séjour du 14 au 16 mars 2027.','Le montant total de 1 284,50 € TTC a été réglé par carte bancaire.','Votre chambre double avec vue sur jardin sera disponible dès 15 h.','Pour toute question, contactez-nous au 04 78 12 34 56 ou par courriel.','Nous vous prions d’agréer, Madame, Monsieur, nos salutations distinguées.'].map(t=>l(t,'font-size:14px;line-height:1.7')),
].join(''),'font-family:Georgia,serif');

const invoice=page([
 l('INVOICE INV-2026-0417','font-size:22px;font-weight:bold;letter-spacing:1px'),
 l('Billed to: Harbour View Apartments Ltd, 2 Quay Street, Bristol BS1 4DJ','font-size:13px;margin:10px 0 18px'),
 l('Description Qty Unit price Amount','font-weight:bold;font-size:13px;border-bottom:1px solid #999;padding:6px 0;word-spacing:40px'),
 ...[['Website maintenance (October)','1','450.00','450.00'],['Hosting, premium plan','12','18.50','222.00'],['Logo redesign','1','780.00','780.00'],['Translation EN-FR, 3,200 words','1','384.00','384.00']].map(r=>l(r.join(' '),'font-size:13px;padding:6px 0;border-bottom:1px solid #eee;word-spacing:40px')),
 l('Subtotal 1,836.00','font-size:13px;margin-top:12px;text-align:right'),
 l('VAT 20% 367.20','font-size:13px;text-align:right'),
 l('Total due GBP 2,203.20','font-size:15px;font-weight:bold;text-align:right'),
 l('Payment within 30 days to IBAN GB29 NWBK 6016 1331 9268 19','font-size:12px;margin-top:22px;color:#555'),
].join(''));

const receipt=`<div style="width:300px;padding:24px;font-family:'Courier New',monospace;font-size:13px;color:#333;background:#fbfaf7">${[
 l('MARCHÉ DU PORT','text-align:center;font-weight:bold'),l('12 quai de la Fosse, Nantes','text-align:center'),l('21/10/2026 18:42 Caisse 3','text-align:center;margin-bottom:10px'),
 l('Pain de campagne 3,20'),l('Comté 18 mois 7,45'),l('Pommes Golden 1,2kg 3,84'),l('Eau gazeuse x6 4,99'),l('Café en grains 9,90'),
 l('TOTAL EUR 29,38','font-weight:bold;margin-top:8px'),l('CB SANS CONTACT 29,38'),l('Merci de votre visite !','text-align:center;margin-top:10px'),
].join('')}</div>`;

const columns=page(`<div style="display:flex;gap:48px;font-size:13px;line-height:1.6">${['<div>'+[l('The local edition works offline','font-weight:bold'),l('after setup. Documents stay on'),l('your computer and are never'),l('uploaded. Office conversion uses'),l('a bundled engine, so no installed'),l('software is required.')].join('')+'</div>','<div>'+[l('Sharing on a network','font-weight:bold'),l('Colleagues open the address in'),l('Edge or Chrome. Each person gets'),l('their own workspace, and files'),l('are processed on their own PC.'),l('No account is needed.')].join('')+'</div>'].join('')}</div>`);

const smallPrint=page([
 l('Conditions générales de vente (extrait)','font-weight:bold;font-size:11px;margin-bottom:6px'),
 ...['Article 4 — Le droit de rétractation s’exerce dans un délai de 14 jours à compter de la livraison.','Article 5 — Les frais de retour sont à la charge du client, sauf produit défectueux ou non conforme.','Article 6 — Le remboursement intervient au plus tard 14 jours après réception du produit retourné.','Article 7 — Garantie légale de conformité : 2 ans à compter de la délivrance du bien.'].map(t=>l(t,'font-size:9px;line-height:1.5;color:#444')),
].join(''));

const darkUi=`<div style="width:760px;padding:28px;background:#1c1f26;font-family:Inter,Arial,sans-serif;color:#e8e8ee">${[
 l('Account settings','font-size:20px;font-weight:600;margin-bottom:16px'),
 l('Email address','font-size:12px;color:#9aa0ab'),l('alex.martin@example.com','font-size:14px;margin-bottom:12px'),
 l('Plan','font-size:12px;color:#9aa0ab'),l('Pro · renews on 14 March 2027','font-size:14px;margin-bottom:12px'),
 l('Two-factor authentication','font-size:12px;color:#9aa0ab'),l('Enabled since 2 June 2026','font-size:14px;margin-bottom:18px'),
 l('Save changes','display:inline-block;background:#c44c28;color:#fff;padding:8px 16px;border-radius:6px;font-size:13px'),
].join('')}</div>`;

// Text over a busy picture: stripes, blobs and a gradient behind the words.
const busy=`<div style="position:relative;width:820px;height:460px;overflow:hidden;font-family:Arial,sans-serif;background:repeating-linear-gradient(35deg,#3b6e8f 0 14px,#4f86a8 14px 30px)">
 <div style="position:absolute;left:-60px;top:180px;width:420px;height:420px;border-radius:50%;background:radial-gradient(#f2b134,#d9602b)"></div>
 <div style="position:absolute;right:-80px;top:-40px;width:360px;height:300px;border-radius:40%;background:radial-gradient(#9dd17a,#2f7d4a)"></div>
 <div style="position:absolute;left:40px;top:40px;color:#fff;text-shadow:0 2px 6px #0008">${[
  l('FESTIVAL DES LUMIÈRES','font-size:40px;font-weight:900;letter-spacing:2px'),
  l('Du 5 au 8 décembre 2026 · Place Bellecour','font-size:22px;margin-top:6px'),
  l('Concerts gratuits chaque soir à 20 h 30','font-size:20px;margin-top:150px'),
  l('Billetterie : www.lumieres-lyon.example','font-size:18px;margin-top:8px'),
 ].join('')}</div>
 <div style="position:absolute;right:30px;bottom:30px;background:#fff;color:#c44c28;padding:8px 14px;border-radius:8px;transform:rotate(-6deg)">${l('Entrée libre','font-size:24px;font-weight:bold')}</div>
</div>`;
// A map-like screenshot: labels on roads and parks.
const map=`<div style="position:relative;width:760px;height:480px;background:#e8ece6;font-family:Arial,sans-serif;overflow:hidden">
 ${Array.from({length:12},(_,i)=>`<div style="position:absolute;left:${i*70-40}px;top:-20px;width:14px;height:540px;background:#fff;transform:rotate(${i%2?18:-12}deg)"></div>`).join('')}
 <div style="position:absolute;left:420px;top:220px;width:260px;height:160px;border-radius:30px;background:#b9dca4"></div>
 <div style="position:absolute;left:60px;top:60px;font-size:13px;color:#555">${l('Rue de la République')}</div>
 <div style="position:absolute;left:470px;top:280px;font-size:13px;color:#3d6b35">${l('Parc de la Tête d’Or')}</div>
 <div style="position:absolute;left:200px;top:380px;font-size:12px;color:#555">${l('Avenue Jean Jaurès')}</div>
 <div style="position:absolute;left:40px;top:150px;background:#fff;padding:10px 14px;border-radius:8px;box-shadow:0 2px 8px #0003;font-size:14px">${l('Hôtel du Parc','font-weight:bold')}${l('4,6 ★ · 128 avis')}${l('Ouvert jusqu’à 23:00')}</div>
</div>`;

// A full A4 page as a 150 dpi scan would show it: 11 pt text, several paragraphs.
const a4=page([
 l('Rapport d’activité — troisième trimestre 2026','font-size:20px;font-weight:bold;margin-bottom:14px'),
 ...['Le chiffre d’affaires du trimestre atteint 482 300 €, en hausse de 12 % par rapport à 2025.','Les ventes en ligne représentent désormais 38 % du total, contre 31 % un an plus tôt.','Trois nouveaux magasins ont ouvert à Bordeaux, Lille et Strasbourg en septembre.','Les délais de livraison moyens sont passés de 4,2 à 3,1 jours ouvrés.','Le taux de satisfaction client mesuré en octobre s’établit à 91 %.','Les investissements prévus pour 2027 concernent l’entrepôt de Mâcon et le site web.'].map(t=>l(t,'font-size:15px;line-height:1.75')),
 l('Points d’attention','font-size:16px;font-weight:bold;margin:16px 0 6px'),
 ...['Hausse du coût des transports de 7 % depuis juillet.','Recrutement difficile pour les postes de préparateurs de commandes.','Renouvellement du contrat de maintenance informatique avant le 31 décembre.'].map(t=>l('• '+t,'font-size:15px;line-height:1.75')),
].join(''),'font-family:\'Times New Roman\',serif');

export const pages=[
 {id:'letter',category:'clean document',html:letter},
 {id:'invoice',category:'table',html:invoice},
 {id:'receipt',category:'receipt',html:receipt,width:360},
 {id:'columns',category:'two columns',html:columns},
 {id:'small-print',category:'small print',html:smallPrint},
 {id:'dark-ui',category:'screenshot (dark)',html:darkUi,width:820},
 {id:'letter-scan',category:'scan',html:letter,degrade:{rotate:1.2,paper:'#efece4',noise:22,blur:.5,jpeg:.5}},
 {id:'invoice-photo',category:'phone photo',html:invoice,degrade:{rotate:-2.5,shade:.35,noise:14,blur:.8,jpeg:.6}},
 {id:'receipt-fax',category:'low quality',html:receipt,width:360,degrade:{scale:.75,noise:30,blur:.7,jpeg:.4}},
 {id:'small-print-low',category:'small + low resolution',html:smallPrint,degrade:{scale:.8,jpeg:.7}},
 {id:'invoice-retina',category:'screenshot (2x)',html:invoice,dpr:2},
 {id:'a4-scan',category:'full page scan',html:a4,degrade:{rotate:.7,paper:'#f3f1ea',noise:10,jpeg:.7}},
 {id:'letter-angle',category:'photo at an angle',html:letter,perspective:'perspective(1200px) rotateX(14deg) rotateY(-10deg)',degrade:{noise:8,jpeg:.75}},
 {id:'invoice-angle',category:'photo at an angle',html:invoice,perspective:'perspective(1100px) rotateX(-12deg) rotateY(12deg) rotateZ(2deg)',degrade:{noise:8,jpeg:.75}},
 {id:'poster',category:'busy picture',html:busy,width:820,height:460},
 {id:'map',category:'map screenshot',html:map,width:760,height:480},
 {id:'poster-photo',category:'busy photo',html:busy,width:820,height:460,degrade:{rotate:1.5,noise:12,blur:.6,jpeg:.6}},
];
