#!/usr/bin/env node
/* OY18 — behavioural probe: caret blink over time, smooth scroll over time,
   hover rules lacking transitions. */
'use strict';
const { spawn } = require('child_process');
const http = require('http'); const net = require('net'); const crypto = require('crypto');
const PORT = 9402;
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

 console.log('── CARET BLINK: sampled opacity over 2.6s ──');
 console.log(await ev(`new Promise(res => {
   const c = document.querySelector('.hero__caret');
   const samples = [];
   const t0 = performance.now();
   function tick() {
     samples.push(+getComputedStyle(c).opacity);
     if (performance.now() - t0 < 2600) requestAnimationFrame(tick);
     else {
       const uniq = [...new Set(samples)];
       // count on/off transitions
       let changes = 0;
       for (let i=1;i<samples.length;i++) if (samples[i]!==samples[i-1]) changes++;
       res(JSON.stringify({
         samples: samples.length,
         distinctValues: uniq,
         onCount: samples.filter(v=>v>0.5).length,
         offCount: samples.filter(v=>v<=0.5).length,
         transitions: changes
       }));
     }
   }
   requestAnimationFrame(tick);
 })`));

 console.log('\n── SMOOTH SCROLL: scrollY over 1.4s after clicking rail link ──');
 const target = await ev(`(() => {
   const a = document.querySelector('[data-rail-link="now"]');
   const r = a.getBoundingClientRect();
   return JSON.stringify({ x: r.x + r.width/2, y: r.y + r.height/2 });
 })()`);
 const t = JSON.parse(target);
 await cmd('Input.dispatchMouseEvent',{type:'mousePressed',x:t.x,y:t.y,button:'left',clickCount:1});
 await cmd('Input.dispatchMouseEvent',{type:'mouseReleased',x:t.x,y:t.y,button:'left',clickCount:1});
 const trace = await ev(`new Promise(res => {
   const s = [];
   const t0 = performance.now();
   (function tick(){
     s.push(Math.round(scrollY));
     if (performance.now()-t0 < 1400) requestAnimationFrame(tick);
     else {
       let maxStep=0; for(let i=1;i<s.length;i++) maxStep=Math.max(maxStep, Math.abs(s[i]-s[i-1]));
       res(JSON.stringify({ from: s[0], to: s[s.length-1], samples: s.length,
         distinctPositions: new Set(s).size, largestSingleFrameJump: maxStep,
         trace: s.filter((_,i)=>i%3===0) }));
     }
   })();
 })`);
 console.log(trace);

 console.log('\n── HOVER RULES WITHOUT A TRANSITION (issue 8 audit) ──');
 console.log(await ev(`(() => {
   const out = [];
   for (const sheet of document.styleSheets) {
     let rules; try { rules = sheet.cssRules; } catch(e) { continue; }
     for (const r of rules) {
       if (!r.selectorText || !r.selectorText.includes(':hover')) continue;
       const sel = r.selectorText;
       // find the base rule for the same selector
       let base = null;
       for (const b of rules) {
         if (!b.selectorText) continue;
         if (b.selectorText === sel.replace(/:hover/g,'').trim()) { base = b; break; }
       }
       const bt = base ? base.style.transition : '';
       out.push({ sel, baseTransition: bt || '(none)', hoverDecl: r.style.cssText.slice(0,70) });
     }
   }
   return JSON.stringify(out, null, 1);
 })()`));

 ws.close();chrome.kill();process.exit(0);
})().catch(e=>{console.error('FAIL',e);process.exit(1);});