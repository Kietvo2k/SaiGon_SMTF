// demo2-live.cjs — Nghiệm thu demo-v2 trên artifact (local build hoặc production).
// Cách chạy: node work/smtf-agent/demo2-live.cjs <BASE_URL> [--signal-only|--shots-only]
// Kết quả: work/smtf-agent/demo2-live.json + ảnh demo2-*.png + khung 15 camera work/smtf-agent/demo2-cams/CAM-*.jpg
const { writeFileSync, mkdirSync } = require('node:fs');
const { chromium } = require('D:/FilelaptrinhD/MemoryHub/node_modules/.pnpm/playwright-core@1.64.1/node_modules/playwright-core');

const BASE = process.argv[2];
if (!BASE || !/^https?:\/\//.test(BASE)) { console.error('Cần BASE_URL http(s).'); process.exit(1); }
const mode = process.argv[3] || '';
const shots = 'work/smtf-agent';
const camsDir = `${shots}/demo2-cams`;
mkdirSync(camsDir, { recursive: true });
const results = { base: BASE, startedAt: new Date().toISOString(), checks: {}, pass: true };
const fail = (name, detail) => { results.checks[name] = { ...(results.checks[name] || {}), ...detail, status: 'FAIL' }; results.pass = false; };
const ok = (name, detail) => { results.checks[name] = { ...(results.checks[name] || {}), ...detail, status: 'PASS' }; };

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu'],
  });
  try {
    // ---------- Chuẩn bị: mở 3D trước để cảnh nạp (mất ~45 s), trong chờ đó không làm gì khác ----------
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const rec = { requests: [], errors: [], failures: [] };
    page.on('response', r => rec.requests.push([r.status(), r.url()]));
    page.on('requestfailed', r => rec.failures.push([r.url(), r.failure()?.errorText]));
    page.on('pageerror', e => rec.errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') rec.errors.push(m.text()); });

    if (mode !== '--shots-only') {
      // ---------- NAV ----------
      const landing = await page.goto(BASE + '/', { waitUntil: 'load' });
      const title = await page.title();
      const kicker = await page.textContent('.landing-kicker');
      const h1 = await page.textContent('#landing-title');
      await page.screenshot({ path: `${shots}/demo2-landing-1440.png` });
      const navOk = landing.status() === 200 && (h1 || '').includes('đồng nhịp') && !kicker?.includes('MÔ PHỎNG');
      navOk ? ok('nav', { title, kicker, h1 }) : fail('nav', { title, kicker, h1 });

      // ---------- SIGNAL (quan trọng nhất — làm trên 3D trước khi các bước khác đổi trạng thái) ----------
      await page.goto(BASE + '/hcmc-poc/?backend=webgl&demo=vercel', { waitUntil: 'load' });
      await page.waitForSelector('#loading.done', { timeout: 95000 });
      const params = await page.evaluate(() => window.__smartApp?.controller?.getParams?.() ?? null);
      const signal = await page.evaluate(async () => {
        const app = window.__smartApp;
        const traffic = app.traffic, controller = app.controller;
        // Cụm đèn lấy theo cluster_id của signalPlan; stateOf cần CHỈ SỐ nút graph (nodeIds), như inspector.
        const cluster = traffic.net.signalPlan.clusters.find(c => c.cluster_id === 'Bac-02');
        if (!cluster || !cluster.nodeIds.length) return { found: false, reason: 'no-cluster-Bac-02' };
        const node = cluster.nodeIds[0];
        const stateOf = () => controller.stateOf(node, traffic.sim.counters.t);
        const probe = stateOf();
        if (!probe || !probe.phases) return { found: false, reason: 'no-phases' };
        // Ghim pha qua overridePhase để tạo chuỗi đầy đủ: xanh → vàng → đỏ chung → xanh nhóm kia.
        const samples = [];
        const t0 = performance.now();
        let last = 0;
        while (performance.now() - t0 < 52000) {
          const t = traffic.sim.counters.t;
          if (t - last >= 0.09) {   // ~0,1 s: đủ mịn cho pha vàng 3 s (30 mẫu)
            last = t;
            const st = stateOf();
            samples.push({ t: +t.toFixed(2), p0: st.phases[0].phase, p1: st.phases[1].phase, cd0: st.phases[0].countdown_s });
          }
          await new Promise(r => setTimeout(r, 40));
        }
        const runs = idx => {
          const out = [];
          let phase = null, start = null;
          for (const s of samples) {
            const ph = idx === 0 ? s.p0 : s.p1;
            if (ph !== phase) {
              if (phase !== null) out.push([phase, +(s.t - start).toFixed(1)]);
              phase = ph; start = s.t;
            }
          }
          if (phase !== null) out.push([phase, +(samples[samples.length - 1].t - start).toFixed(1)]);
          return out;
        };
        // Đỏ chung: khi CỤM ở pha RED, cả hai nhóm cùng đỏ — mọi đoạn cả-hai-đỏ chính là khoảng an toàn 2 s.
        const bothRedRuns = [];
        let inBothRed = false, bothRedStart = 0;
        for (let i = 1; i < samples.length; i++) {
          const prev = samples[i - 1], cur = samples[i];
          const bothRed = cur.p0 === 'red' && cur.p1 === 'red';
          const prevBothRed = prev.p0 === 'red' && prev.p1 === 'red';
          if (bothRed && !prevBothRed) { inBothRed = true; bothRedStart = cur.t; }
          else if (!bothRed && prevBothRed) { inBothRed = false; bothRedRuns.push(+(cur.t - bothRedStart).toFixed(1)); }
        }
        if (inBothRed) bothRedRuns.push(+(samples[samples.length - 1].t - bothRedStart).toFixed(1));
        return {
          found: true, node: probe.node_id, cluster: probe.cluster_id, cycle_s: probe.cycle_s, mode: probe.mode,
          sampleCount: samples.length, r0: runs(0), r1: runs(1), bothRedRuns,
          first: samples.slice(0, 3), last: samples.slice(-3)
        };
      });
      // Vàng 3 s: mọi đoạn vàng đầy đủ (bỏ đoạn đầu mỗi nhóm — có thể bị cắt giữa pha lúc bắt đầu mẫu).
      const trimFirst = list => list.slice(1);
      const yellows = trimFirst([...(signal.r0 || []), ...(signal.r1 || [])].filter(r => r[0] === 'yellow').map(r => r[1]));
      const yellowOk = yellows.length >= 1 && yellows.every(d => Math.abs(d - (params?.yellowS ?? 3)) <= 0.6);
      // Đỏ chung 2 s: mọi đoạn cả-hai-nhóm-cùng-đỏ (bỏ đoạn có thể bị cắt ở hai méo khung mẫu).
      const reds = [...(signal.bothRedRuns || [])];
      const redsMiddle = reds.slice(1, -1).length ? reds.slice(1, -1) : reds;
      const allRedOk = redsMiddle.length >= 1 && redsMiddle.every(d => Math.abs(d - (params?.allRedS ?? 2)) <= 0.6);
      (signal.found && yellowOk && allRedOk)
        ? ok('signal', { ...signal, yellowS: params?.yellowS, allRedS: params?.allRedS, yellows, bothRedTrimmed: redsMiddle })
        : fail('signal', { ...signal, yellowOk, allRedOk, yellows, bothRedTrimmed: redsMiddle });
      await page.screenshot({ path: `${shots}/demo2-3d-signal.png` });

      // ---------- 3D modules + KPI HUD + heat (chứng minh P1-1/P1-2 đã vào artifact) ----------
      const modules = await page.evaluate(() => {
        const app = window.__smartApp;
        return {
          modules: Object.keys((app && app.modules) || {}),
          hud: !!(app && app.modules && app.modules.hud),
          heat: !!(app && app.modules && app.modules.heat),
          forecast: !!(app && app.modules && app.modules.forecast && app.modules.forecast.ready),
          scenarios: !!(app && app.modules && app.modules.scenarios),
          inspector: !!(app && app.modules && app.modules.signalInspector),
          testLab: !!(app && app.modules && app.modules.testLab),
          capture: !!(app && app.modules && app.modules.capture),
          submitFrame: !!window.__submitFrame32 && JSON.stringify(window.__submitFrame32.status()),
          kpiText: document.querySelector('#smartHud32')?.textContent?.slice(0, 220) ?? null,
        };
      });
      (modules.hud && modules.heat && modules.capture)
        ? ok('modules', modules)
        : fail('modules', modules);
      await page.screenshot({ path: `${shots}/demo2-3d-1440.png` });

      // ---------- Perf: FPS rAF thô (cách bản nộp đo 120) + render FPS của HUD ----------
      const perf = await page.evaluate(async () => {
        // chờ render ổn định sau các bước tương tác trước đó (khởi động GPU, JIT)
        await new Promise(r => setTimeout(r, 3000));
        const raf = [];
        let frames = 0;
        const tick = () => { frames++; if (raf.keep) requestAnimationFrame(tick); };
        raf.keep = true;
        requestAnimationFrame(tick);
        const t0 = performance.now();
        while (performance.now() - t0 < 20000) {
          await new Promise(r => setTimeout(r, 500));
          if (frames > 0) raf.push(frames * 2);   // đếm nửa giây × 2 = fps
          frames = 0;
        }
        raf.keep = false;
        const renderFps = Number(document.querySelector('#fps')?.textContent ?? 0);
        // bỏ 5 mẫu đầu (khởi động), median theo phần ổn định
        const steady = raf.slice(5);
        const all = steady.length ? steady : raf;
        all.sort((a, b) => a - b);
        return { samples: raf, median: all[Math.floor(all.length / 2)] ?? 0, renderFps };
      });
      results.checks.perf = { ...perf, status: perf.median >= 100 ? 'PASS' : 'FAIL' };
      if (perf.median < 100) results.pass = false;

      // ---------- 15 khung camera từ chính trạm (ảnh mẫu trung thực cho seed + evidence) ----------
      const frames = await page.evaluate(async () => {
        const app = window.__smartApp;
        const capture = app.modules.capture;
        const ids = capture.cameraIds();
        const out = [];
        for (const id of ids) {
          const frame = await capture.captureFrame(id);
          out.push({ id, w: frame.w, h: frame.h, seq: frame.seq, jpeg: frame.jpeg });
        }
        return out;
      });
      for (const f of frames) {
        if (!/^CAM-(?:HX|BAC)-\d{3}$/.test(f.id)) continue;
        writeFileSync(`${camsDir}/${f.id}.jpg`, Buffer.from(f.jpeg.split(',')[1], 'base64'));
      }
      const camOk = frames.length === 15 && frames.every(f => f.w === 1280 && f.h === 720);
      camOk ? ok('cams', { count: frames.length, ids: frames.map(f => f.id) })
        : fail('cams', { count: frames.length, detail: frames.map(f => [f.id, f.w, f.h]) });

      // ---------- Inspector: nhấp đèn (P1-8) ----------
      const inspector = await page.evaluate(async () => {
        const app = window.__smartApp;
        const insp = app.modules.signalInspector;
        if (!insp) return { ok: false, reason: 'no-inspector' };
        const rows = app.modules.signalInspector;
        const card = document.querySelector('.si32__card');
        if (!card) return { ok: false, reason: 'no-card' };
        card.click();
        await new Promise(r => setTimeout(r, 2500));
        return {
          ok: true,
          title: document.querySelector('.si32__title')?.textContent ?? null,
          detail: document.querySelector('[data-si="detailName"]')?.textContent ?? null,
          lamps: Array.from(document.querySelectorAll('.si32__lamp')).map(e => e.textContent.trim()).slice(0, 4),
          arms: document.querySelectorAll('.si32__armList li').length,
          alloc: document.querySelector('[data-si="allocTotal"]')?.textContent ?? null,
          timelineSegs: document.querySelectorAll('.si32__phase').length,
        };
      });
      (inspector.ok && inspector.arms > 0 && inspector.timelineSegs > 0)
        ? ok('inspector', inspector)
        : fail('inspector', inspector);
      await page.screenshot({ path: `${shots}/demo2-inspector.png` });
    }

    if (mode !== '--signal-only') {
      // ---------- Officer: bảng vi phạm + duyệt + bằng chứng ----------
      await page.goto(BASE + '/index-officer.html', { waitUntil: 'load' });
      await page.getByRole('button', { name: /Vào trung tâm điều hành/ }).click();
      await page.waitForSelector('.submit-record-row', { timeout: 25000 });
      const officerState = await page.evaluate(() => ({
        kpis: Array.from(document.querySelectorAll('.submit-kpi')).map(e => e.textContent.trim()),
        rows: document.querySelectorAll('.submit-record-row').length,
        cameras: document.querySelectorAll('#submit-camera-select option').length,
        badges: Array.from(document.querySelectorAll('.submit-record-row .submit-status')).map(e => e.textContent.trim()).slice(0, 10),
      }));
      // Duyệt 1 hồ sơ đang Chờ xác nhận qua UI rồi trả lại trạng thái cũ bằng nút Cần xác minh.
      const pendingRow = page.locator('.submit-record-row').filter({ hasText: 'Chờ xác nhận' }).first();
      const hasPending = await pendingRow.count();
      if (hasPending) {
        await pendingRow.getByRole('button', { name: 'Duyệt' }).click();
        await page.waitForFunction(() => {
          const row = Array.from(document.querySelectorAll('.submit-record-row')).find(e => e.textContent.includes('Chờ xác nhận'));
          return !row || row.querySelector('.submit-status')?.textContent?.includes('Đã xác nhận');
        }, { timeout: 15000 }).catch(() => {});
        await page.locator('.submit-record-row').filter({ hasText: 'Đã xác nhận' }).first().getByRole('button', { name: 'Cần xác minh' }).click();
        await page.waitForTimeout(1500);
      }
      // Bằng chứng: mở dòng đầu, chờ 3 ảnh.
      await page.locator('.submit-record-plate').first().click();
      await page.waitForSelector('.submit-evidence-photos img', { timeout: 15000 });
      const evidence = await page.evaluate(() => ({
        photos: document.querySelectorAll('.submit-evidence-photos img').length,
        captions: Array.from(document.querySelectorAll('.submit-evidence-photos figcaption')).map(e => e.textContent.trim()),
      }));
      officerState.rows >= 8 && officerState.cameras >= 15 && evidence.photos >= 3
        ? ok('officer', { ...officerState, evidence, decisionRoundtrip: !!hasPending })
        : fail('officer', { ...officerState, evidence });
      await page.screenshot({ path: `${shots}/demo2-officer.png` });

      // ---------- Citizen lookup: hồ sơ + timeline + phạt + khiếu nại ----------
      await page.goto(BASE + '/index-citizen.html', { waitUntil: 'load' });
      await page.fill('#submit-plate', '51K12345');
      await page.locator('.submit-lookup-form button[type=submit]').click();
      await page.waitForSelector('.submit-record-detail', { timeout: 20000 });
      const citizen = await page.evaluate(() => ({
        message: document.querySelector('.submit-lookup-message')?.textContent ?? null,
        detail: document.querySelector('.submit-record-detail-head')?.textContent.trim() ?? null,
        evidencePhotos: document.querySelectorAll('.submit-record-detail .submit-evidence-photos img').length,
        penalty: document.querySelector('.submit-penalty')?.textContent.trim() ?? null,
        timeline: document.querySelectorAll('.submit-timeline li').length,
      }));
      // Khiếu nại qua UI trên hồ sơ đang Cần xác minh (59-X1 234.56), verify rồi khôi phục bằng REST.
      await page.fill('#submit-plate', '59-X1 234.56');
      await page.locator('.submit-lookup-form button[type=submit]').click();
      await page.waitForSelector('.submit-record-detail', { timeout: 20000 });
      await page.getByRole('button', { name: 'Khiếu nại', exact: true }).click();
      await page.selectOption('#submit-complaint-kind', 'priority_yield');
      await page.fill('#submit-complaint-note', 'Nghiệm thu tự động: nhường xe cứu thương lúc đèn vàng.');
      await page.locator('.submit-complaint-actions button[type=submit]').click();
      await page.waitForFunction(() => document.querySelector('.submit-record-detail .submit-status')?.textContent?.includes('Đang khiếu nại'), { timeout: 15000 });
      const complaintOk = await page.evaluate(() => ({
        status: document.querySelector('.submit-record-detail .submit-status')?.textContent.trim(),
        timeline: document.querySelectorAll('.submit-timeline li').length,
      }));
      citizen.detail && citizen.evidencePhotos >= 3 && citizen.penalty && citizen.timeline >= 1 && complaintOk.status?.includes('Đang khiếu nại')
        ? ok('citizen', { ...citizen, complaint: complaintOk })
        : fail('citizen', { ...citizen, complaint: complaintOk });
      await page.screenshot({ path: `${shots}/demo2-citizen.png` });
    }

    results.errors = rec.errors.slice(0, 30);
    results.requestFailures = rec.failures.filter(([url]) => !url.includes('googleapis')).slice(0, 20);
    // Local artifact không có serverless functions: /api/demo/** 404 là đúng; production thì vẫn tính.
    const apiDemoLocalOnly = /localhost|127\.0\.0\.1/.test(BASE);
    results.badRequests = rec.requests.filter(([s, u]) => s >= 400 && !(apiDemoLocalOnly && u.includes('/api/demo/'))).slice(0, 30);
    if (results.badRequests.length || rec.errors.length) results.pass = false;

    // Khôi phục hồ sơ sau bước khiếu nại QA: trả '59-X1 234.56' về needs_review và xoá khiếu nại vừa tạo.
    if (process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY && /localhost|127\.0\.0\.1/.test(BASE)) {
      try {
        const headers = { apikey: process.env.SUPABASE_SECRET_KEY, Authorization: `Bearer ${process.env.SUPABASE_SECRET_KEY}`, 'Content-Type': 'application/json' };
        const base = process.env.SUPABASE_URL;
        const [row] = await (await fetch(`${base}/rest/v1/smtf_submit_complaints?select=id,plate,created_at&plate=eq.59-X1%20234.56&order=created_at.desc&limit=1`, { headers })).json();
        await fetch(`${base}/rest/v1/smtf_submit_records`, {
          method: 'POST', headers: { ...headers, Prefer: 'resolution=merge-duplicates' },
          body: JSON.stringify([{ plate: '59-X1 234.56', summary: 'Không đội mũ bảo hiểm', status: 'needs_review' }])
        });
        if (row?.id != null) await fetch(`${base}/rest/v1/smtf_submit_complaints?id=eq.${row.id}`, { method: 'DELETE', headers });
        results.checks.restore = { status: 'PASS', complaintRemoved: row?.id ?? null };
      } catch (error) {
        results.checks.restore = { status: 'FAIL', error: String(error.message || error) };
        results.pass = false;
      }
    }
  } finally {
    await browser.close();
  }
  results.finishedAt = new Date().toISOString();
  writeFileSync(`${shots}/demo2-live.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ pass: results.pass, checks: Object.fromEntries(Object.entries(results.checks).map(([k, v]) => [k, v.status])) }, null, 2));
  process.exit(results.pass ? 0 : 1);
})().catch(e => { console.error('QA lỗi:', e); process.exit(1); });
