#!/usr/bin/env node
/* OY18 — precise scroll-easing check: first-frame delta (the "lurch"),
   velocity profile, overshoot, and filter/reflow behaviour. */
'use strict';
const { spawn } = require('child_process');
const http = require('http'); const net = require('net'); const crypto = require('crypto');
const PORT = 9403;
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

const results = [];
const check=(n,p,d)=>{results.push(p); console.log(`${p?'PASS':'FAIL'}  ${n}${d?'  — '+d:''}`);};

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

 // start recording BEFORE the click so frame 1 is captured
 console.log('── SCROLL EASING ──');
 const trace = await ev(`new Promise(res => {
   const rec = [];
   let stop = false;
   (function sample(){ rec.push(Math.round(scrollY)); if(!stop) requestAnimationFrame(sample); })();
   // click the rail link to "now"
   const a = document.querySelector('[data-rail-link="now"]');
   const r = a.getBoundingClientRect();
   const x = r.x + r.width/2, y = r.y + r.height/2;
   a.dispatchEvent(new MouseEvent('click', {bubbles:true, clientX:x, clientY:y, cancelable:true}));
   const t0 = performance.now();
   setTimeout(()=>{ stop = true;
     const deltas = [];
     for (let i=1;i<rec.length;i++) deltas.push(Math.abs(rec[i]-rec[i-1]));
     const start = rec[0], end = rec[rec.length-1];
     const peak = Math.max(...deltas, 0);
     // first 12 deltas show the ease-in
     res(JSON.stringify({
       from:start, to:end, frames:rec.length,
       firstDeltas: deltas.slice(0,12),
       firstFrameDelta: deltas[0]||0,
       peakDelta: peak,
       maxAsFractionOfTotal: +(peak/Math.max(1,Math.abs(end-start))).toFixed(3),
       overshoot: end > rec[rec.length-1] ? 0 : 0,
       monotonic: deltas.every((d,i)=> i===0 || true) && rec.every((v,i)=> i===0 || v >= rec[i-1]-1)
       ? 'yes' : 'no',
       totalMs: Math.round(performance.now()-t0)
     }));
   }, 1600);
 })`);
 const tr = JSON.parse(trace);
 console.log('  ', JSON.stringify(tr));
 check('scroll has no single-frame lurch (>12% of distance)', tr.maxAsFractionOfTotal < 0.12, `peak=${tr.peakDelta}px = ${(tr.maxAsFractionOfTotal*100).toFixed(1)}% of ${Math.abs(tr.to-tr.from)}px`);
 check('scroll is monotonic (no overshoot)', tr.monotonic === 'yes');
 console.log('\n── TWEEN DURATION (measured to settle, not the sample window) ──');
 await ev(`scrollTo({top:0, behavior:'instant'})`); await sleep(600);
 for (const [sec, label] of [['now','short hop'],['contact','long jump']]) {
   const d = JSON.parse(await ev(`new Promise(res=>{
     const a=document.querySelector('[data-rail-link="${sec}"]');
     const r=a.getBoundingClientRect(); const t0=performance.now(); const y0=scrollY;
     a.dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:r.x+r.width/2,clientY:r.y+r.height/2,cancelable:true}));
     let last=scrollY, still=0, settledAt=0;
     (function chk(){
       if (Math.abs(scrollY-last)<0.5){ still++; if(still>4 && !settledAt) settledAt=performance.now()-t0; }
       else { still=0; last=scrollY; }
       if(performance.now()-t0<2500) requestAnimationFrame(chk);
       else res(JSON.stringify({ ms: Math.round(settledAt||0), dist: Math.abs(scrollY-y0),
         landedOn: Math.round(document.getElementById('${sec}').getBoundingClientRect().top) }));
     })();
   })`));
   console.log(`  ${label}: ${d.ms}ms over ${d.dist}px, landed at ${d.landedOn}px (rail offset 75)`);
   check(`tween duration in deliberate band (${label})`, d.ms >= 380 && d.ms <= 1000, `${d.ms}ms`);
   check(`lands on section top with rail offset (${label})`, Math.abs(d.landedOn - 75) <= 3, `${d.landedOn}px`);
   await ev(`scrollTo({top:0, behavior:'instant'})`); await sleep(500);
 }

 console.log('\n── FILTER / REFLOW ──');
 await ev(`scrollTo({top: document.getElementById('now').getBoundingClientRect().top+scrollY, behavior:'instant'})`);
 await sleep(900);
 const filterTrace = await ev(`new Promise(res => {
   const items = [...document.querySelectorAll('.now__item')];
   const btn = document.querySelector('[data-now-filter="building"]');
   const frames = [];
   let stop = false;
   (function s(){
     frames.push(items.map(i => {
       const cs = getComputedStyle(i);
       return { h: i.hidden ? 'h' : Math.round(+cs.opacity*100)/100, t: cs.transform === 'none' ? 'n' : cs.transform.match(/,\\s*([\\d.]+)\\)$/)?.[1] || 'm' };
     }));
     if(!stop) requestAnimationFrame(s);
   })();
   btn.click();
   setTimeout(()=>{ stop=true;
     // was any item ever stuck invisible?
     const stuck = items.filter(i => !i.hidden && +getComputedStyle(i).opacity < 0.99);
     res(JSON.stringify({ frames:frames.length,
       stuckInvisible: stuck.length,
       visibleCount: items.filter(i=>!i.hidden).length,
       finalOps: items.filter(i=>!i.hidden).map(i=>Math.round(+getComputedStyle(i).opacity*100))
     }));
   }, 1400);
 })`);
 console.log('  ', filterTrace);
 const ft = JSON.parse(filterTrace);
 check('filter leaves no item stranded invisible', ft.stuckInvisible === 0, JSON.stringify(ft));
 check('filter shows exactly 1 building item', ft.visibleCount === 1);

 // reset to All and confirm recovery
 await ev(`document.querySelector('[data-now-filter="all"]').click()`);
 await sleep(1200);
 const reset = await ev(`JSON.stringify({ visible: [...document.querySelectorAll('.now__item')].filter(i=>!i.hidden).length,
   stuck: [...document.querySelectorAll('.now__item')].filter(i=>!i.hidden && +getComputedStyle(i).opacity < 0.99).length })`);
 console.log('  after reset:', reset);
 check('filter resets to all 5 items', JSON.parse(reset).visible === 5, reset);
 check('no items stranded after reset', JSON.parse(reset).stuck === 0);

 console.log('\n── CLOSING STATE ──');
 await ev(`scrollTo({top: document.documentElement.scrollHeight, behavior:'instant'})`);
 await sleep(2000);
 console.log('  ', await ev(`(() => {
   const c = document.querySelector('.closing');
   const cv = document.querySelector('[data-closing-canvas]');
   const g = cv.getContext('2d');
   const d = g.getImageData(0,0,cv.width,cv.height).data;
   let painted=0, warm=0;
   for (let i=0;i<d.length;i+=4){ if(d[i+3]>8) painted++; if(d[i]>d[i+2]+10 && d[i+3]>8) warm++; }
   return JSON.stringify({ cls:c.className, opacity:getComputedStyle(c).opacity,
     h:Math.round(c.getBoundingClientRect().height), paintedPx:painted, warmPx:warm });
 })()`));

 console.log('\n' + results.filter(Boolean).length + '/' + results.length + ' passed');
 ws.close();chrome.kill();
 process.exit(results.every(Boolean)?0:1);
})().catch(e=>{console.error('FAIL',e);process.exit(1);});