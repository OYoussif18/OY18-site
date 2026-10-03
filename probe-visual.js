#!/usr/bin/env node
/* OY18 — hover-state capture: the solid button mid-hover, and the closing mark. */
'use strict';
const { spawn } = require('child_process');
const http=require('http'),net=require('net'),crypto=require('crypto'),fs=require('fs');
const PORT=9412;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const get=p=>new Promise((res,rej)=>{http.get({host:'127.0.0.1',port:PORT,path:p},r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>res(JSON.parse(d)));}).on('error',rej);});
function ws(u){return new Promise((resolve,reject)=>{const U=new URL(u),k=crypto.randomBytes(16).toString('base64');
const s=net.connect(+U.port,U.hostname,()=>{s.write(`GET ${U.pathname}${U.search} HTTP/1.1\r\nHost: ${U.host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${k}\r\nSec-WebSocket-Version: 13\r\n\r\n`);});
let b=Buffer.alloc(0),up=false,hs=[];s.on('data',c=>{b=Buffer.concat([b,c]);
if(!up){const i=b.indexOf('\r\n\r\n');if(i<0)return;up=true;b=b.subarray(i+4);resolve(api);}
while(b.length>=2){const l0=b[1]&127;let o=2,l=l0;if(l0===126){l=b.readUInt16BE(2);o=4;}else if(l0===127){l=Number(b.readBigUInt64BE(2));o=10;}
if(b.length<o+l)break;try{hs.forEach(h=>h(JSON.parse(b.subarray(o,o+l).toString())));}catch{}b=b.subarray(o+l);}});
s.on('error',reject);
const api={send(x){const d=Buffer.from(JSON.stringify(x)),m=crypto.randomBytes(4);let h;
if(d.length<126)h=Buffer.from([0x81,0x80|d.length]);else{h=Buffer.alloc(4);h[0]=0x81;h[1]=0x80|126;h.writeUInt16BE(d.length,2);}
const md=Buffer.alloc(d.length);for(let i=0;i<d.length;i++)md[i]=d[i]^m[i%4];s.write(Buffer.concat([h,m,md]));},on:f=>hs.push(f),close:()=>s.end()};});}

(async()=>{
const c=spawn('chromium',['--headless=new','--disable-gpu','--hide-scrollbars','--no-sandbox','--force-device-scale-factor=1','--remote-debugging-port='+PORT,'--remote-allow-origins=*','about:blank'],{stdio:'ignore'});
for(let i=0;i<60;i++){try{await get('/json/version');break;}catch{await sleep(250);}}
const pg=(await get('/json/list')).find(t=>t.type==='page');const w=await ws(pg.webSocketDebuggerUrl);
let id=0;const pend=new Map();
w.on(m=>{if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id);}});
const cmd=(m,p={})=>new Promise(r=>{const i=++id;pend.set(i,x=>r(x.result??x.error));w.send({id:i,method:m,params:p});});
const ev=async e=>(await cmd('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true})).result?.value;
const shot=async n=>{const{data}=await cmd('Page.captureScreenshot',{format:'png'});
  fs.writeFileSync('/tmp/oy18-shots/'+n+'.png',Buffer.from(data,'base64'));};

await cmd('Page.enable');await cmd('Runtime.enable');
await cmd('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
await cmd('Page.navigate',{url:'http://127.0.0.1:8899/'});await sleep(2200);

// force the solid button into its hover end-state and screenshot just the button
const box = JSON.parse(await ev(`(() => {
  const b = document.querySelector('.btn--solid');
  const r = b.getBoundingClientRect();
  return JSON.stringify({ x:r.x, y:r.y, w:r.width, h:r.height });
})()`));
await cmd('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:3,mobile:false});
await ev(`(() => {
  const b = document.querySelector('.btn--solid');
  // emulate :hover by forcing the same declarations the hover rule applies
  const cs = getComputedStyle(b);
  b.dataset.testHover = '1';
  const st = document.createElement('style');
  st.textContent = '.btn--solid::before{transform:translateY(0)!important;}' +
                   '.btn--solid{color:#17120a !important;}';
  st.id = 'testhover';
  document.head.appendChild(st);
})()`);
await sleep(400);
const clip = await ev(`(() => { const r = document.querySelector('.btn--solid').getBoundingClientRect();
  return JSON.stringify({ x: Math.round(r.x)-20, y: Math.round(r.y)-20, width: Math.round(r.width)+40, height: Math.round(r.height)+40, scale: 3 }); })()`);
const cl = JSON.parse(clip);
const shotData = await cmd('Page.captureScreenshot',{format:'png',clip:{x:cl.x,y:cl.y,width:cl.width,height:cl.height,scale:3}});
fs.writeFileSync('/tmp/oy18-shots/btn-hover.png',Buffer.from(shotData.data,'base64'));
console.log('button hover captured', JSON.stringify(cl));

// restore, then capture the closing state at the true page bottom
await cmd('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
await cmd('Page.navigate',{url:'http://127.0.0.1:8899/'});await sleep(2000);
await ev(`scrollTo({top: document.documentElement.scrollHeight, behavior:'instant'})`);
await sleep(2600);
await shot('closing-desktop');

// closing state with the pointer parked inside it (proximity response)
const cb = JSON.parse(await ev(`(() => { const r=document.querySelector('.closing').getBoundingClientRect();
  return JSON.stringify({ x: r.x + r.width*0.5, y: r.y + r.height*0.5 }); })()`));
for (let i=0;i<14;i++){
  await cmd('Input.dispatchMouseEvent',{type:'mouseMoved',x:cb.x-70+i*11,y:cb.y+((i%3)-1)*7});
  await sleep(70);
}
await sleep(500);
await shot('closing-cursor');

// mobile bottom
await cmd('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
await cmd('Page.navigate',{url:'http://127.0.0.1:8899/'});await sleep(1800);
await ev(`scrollTo({top: document.documentElement.scrollHeight, behavior:'instant'})`);
await sleep(2400);
await shot('closing-mobile');

w.close();c.kill();process.exit(0);})().catch(e=>{console.error('FAIL',e);process.exit(1);});