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
];
