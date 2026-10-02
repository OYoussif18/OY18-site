#!/usr/bin/env node
/* OY18 — isolate the frame cost: lattice on vs off, with CPU throttling. */
'use strict';
const { spawn } = require('child_process');
const http = require('http'); const net = require('net'); const crypto = require('crypto');
const PORT = 9399;
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

const measure = `new Promise(res => { const t=[]; let last=performance.now(); let n=0;
  function f(now){ t.push(now-last); last=now; if(++n<100) requestAnimationFrame(f);
    else { t.sort((a,b)=>a-b); res(t[50].toFixed(1)); } }
  requestAnimationFrame(f); })`;

// Long-run sample: let the adaptive governor settle before judging.
const measureSettled = `new Promise(res => { setTimeout(() => { const t=[]; let last=performance.now(); let n=0;
  function f(now){ t.push(now-last); last=now; if(++n<120) requestAnimationFrame(f);
    else { t.sort((a,b)=>a-b); res(JSON.stringify({ median:+t[60].toFixed(1), p95:+t[114].toFixed(1) })); } }
  requestAnimationFrame(f); }, 4000); })`;

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

 for (const rate of [1, 4]) {
   await cmd('Emulation.setCPUThrottlingRate',{rate});
   await cmd('Page.navigate',{url:'http://127.0.0.1:8899/'});
   await sleep(2500);
   const cold = await ev(measure);
   const settled = await ev(measureSettled);
   const q = await ev(`JSON.stringify({
     nodes: (() => { const c=document.querySelector('[data-lattice]');
       const g=c.getContext('2d'); return 'n/a'; })()
   })`);

   // neutralise the lattice draw entirely for the baseline
   await ev(`document.querySelector('[data-lattice]').style.display='none'`);
   await sleep(600);
   const hidden = await ev(measure);

   console.log(`cpu x${rate}`);
   console.log(`   cold (0.5s)   median ${cold}ms`);
   console.log(`   settled (5s)  ${settled}`);
   console.log(`   lattice off   median ${hidden}ms   ->  cost ≈ ${(JSON.parse(settled).median - hidden).toFixed(1)}ms`);

   await cmd('Emulation.setCPUThrottlingRate',{rate:1});
   await cmd('Page.navigate',{url:'http://127.0.0.1:8899/'});
   await sleep(1500);
 }
 ws.close();chrome.kill();process.exit(0);
})().catch(e=>{console.error('FAIL',e);process.exit(1);});
