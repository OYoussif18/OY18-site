#!/usr/bin/env node
/* OY18 — verification sweep.
   Screenshots each section at four widths and reports console errors.
   Uses the Chrome DevTools Protocol over the built-in chromium binary. */
'use strict';
const { spawn, execSync } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const URL_ = process.argv[2] || 'http://127.0.0.1:8899/';
const OUT  = '/tmp/oy18-shots';
const PORT = 9333;

const SECTIONS = ['signal', 'interests', 'about', 'now', 'status', 'contact'];
const VIEWPORTS = [
  { name: 'd', w: 1440, h: 900,  touch: false },
  { name: 'l', w: 1280, h: 720,  touch: false },
  { name: 't', w: 834,  h: 1112, touch: true  },
  { name: 'm', w: 390,  h: 844,  touch: true  },
];

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const get  = (p) => new Promise((res, rej) => {
  http.get({ host: '127.0.0.1', port: PORT, path: p }, r => {
    let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
  }).on('error', rej);
});

/* Minimal WebSocket client (no deps) — CDP speaks JSON over a socket. */
const net = require('net');
const crypto = require('crypto');
function wsConnect(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const key = crypto.randomBytes(16).toString('base64');
    const sock = net.connect(+u.port, u.hostname, () => {
      sock.write(
        `GET ${u.pathname}${u.search} HTTP/1.1\r\nHost: ${u.host}\r\n` +
        `Upgrade: websocket\r\nConnection: Upgrade\r\n` +
        `Sec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`
      );
    });
    let buf = Buffer.alloc(0), upgraded = false;
    const handlers = [];
    sock.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      if (!upgraded) {
        const i = buf.indexOf('\r\n\r\n');
        if (i < 0) return;
        upgraded = true; buf = buf.subarray(i + 4); resolve(api);
      }
      while (buf.length >= 2) {
        const len0 = buf[1] & 127;
        let off = 2, len = len0;
        if (len0 === 126) { len = buf.readUInt16BE(2); off = 4; }
        else if (len0 === 127) { len = Number(buf.readBigUInt64BE(2)); off = 10; }
        if (buf.length < off + len) break;
        const payload = buf.subarray(off, off + len).toString();
        buf = buf.subarray(off + len);
        try { const msg = JSON.parse(payload); handlers.forEach(h => h(msg)); } catch {}
      }
    });
    sock.on('error', reject);
    const api = {
      send(obj) {
        const data = Buffer.from(JSON.stringify(obj));
        const mask = crypto.randomBytes(4);
        let head;
        if (data.length < 126) head = Buffer.from([0x81, 0x80 | data.length]);
        else if (data.length < 65536) {
          head = Buffer.alloc(4); head[0] = 0x81; head[1] = 0x80 | 126; head.writeUInt16BE(data.length, 2);
        } else {
          head = Buffer.alloc(10); head[0] = 0x81; head[1] = 0x80 | 127; head.writeBigUInt64BE(BigInt(data.length), 2);
        }
        const masked = Buffer.alloc(data.length);
        for (let i = 0; i < data.length; i++) masked[i] = data[i] ^ mask[i % 4];
        sock.write(Buffer.concat([head, mask, masked]));
      },
      on: (fn) => handlers.push(fn),
      close: () => sock.end(),
    };
  });
}

(async () => {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  const chrome = spawn('chromium', [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-sandbox',
    '--force-device-scale-factor=1', '--remote-debugging-port=' + PORT,
    '--remote-allow-origins=*', 'about:blank',
  ], { stdio: 'ignore' });

  // wait for devtools
  for (let i = 0; i < 60; i++) {
    try { await get('/json/version'); break; } catch { await sleep(250); }
  }

  const targets = await get('/json/list');
  const page = targets.find(t => t.type === 'page');
  const ws = await wsConnect(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const events = [];
  ws.on((msg) => {
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    if (msg.method) events.push(msg);
  });
  const cmd = (method, params = {}) => new Promise((res) => {
    const myId = ++id;
    pending.set(myId, (m) => res(m.result ?? m.error));
    ws.send({ id: myId, method, params });
  });

  const report = { errors: [], failed: [], console: [], metrics: {} };

  for (const vp of VIEWPORTS) {
    events.length = 0;
    await cmd('Page.enable');
    await cmd('Runtime.enable');
    await cmd('Log.enable');
    await cmd('Network.enable');
    await cmd('Emulation.setDeviceMetricsOverride', {
      width: vp.w, height: vp.h, deviceScaleFactor: 1, mobile: vp.touch,
    });
    await cmd('Page.navigate', { url: URL_ });
    await sleep(1800);

    // scroll through the page to trigger every reveal, then return to each section
    const H = (await cmd('Runtime.evaluate', {
      expression: 'document.documentElement.scrollHeight', returnByValue: true })).result.value;

    for (const sec of SECTIONS) {
      await cmd('Runtime.evaluate', {
        expression: `(() => { const el = document.getElementById('${sec}');
          if (el) scrollTo({ top: el.getBoundingClientRect().top + scrollY, behavior: 'instant' }); })()`,
      });
      await sleep(900);
      const { data } = await cmd('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(OUT, `${vp.name}-${sec}.png`), Buffer.from(data, 'base64'));
    }

    // metrics at this width
    const m = (await cmd('Runtime.evaluate', {
      expression: `JSON.stringify({
        scrollW: document.documentElement.scrollWidth,
        innerW: innerWidth,
        overflowX: document.documentElement.scrollWidth > innerWidth + 1,
        unrevealed: [...document.querySelectorAll('[data-reveal]')].filter(e => !e.classList.contains('is-in')).length,
        heroChars: document.querySelectorAll('h1 .ch').length,
        rail: getComputedStyle(document.querySelector('.rail')).display,
        mnav: getComputedStyle(document.querySelector('.mnav__trigger')).display
      })`, returnByValue: true })).result.value;
    report.metrics[vp.name] = JSON.parse(m);

    for (const e of events) {
      if (e.method === 'Runtime.exceptionThrown')
        report.errors.push(`[${vp.name}] ${e.params.exceptionDetails.text} ${e.params.exceptionDetails.exception?.description || ''}`.slice(0, 300));
      if (e.method === 'Log.entryAdded' && e.params.entry.level === 'error')
        report.errors.push(`[${vp.name}] log: ${e.params.entry.text}`.slice(0, 300));
      if (e.method === 'Network.loadingFailed')
        report.failed.push(`[${vp.name}] ${e.params.errorText} ${e.params.type}`);
      if (e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error')
        report.console.push(`[${vp.name}] ${e.params.args.map(a => a.value).join(' ')}`.slice(0, 300));
    }
  }

  console.log('METRICS');
  for (const [k, v] of Object.entries(report.metrics)) console.log(' ', k, JSON.stringify(v));
  console.log('\nJS ERRORS:', report.errors.length);
  report.errors.forEach(e => console.log('  !', e));
  console.log('CONSOLE ERRORS:', report.console.length);
  report.console.forEach(e => console.log('  !', e));
  console.log('NET FAILURES:', report.failed.length);
  [...new Set(report.failed)].forEach(e => console.log('  !', e));
  console.log('\nSHOTS:', fs.readdirSync(OUT).length);

  ws.close(); chrome.kill();
  process.exit(0);
})().catch(e => { console.error('SWEEP FAILED', e); process.exit(1); });
