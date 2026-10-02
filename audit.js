#!/usr/bin/env node
/* OY18 — payload, performance and accessibility audit. */
'use strict';
const { spawn } = require('child_process');
const http = require('http'); const net = require('net'); const crypto = require('crypto');
const PORT = 9388;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const get = p => new Promise((res, rej) => {
  http.get({ host: '127.0.0.1', port: PORT, path: p }, r => { let d=''; r.on('data',c=>d+=c); r.on('end',()=>res(JSON.parse(d))); }).on('error', rej);
});
function wsConnect(url){return new Promise((resolve,reject)=>{const u=new URL(url),key=crypto.randomBytes(16).toString('base64');
 const sock=net.connect(+u.port,u.hostname,()=>{sock.write(`GET ${u.pathname}${u.search} HTTP/1.1\r\nHost: ${u.host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`);});
 let buf=Buffer.alloc(0),up=false,hs=[];sock.on('data',c=>{buf=Buffer.concat([buf,c]);
  if(!up){const i=buf.indexOf('\r\n\r\n');if(i<0)return;up=true;buf=buf.subarray(i+4);resolve(api);}
  while(buf.length>=2){const l0=buf[1]&127;let off=2,len=l0;
   if(l0===126){len=buf.readUInt16BE(2);off=4;}else if(l0===127){len=Number(buf.readBigUInt64BE(2));off=10;}
   if(buf.length<off+len)break;try{hs.forEach(h=>h(JSON.parse(buf.subarray(off,off+len).toString())));}catch{}buf=buf.subarray(off+len);}});
 sock.on('error',reject);
 const api={send(o){const d=Buffer.from(JSON.stringify(o)),m=crypto.randomBytes(4);let h;
   if(d.length<126)h=Buffer.from([0x81,0x80|d.length]);else{h=Buffer.alloc(4);h[0]=0x81;h[1]=0x80|126;h.writeUInt16BE(d.length,2);}
   const md=Buffer.alloc(d.length);for(let i=0;i<d.length;i++)md[i]=d[i]^m[i%4];sock.write(Buffer.concat([h,m,md]));},
  on:f=>hs.push(f),close:()=>sock.end()};});}

(async()=>{
 const chrome=spawn('chromium',['--headless=new','--disable-gpu','--hide-scrollbars','--no-sandbox',
  '--force-device-scale-factor=1','--remote-debugging-port='+PORT,'--remote-allow-origins=*','about:blank'],{stdio:'ignore'});
 for(let i=0;i<60;i++){try{await get('/json/version');break;}catch{await sleep(250);}}
 const page=(await get('/json/list')).find(t=>t.type==='page');
 const ws=await wsConnect(page.webSocketDebuggerUrl);
 let id=0;const pending=new Map();
 ws.on(m=>{if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}});
 const cmd=(m,p={})=>new Promise(res=>{const i=++id;pending.set(i,x=>res(x.result??x.error));ws.send({id:i,method:m,params:p});});
 const ev=async e=>(await cmd('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true})).result?.value;

 await cmd('Page.enable');await cmd('Runtime.enable');await cmd('Network.enable');
 await cmd('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
 // CPU throttle: 4x slower, representative of a mid-range laptop
 await cmd('Emulation.setCPUThrottlingRate',{rate:4});
 await cmd('Page.navigate',{url:'http://127.0.0.1:8899/'}); await sleep(3500);

 console.log('── PAYLOAD ──');
 console.log(await ev(`JSON.stringify(performance.getEntriesByType('resource')
   .map(r => ({ n: r.name.split('/').slice(-1)[0], kb: +(r.transferSize/1024).toFixed(1) }))
   .concat([{ n: 'index.html', kb: +(performance.getEntriesByType('navigation')[0].transferSize/1024).toFixed(1) }]))`));

 const metrics = JSON.parse(await ev(`JSON.stringify({
   domNodes: document.getElementsByTagName('*').length,
   resources: performance.getEntriesByType('resource').length,
   totalKb: +(performance.getEntriesByType('resource').reduce((a,r)=>a+r.transferSize,0)/1024).toFixed(1),
   scripts: document.querySelectorAll('script[src]').length,
   imgNoAlt: [...document.querySelectorAll('img')].filter(i=>!i.hasAttribute('alt')).length,
   h1: document.querySelectorAll('h1').length,
   landmarks: { main: document.querySelectorAll('main').length, nav: document.querySelectorAll('nav').length,
                footer: document.querySelectorAll('footer').length, header: document.querySelectorAll('header').length },
   sections: document.querySelectorAll('section[id]').length,
   langSet: document.documentElement.lang,
   title: document.title,
   metaDesc: !!document.querySelector('meta[name="description"]')?.content,
   ogImage: !!document.querySelector('meta[property="og:image"]')?.content,
   brokenInternalLinks: [...document.querySelectorAll('a[href^="#"]')]
     .map(a=>a.getAttribute('href')).filter(h=>h!=='#' && !document.querySelector(h)),
   headingOrder: [...document.querySelectorAll('h1,h2,h3')].map(h=>h.tagName),
   ariaCurrent: document.querySelectorAll('[aria-current]').length,
   labelled: [...document.querySelectorAll('a,button')].filter(e=>e.textContent.trim()||e.getAttribute('aria-label')).length,
   totalInteractive: document.querySelectorAll('a,button').length
 })`));
 console.log('\n── STRUCTURE / A11Y ──');
 for (const [k,v] of Object.entries(metrics)) console.log('  ', k+':', JSON.stringify(v));

 console.log('\n── FRAME TIMING (4x CPU throttle) ──');
 const fps = await ev(`new Promise(res => {
   const t = []; let last = performance.now(); let n = 0;
   function f(now){ t.push(now-last); last=now; if(++n < 120) requestAnimationFrame(f);
     else { t.sort((a,b)=>a-b); res(JSON.stringify({ median:+t[60].toFixed(2), p95:+t[114].toFixed(2), max:+t[119].toFixed(2) })); } }
   requestAnimationFrame(f);
 })`);
 console.log('  frame ms:', fps);

 console.log('\n── RENDER-BLOCKING / DOM COST ──');
 console.log(' ', await ev(`JSON.stringify({
   domNodes: document.getElementsByTagName('*').length,
   styleRules: [...document.styleSheets].reduce((a,s)=>{try{return a+s.cssRules.length}catch(e){return a}},0),
   listenersHidden: 0
 })`));

 ws.close();chrome.kill();process.exit(0);
})().catch(e=>{console.error('FAIL',e);process.exit(1);});
