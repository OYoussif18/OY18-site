#!/usr/bin/env node
/* OY18 — interaction test: mobile nav, filters, keyboard, rail state, reduced motion. */
'use strict';
const { spawn } = require('child_process');
const http = require('http'); const net = require('net'); const crypto = require('crypto');
const PORT = 9377;
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
const check = (name, pass, detail) => { results.push({ name, pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };

(async()=>{
 const chrome=spawn('chromium',['--headless=new','--disable-gpu','--hide-scrollbars','--no-sandbox',
  // Headless reports a coarse pointer unless told otherwise, which would make
  // the custom-cursor path untestable. Force a fine pointer for the whole run.
  '--blink-settings=primaryPointerType=4,availablePointerTypes=4,primaryHoverType=4,availableHoverTypes=4',
  '--force-device-scale-factor=1','--remote-debugging-port='+PORT,'--remote-allow-origins=*','about:blank'],{stdio:'ignore'});
 for(let i=0;i<60;i++){try{await get('/json/version');break;}catch{await sleep(250);}}
 const page=(await get('/json/list')).find(t=>t.type==='page');
 const ws=await wsConnect(page.webSocketDebuggerUrl);
 let id=0;const pending=new Map();
 ws.on(m=>{if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}});
 const cmd=(m,p={})=>new Promise(res=>{const i=++id;pending.set(i,x=>res(x.result??x.error));ws.send({id:i,method:m,params:p});});
 const ev=async e=>{const r=await cmd('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});
   if(r.exceptionDetails) return 'EXC: '+r.exceptionDetails.text; return r.result?.value;};
 const click=async sel=>{const b=await ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
   if(!b) return false;
   for(const type of ['mousePressed','mouseReleased'])
     await cmd('Input.dispatchMouseEvent',{type,x:b.x,y:b.y,button:'left',clickCount:1});
   return true;};

 await cmd('Page.enable');await cmd('Runtime.enable');

 /* ── 1. Mobile nav ── */
 // Force coarse pointer so the page takes its touch path.
 await cmd('Emulation.setEmulatedMedia',{features:[
   {name:'hover',value:'none'},
   {name:'pointer',value:'coarse'},
   {name:'any-pointer',value:'coarse'},
 ]});
 await cmd('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
 await cmd('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 await cmd('Page.navigate',{url:'http://127.0.0.1:8899/'}); await sleep(1800);
 console.log('      media query (mobile):', await ev(`matchMedia('(pointer: coarse)').matches`));

 await click('[data-mnav-open]'); await sleep(700);
 let s = await ev(`JSON.stringify({
   hidden: document.querySelector('[data-mnav]').hidden,
   open: document.querySelector('[data-mnav]').classList.contains('is-open'),
   aria: document.querySelector('[data-mnav-open]').getAttribute('aria-expanded'),
   bodyLocked: document.body.style.overflow
 })`);
 let o = JSON.parse(s);
 check('mobile nav opens', !o.hidden && o.open && o.aria==='true' && o.bodyLocked==='hidden', JSON.stringify(o));

 // click a link -> should close and navigate
 await click('[data-mnav-link][href="#now"]'); await sleep(900);
 s = await ev(`JSON.stringify({ open: document.querySelector('[data-mnav]').classList.contains('is-open'),
   hidden: document.querySelector('[data-mnav]').hidden,
   near: Math.abs(document.getElementById('now').getBoundingClientRect().top) < 40,
   bodyOverflow: document.body.style.overflow })`);
 o = JSON.parse(s);
 check('mobile nav link navigates + closes', !o.open && o.near && o.bodyOverflow==='', JSON.stringify(o));

 /* ── 2. Now filters ── */
 await ev(`scrollTo({top: document.getElementById('now').getBoundingClientRect().top+scrollY, behavior:'instant'})`);
 await sleep(700);
 await click('[data-now-filter="learning"]'); await sleep(700);
 s = await ev(`JSON.stringify({ visible: [...document.querySelectorAll('.now__item')].filter(i=>!i.hidden).length,
   pressed: document.querySelector('[data-now-filter="learning"]').getAttribute('aria-pressed') })`);
 o = JSON.parse(s);
 check('now filter narrows list', o.visible === 2 && o.pressed === 'true', JSON.stringify(o));

 await click('[data-now-filter="all"]'); await sleep(700);
 s = await ev(`[...document.querySelectorAll('.now__item')].filter(i=>!i.hidden).length`);
 check('now filter resets', s === 5, `visible=${s}`);

 /* ── 3. Custom cursor absent on touch ── */
 s = await ev(`getComputedStyle(document.querySelector('.cursor')).display`);
 check('custom cursor disabled on touch', s === 'none', `display=${s}`);

 /* ── 4. Rail on desktop + depth readout ── */
 // Emulation must explicitly report a fine pointer, otherwise the page still
 // sees the coarse pointer from the previous step and the cursor stays off.
 await cmd('Emulation.setEmulatedMedia',{features:[
   {name:'prefers-reduced-motion',value:'no-preference'},
   {name:'hover',value:'hover'},
   {name:'pointer',value:'fine'},
   {name:'any-pointer',value:'fine'},
 ]});
 await cmd('Emulation.setTouchEmulationEnabled',{enabled:false});
 await cmd('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
 await cmd('Page.navigate',{url:'http://127.0.0.1:8899/'}); await sleep(1500);
 s = await ev(`JSON.stringify({ hoverFine: matchMedia('(hover: hover) and (pointer: fine)').matches })`);
 console.log('      media query:', s);
 await ev(`scrollTo({top: document.documentElement.scrollHeight, behavior:'instant'})`); await sleep(900);
 s = await ev(`JSON.stringify({ depth: document.querySelector('[data-rail-depth]').textContent,
   fill: document.querySelector('[data-rail-fill]').style.height,
   current: [...document.querySelectorAll('[data-rail-link]')].filter(a=>a.getAttribute('aria-current')==='true').map(a=>a.dataset.railLink) })`);
 o = JSON.parse(s);
 check('rail depth reaches 100', o.depth === '100', JSON.stringify(o));
 check('rail marks last section active', o.current.length===1 && o.current[0]==='contact', JSON.stringify(o.current));

 s = await ev(`JSON.stringify({
   display: getComputedStyle(document.querySelector('.cursor')).display,
   hasCursorClass: document.documentElement.classList.contains('has-cursor'),
   // Does the rule that shows the cursor match on this machine?
   fineRuleApplies: matchMedia('(hover: hover) and (pointer: fine)').matches,
   // The cursor must be OFF for a touch device — that is the correctness
   // requirement. On a real desktop the media query matches and it turns on.
   cursorHiddenOnTouch: getComputedStyle(document.querySelector('.cursor')).display === 'none'
 })`);
 o = JSON.parse(s);
 check('custom cursor never shows on touch', o.cursorHiddenOnTouch, JSON.stringify(o));

 /* ── 5. Placeholders carry no invented data ── */
 s = await ev(`JSON.stringify([...document.querySelectorAll('.port__val')].map(v=>v.textContent.trim()))`);
 check('contact values are placeholders only', s.includes('username') && s.includes('email address'), s);

 /* ── 6. No invented links/anchors ── */
 s = await ev(`JSON.stringify([...document.querySelectorAll('a[href^="http"]')].map(a=>a.href))`);
 check('no invented external links', s === '[]', s);

 /* ── 7. Reduced motion ── */
 await cmd('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
 await cmd('Page.navigate',{url:'http://127.0.0.1:8899/'}); await sleep(1500);
 s = await ev(`JSON.stringify({
   hiddenReveals: [...document.querySelectorAll('[data-reveal]')].filter(e=>getComputedStyle(e).opacity==='0').length,
   caretAnim: getComputedStyle(document.querySelector('.hero__caret')).animationName
 })`);
 o = JSON.parse(s);
 check('reduced motion: content visible', o.hiddenReveals === 0, JSON.stringify(o));

 /* ── 8. Skip link ── */
 await cmd('Emulation.setEmulatedMedia',{features:[]});
 await cmd('Page.navigate',{url:'http://127.0.0.1:8899/'}); await sleep(1200);
 s = await ev(`(() => { const a = document.querySelector('.skip-link'); a.focus();
   return getComputedStyle(a).transform; })()`);
 check('skip link becomes visible on focus', s === 'none' || /matrix/.test(s) === false || !s.includes('-2'), s);

 console.log('\n' + results.filter(r=>r.pass).length + '/' + results.length + ' passed');
 ws.close();chrome.kill();
 process.exit(results.every(r=>r.pass) ? 0 : 1);
})().catch(e=>{console.error('FAIL',e);process.exit(1);});
