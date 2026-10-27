// Sample e-invoices covering each VAT case the editor offers. All companies,
// numbers and people are invented. SIRENs start with 000 (not issued) and only
// pass the checksum; the IBAN is the usual French documentation example.
const seller={name:'Atelier Lumière SARL',siren:'000123455',vatId:'FR31000123455',email:'compta@atelier-lumiere.example',address:{line1:'14 rue des Acacias',postcode:'69003',city:'Lyon',country:'FR'}};
const buyer={name:'Harbour View SAS',siren:'000987651',vatId:'FR03000987651',address:{line1:'2 quai de la Fosse',postcode:'44000',city:'Nantes',country:'FR'}};
const mentions={latePenalty:'Pénalités de retard : trois fois le taux d’intérêt légal.',recoveryIndemnity:'Indemnité forfaitaire pour frais de recouvrement : 40 €.',discountTerms:'Pas d’escompte pour paiement anticipé.'};
const line=(id,name,quantity,unitPrice,vatRate=20,vatCategory='S',unit='C62')=>({id,name,quantity,unit,unitPrice,vatCategory,vatRate});
const base={type:'380',issueDate:'2026-10-27',dueDate:'2026-11-26',currency:'EUR',operation:'services',seller,buyer,payment:{code:'58',iban:'FR76 3000 6000 0112 3456 7890 189',bic:'AGRIFRPP'},...mentions};

export const samples={
 'services-vat':{...base,number:'F-2026-0042',buyerReference:'Projet Quai',orderReference:'PO-7781',deliveryDate:'2026-10-20',
  lines:[line('1','Refonte du site web',1,1850),line('2','Maintenance (heures)',6.5,72.5,20,'S','HUR'),line('3','Livre blanc imprimé',40,4.35,5.5)]},
 'franchise':{...base,number:'2026-018',seller:{name:'Camille Martin EI',siren:'000456780',vatId:'FR33000456780',address:{line1:'8 place Bellecour',postcode:'69002',city:'Lyon',country:'FR'}},
  exemptionReason:'TVA non applicable, art. 293 B du CGI',lines:[line('1','Séance photo produit',1,480,0,'E'),line('2','Retouches',12,15,0,'E')]},
 'intra-eu':{...base,number:'F-2026-0043',operation:'goods',deliveryDate:'2026-10-22',buyer:{name:'Nordlicht GmbH',vatId:'DE123456789',address:{line1:'Hafenstraße 5',postcode:'20457',city:'Hamburg',country:'DE'}},
  exemptionReason:'Exonération de TVA, article 262 ter, I du CGI',lines:[line('1','Lampes de bureau',24,89,0,'K')]},
 'reverse-charge':{...base,number:'F-2026-0044',buyer:{name:'Kensington Works Ltd',vatId:'GB123456789',address:{line1:'1 Canal Street',postcode:'M1 3HE',city:'Manchester',country:'GB'}},
  exemptionReason:'Autoliquidation',lines:[line('1','Conseil en design',3,650,0,'AE','DAY')]},
 'credit-note':{...base,type:'381',number:'AV-2026-0003',precedingInvoice:{number:'F-2026-0042',date:'2026-10-27'},lines:[line('1','Remise commerciale sur refonte',1,150)]},
 'deposit-paid':{...base,number:'F-2026-0045',prepaid:600,payment:{...base.payment,terms:'Solde à 30 jours'},lines:[line('1','Identité visuelle',1,2400),line('2','Déclinaisons',3,120)]},
};
