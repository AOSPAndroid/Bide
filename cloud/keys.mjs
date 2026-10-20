// Generates the licence signing keys. Keep the private key secret (a server
// secret, LICENCE_PRIVATE_KEY); the public key goes into the app build
// (VITE_LICENCE_PUBLIC_KEY).
//   node cloud/keys.mjs
const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
const privateKey=await crypto.subtle.exportKey('jwk',pair.privateKey),publicKey=await crypto.subtle.exportKey('jwk',pair.publicKey);
console.log('LICENCE_PRIVATE_KEY (server secret):\n'+JSON.stringify(privateKey)+'\n');
console.log('VITE_LICENCE_PUBLIC_KEY (app build):\n'+JSON.stringify({kty:publicKey.kty,crv:publicKey.crv,x:publicKey.x,y:publicKey.y}));
