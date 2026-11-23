import {test} from 'node:test';
import assert from 'node:assert/strict';
import {publicSite,WEB_FONTS} from '../tmp/web-fonts.mjs';

test('open fonts are fetched on a public https site only',()=>{
 const at=(protocol,hostname)=>publicSite({protocol,hostname});
 assert.equal(at('https:','bide.example.com'),true);
 assert.equal(at('https:','demo.someone.chatgpt.site'),true);
 // Opened from this computer or the office network: offline.
 for(const host of ['localhost','app.localhost','127.0.0.1','192.168.1.20','10.0.0.4','172.20.3.1','169.254.1.1','office-pc','nas.local','printer.lan','[::1]'])assert.equal(at('https:',host),false,host);
 assert.equal(at('http:','bide.example.com'),false);
 assert.equal(at('file:',''),false);
 assert.equal(publicSite(undefined),false);
 // No window here: off.
 assert.equal(WEB_FONTS,false);
});
