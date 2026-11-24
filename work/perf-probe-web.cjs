// Gỡ lỗi: vì sao trang web công an chưa đăng nhập khi nhồi token vào sessionStorage.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const PW = process.env.PW_MODULE || 'C:/Users/Admin/AppData/Roaming/npm/node_modules/@playwright/mcp/node_modules/playwright';
const CHROME = process.env.PW_CHROME || 'C:/Users/Admin/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe';
const { chromium } = require(PW);
const ROOT = path.resolve(__dirname, '..');
const ACCOUNTS = path.join(ROOT, 'outputs/smart-traffic/backend/app/seed/accounts.json');
const API = 'http://127.0.0.1:8940';

(async () => {
  const list = JSON.parse(fs.readFileSync(ACCOUNTS, 'utf8'));
  const acc = ['admin', 'commander', 'officer'].map(r => list.find(a => a.role === r)).find(Boolean);
  const res = await fetch(`${API}/api/v1/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: acc.username, password: acc.password })
  });
  console.log('login HTTP', res.status);
  const body = await res.json();
  const token = body.access_token;
  console.log('co token:', !!token);
  const meRes = await fetch(`${API}/api/v1/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
  console.log('auth/me HTTP', meRes.status, JSON.stringify(await meRes.json()).slice(0, 200));

  const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--enable-unsafe-webgpu'] });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on('console', m => console.log('CONSOLE', m.type(), m.text().slice(0, 200)));
  page.on('pageerror', e => console.log('PAGEERROR', String(e).slice(0, 300)));
  page.on('response', r => { if (r.url().includes('/api/v1/')) console.log('RESP', r.status(), r.url()); });
  await page.addInitScript(t => { try { sessionStorage.setItem('smart_token_officer', t); } catch (e) {} }, token);
  await page.goto('http://127.0.0.1:5173/index-officer.html', { waitUntil: 'load' });
  await page.waitForTimeout(8000);
  const info = await page.evaluate(() => ({
    token: !!sessionStorage.getItem('smart_token_officer'),
    html: document.body.innerHTML.slice(0, 400),
    login: !!document.querySelector('.login'),
    topbar: !!document.querySelector('.topbar h1'),
    app: !!document.querySelector('.app')
  }));
  console.log(JSON.stringify(info, null, 2));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });