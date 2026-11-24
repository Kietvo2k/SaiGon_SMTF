'use strict';
const fs = require('node:fs');
const path = require('node:path');
const PW = process.env.PW_MODULE || 'C:/Users/Admin/AppData/Roaming/npm/node_modules/@playwright/mcp/node_modules/playwright';
const CHROME = process.env.PW_CHROME || 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe';
const { chromium } = require(PW);
const ROOT = path.resolve(__dirname, '..');
const ACCOUNTS = path.join(ROOT, 'outputs/smart-traffic/backend/app/seed/accounts.json');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const list = JSON.parse(fs.readFileSync(ACCOUNTS, 'utf8'));
  const acc = ['admin', 'commander', 'officer'].map(r => list.find(a => a.role === r)).find(Boolean);
  const token = (await (await fetch('http://127.0.0.1:8940/api/v1/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: acc.username, password: acc.password }) })).json()).access_token;
  const browser = await chromium.launch({ headless: true, executablePath: CHROME });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  let n = 0, bytes = 0;
  cdp.on('Network.webSocketCreated', e => console.log('WS created', e.url));
  cdp.on('Network.webSocketHandshakeResponseReceived', e => console.log('WS handshake', e.response.status));
  cdp.on('Network.webSocketFrameReceived', e => { n++; bytes += Buffer.byteLength(String(e.response.payloadData || ''), 'utf8'); });
  await page.addInitScript(t => { try { sessionStorage.setItem('smart_token_officer', t); } catch (e) {} }, token);
  await page.addInitScript(rb => {
    const reb = s => String(s).replace(rb.from, rb.to);
    const rebWs = s => String(s).replace(rb.fromWs, rb.toWs);
    const of = window.fetch;
    window.fetch = function (input, init) {
      try {
        if (typeof input === 'string') input = reb(input);
        else if (input && typeof input.url === 'string') input = new Request(reb(input.url), input);
      } catch (e) {}
      return of.call(this, input, init);
    };
    const OW = window.WebSocket;
    const WS = function (url, protocols) { return protocols === undefined ? new OW(rebWs(url)) : new OW(rebWs(url), protocols); };
    WS.prototype = OW.prototype;
    for (const k of ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED']) WS[k] = OW[k];
    window.WebSocket = WS;
  }, { from: 'http://127.0.0.1:8900', to: 'http://127.0.0.1:8940', fromWs: 'ws://127.0.0.1:8900', toWs: 'ws://127.0.0.1:8940' });
  await ctx.route('http://127.0.0.1:8900/**', r => r.continue({ url: r.request().url().replace('http://127.0.0.1:8900', 'http://127.0.0.1:8940') }).catch(() => r.continue()));
  await page.goto('http://127.0.0.1:5173/index-officer.html', { waitUntil: 'load' });
  await sleep(15000);
  console.log('app?', await page.evaluate(() => !!document.querySelector('.app')), 'frames', n, 'bytes', bytes);
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });