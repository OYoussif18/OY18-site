#!/usr/bin/env node
/* OY18 — layout probe: find what actually creates trailing document height,
   plus the caret/cursor/smooth-scroll state. Read-only diagnostics. */
'use strict';
const { spawn } = require('child_process');
const http = require('http'); const net = require('net'); const crypto = require('crypto');
const PORT = 9401;
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

 await cmd('Page.enable');await cmd('Runtime.enable');
 await cmd('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
 await cmd('Page.navigate',{url:'http://127.0.0.1:8899/'});
 await sleep(2200);
 await ev(`scrollTo({top: document.documentElement.scrollHeight, behavior:'instant'})`);
 await sleep(2500);

 console.log('── TRAILING HEIGHT ANALYSIS (desktop 1440) ──');
 console.log(await ev(`(() => {
   const docH = document.documentElement.scrollHeight;
   const vh = innerHeight;
   const maxScroll = docH - vh;
   const body = document.body;
   const html = document.documentElement;

   // walk every element and report any whose bottom edge exceeds the content end
   const all = [...document.querySelectorAll('body *')];
   const contentEnd = Math.max(...all.map(e => {
     const r = e.getBoundingClientRect();
     return r.bottom + scrollY;
   }));
   const offenders = [];
   for (const e of all) {
     const r = e.getBoundingClientRect();
     const bottom = r.bottom + scrollY;
     if (bottom > contentEnd - 1) {
       offenders.push({
         sel: e.tagName.toLowerCase() + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\\s+/).join('.') : ''),
         bottom: Math.round(bottom), h: Math.round(r.height),
         pos: getComputedStyle(e).position
       });
     }
   }
   return JSON.stringify({
     docH, vh, maxScroll,
     bodyH: Math.round(body.getBoundingClientRect().height),
     bodyMarginBottom: getComputedStyle(body).marginBottom,
     bodyPadBottom: getComputedStyle(body).paddingBottom,
     htmlH: Math.round(html.getBoundingClientRect().height),
     lastSectionBottom: Math.round(document.querySelector('main > section:last-child').getBoundingClientRect().bottom + scrollY),
     closingH: Math.round((document.querySelector('.closing')||{getBoundingClientRect:()=>({height:0})}).getBoundingClientRect().height),
     closingBottom: Math.round((document.querySelector('.closing')||{getBoundingClientRect:()=>({top:0,bottom:0})}).getBoundingClientRect().bottom + scrollY),
     colophonBottom: Math.round(document.querySelector('.colophon').getBoundingClientRect().bottom + scrollY),
     scrollable: maxScroll,
     offendersTail: offenders.slice(-8)
   }, null, 1);
 })()`));

 console.log('\n── CARET / BLINK STATE ──');
 console.log(await ev(`(() => {
   const c = document.querySelector('.hero__caret');
   if (!c) return 'NO CARET';
   const s = getComputedStyle(c);
   const r = c.getBoundingClientRect();
   return JSON.stringify({
     exists: true, animName: s.animationName, animDur: s.animationDuration,
     animTiming: s.animationTimingFunction, animIter: s.animationIterationCount,
     opacity: s.opacity, w: Math.round(r.width), h: Math.round(r.height),
     bg: s.backgroundColor, inlineSize: s.width, blockSize: s.height
   }, null, 1);
 })()`));

 console.log('\n── BLINK KEYFRAMES (live, via CSSOM) ──');
 console.log(await ev(`(() => {
   for (const sheet of document.styleSheets) {
     let rules; try { rules = sheet.cssRules; } catch(e) { continue; }
     for (const r of rules) {
       if (r.type === CSSRule.KEYFRAMES_RULE) {
         const frames = [...r.cssRules].map(k => k.keyText + '{' + k.style.cssText + '}').join(' ');
         console.log(r.name, frames);
       }
     }
   }
   return 'see console above';
 })()`));

 console.log('\n── PORT BORDERS (issue 11) ──');
 console.log(await ev(`JSON.stringify([...document.querySelectorAll('.port')].map(p => ({
   name: p.querySelector('.port__name').textContent,
   borderBottom: getComputedStyle(p).borderBottomWidth + ' ' + getComputedStyle(p).borderBottomColor
 })))`));

 console.log('\n── SMOOTH SCROLL SUPPORT ──');
 console.log(await ev(`JSON.stringify({
   scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior,
   supportsSmooth: CSS.supports('scroll-behavior', 'smooth')
 })`));

 console.log('\n── HERO NAME METRICS ──');
 console.log(await ev(`(() => {
   const n = document.querySelector('.hero__name');
   const s = getComputedStyle(n);
   const r = n.getBoundingClientRect();
   return JSON.stringify({
     fontSize: s.fontSize, weight: s.fontWeight, letterSpacing: s.letterSpacing,
     lineHeight: s.lineHeight, bgImage: s.backgroundImage.slice(0,110),
     w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top)
   }, null, 1);
 })()`));

 ws.close();chrome.kill();process.exit(0);
})().catch(e=>{console.error('FAIL',e);process.exit(1);});