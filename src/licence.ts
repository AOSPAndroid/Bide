// The subscription licence shared by the licence server (cloud/) and the app:
// a small signed statement of who may use bide, and until when. ECDSA P-256
// (WebCrypto in every current browser and in Workers). The server signs with
// its private key; the app only holds the public key, so it can check a
// licence offline but cannot make one.
export type LicenceStatus='trial'|'active'|'expired';
export type Licence={sub:string;email:string;status:LicenceStatus;trialEnds:number;paidUntil?:number;exp:number};

const algorithm={name:'ECDSA',namedCurve:'P-256'} as const,signing={name:'ECDSA',hash:'SHA-256'} as const;
const encoder=new TextEncoder();
export const base64url=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
export const fromBase64url=(text:string)=>Uint8Array.from(atob(text.replace(/-/g,'+').replace(/_/g,'/')+'==='.slice((text.length+3)%4)),c=>c.charCodeAt(0));

export async function generateLicenceKeys(){
 const pair=await crypto.subtle.generateKey(algorithm,true,['sign','verify']) as CryptoKeyPair;
 return {privateKey:await crypto.subtle.exportKey('jwk',pair.privateKey),publicKey:await crypto.subtle.exportKey('jwk',pair.publicKey)};
}
export const importPrivateKey=(jwk:JsonWebKey)=>crypto.subtle.importKey('jwk',jwk,algorithm,false,['sign']);
export const importPublicKey=(jwk:JsonWebKey)=>crypto.subtle.importKey('jwk',{...jwk,d:undefined,key_ops:['verify']},algorithm,false,['verify']);

// "payload.signature", both base64url.
export async function signLicence(licence:Licence,key:CryptoKey){
 const payload=base64url(encoder.encode(JSON.stringify(licence)));
 const signature=new Uint8Array(await crypto.subtle.sign(signing,key,encoder.encode(payload)));
 return `${payload}.${base64url(signature)}`;
}
// The licence when the signature is genuine and it has not expired, else undefined.
export async function verifyLicence(token:string,key:CryptoKey,now=Date.now()):Promise<Licence|undefined>{
 const [payload,signature]=token.split('.');if(!payload||!signature)return undefined;
 try{
  if(!await crypto.subtle.verify(signing,key,fromBase64url(signature),encoder.encode(payload)))return undefined;
  const licence=JSON.parse(new TextDecoder().decode(fromBase64url(payload))) as Licence;
  return licence.exp>now&&licence.status!=='expired'?licence:undefined;
 }catch{return undefined;}
}

// Whole days left in the trial, rounded up (0 once it has ended).
export const trialDaysLeft=(licence:Pick<Licence,'trialEnds'>,now=Date.now())=>Math.max(0,Math.ceil((licence.trialEnds-now)/86400000));
