'use strict';
const fs = require('node:fs');
const path = require('node:path');
const PW = process.env.PW_MODULE || 'C:/Users/Admin/AppData/Roaming/npm/node_modules/@playwright/mcp/node_modules/playwright';
const CHROME = process.env.PW_CHROME || 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe';
const { chromium } = require(PW);
const ROOT = path.resolve(__dirname, '..');
const ACCOUNTS = path.join(ROOT, 'outputs/smart-traffic/backend/app/seed/accounts.json');
const API = 'http://127.0.0.1:8940';
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const list = JSON.parse(fs.readFileSync(ACCOUNTS, 'utf8'));
  const acc = ['admin', 'commander', 'officer'].map(r => list.find(a => a.role === r)).find(Boolean);
  const res = await fetch(`${API}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: acc.username, password: acc.password }) });
  const token = (await res.json()).access_token;
  console.log('token len', token.length);

  const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--enable-unsafe-webgpu'] });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on('console', m => console.log('CONSOLE', m.type(), m.text().slice(0, 180)));
  page.on('request', r => { if (r.url().includes('api/v1') || r.url().includes('assets')) console.log('REQ', r.url().slice(-60)); });
  page.on('response', r => { if (r.url().includes('api/v1')) console.log('RESP', r.status(), r.url().slice(-60)); });
  await page.addInitScript(t => { try { sessionStorage.setItem('smart_token_officer', t); window.__inj = 'ok'; } catch (e) { window.__injErr = String(e); } }, token);
  await page.goto('http://127.0.0.1:5173/index-officer.html', { waitUntil: 'domcontentloaded' });
  await sleep(1000);
  console.log('after load 1s:', JSON.stringify(await page.evaluate(() => ({ token: !!sessionStorage.getItem('smart_token_officer'), inj: window.__inj, injErr: window.__injErr, login: !!document.querySelector('.login'), app: !!document.querySelector('.app') }))));
  await sleep(5000);
  console.log('after load 6s:', JSON.stringify(await page.evaluate(() => ({ token: !!sessionStorage.getItem('smart_token_officer'), login: !!document.querySelector('.login'), app: !!document.querySelector('.app'), me: !!document.querySelector('.who') }))));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });