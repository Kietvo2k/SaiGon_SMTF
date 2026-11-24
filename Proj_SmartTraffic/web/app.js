// app.js – Cap nhat dashboard giao thong Da Nang theo thoi gian thuc.
// Poll /api/state (den + so xe) va /api/violations (bien so vi pham).

const STATE_MS = 1000;
const VIOL_MS  = 3000;
const STATS_MS = 5000;
let cameraRunning = false;

function setCameraRunning(running) {
  cameraRunning = Boolean(running);
  const badge = document.getElementById('cam-live');
  const stopped = document.getElementById('cam-stopped');
  badge.textContent = cameraRunning ? '● TRỰC TIẾP' : '● ĐÃ DỪNG';
  badge.style.background = cameraRunning
    ? 'linear-gradient(90deg,#ef4444,#dc2626)'
    : 'linear-gradient(90deg,#64748b,#475569)';
  if (stopped) stopped.style.display = cameraRunning ? 'none' : 'flex';
}

// ---- Theme sang/toi ----
const themeBtn = document.getElementById('theme-btn');
const themeIcon = document.getElementById('theme-icon');
function applyTheme(t) {
  document.documentElement.classList.toggle('dark', t === 'dark');
  themeIcon.textContent = t === 'dark' ? '☀️' : '🌙';
  localStorage.setItem('theme', t);
}
applyTheme(localStorage.getItem('theme') || 'light');
themeBtn.onclick = () => applyTheme(
  document.documentElement.classList.contains('dark') ? 'light' : 'dark');

// ---- Den: 3 bong, sang bong dang bat ----
const LABEL = { red: 'DỪNG LẠI', yellow: 'CHUẨN BỊ', green: 'ĐƯỢC ĐI', unknown: 'CHƯA RÕ' };
const STATE_COLOR = { red: '#ef4444', yellow: '#eab308', green: '#22c55e', unknown: '#94a3b8' };

function renderLights(containerId, active) {
  const c = document.getElementById(containerId);
  if (c.children.length !== 3) {
    c.innerHTML = '<div class="bulb"></div><div class="bulb"></div><div class="bulb"></div>';
  }
  const [r, y, g] = c.children;
  r.className = 'bulb' + (active === 'red' ? ' on-red' : '');
  y.className = 'bulb' + (active === 'yellow' ? ' on-yellow' : '');
  g.className = 'bulb' + (active === 'green' ? ' on-green' : '');
}

function setState(prefix, state, t) {
  const st = (state || 'unknown').toLowerCase();
  renderLights('lights-' + prefix, st);
  document.getElementById('time-' + prefix).textContent =
    (typeof t === 'number' && t >= 0) ? String(t).padStart(2, '0') : '--';
  const el = document.getElementById('state-' + prefix);
  el.textContent = LABEL[st] || 'CHƯA RÕ';
  el.style.color = STATE_COLOR[st] || '#94a3b8';
}

function setConn(ok, note) {
  const dot = document.getElementById('conn-dot');
  dot.style.background = ok ? '#22c55e' : '#ef4444';
  dot.style.boxShadow = `0 0 0 3px ${ok ? 'rgba(34,197,94,.25)' : 'rgba(239,68,68,.25)'}`;
  document.getElementById('conn-text').textContent = note;
}

// ---- Bien so kieu VN ----
function hasReadablePlate(plate) {
  const normalized = String(plate || '').trim().toLowerCase();
  return Boolean(normalized && ![
    'unknown', 'unreadable', 'demo_unknown', 'ocr_disabled', 'không đọc được'
  ].includes(normalized));
}

function ocrStatusLabel(status) {
  const labels = {
    READ_UNVERIFIED: 'Đọc máy (cần duyệt)',
    READ_CACHED_UNVERIFIED: 'Đọc máy từ khung trước (cần duyệt)',
    LOW_CONFIDENCE: 'Không đủ tin cậy',
    NO_PLATE_DETECTED: 'Không tìm thấy biển số',
    NO_VEHICLE_CROP: 'Không có ảnh xe',
    OCR_DISABLED: 'OCR đang tắt',
    OCR_ERROR: 'OCR lỗi',
  };
  return labels[status] || status;
}

function plateHTML(plate, extraClass, plateStatus, reviewed = false) {
  const has = hasReadablePlate(plate);
  const cls = 'plate' + (has ? '' : ' na') + (extraClass ? ' ' + extraClass : '');
  const review = String(plateStatus || '').toUpperCase().includes('UNVERIFIED');
  const flag = reviewed ? '✓' : (review ? 'AI?' : (has ? 'VN' : 'OCR'));
  const text = has ? plate : 'KHÔNG ĐỌC';
  const title = reviewed ? 'Đã được người duyệt đối chiếu với ảnh crop'
    : review ? 'Kết quả AI cần người duyệt'
    : (has ? '' : 'Ảnh nguồn chưa đủ rõ để OCR đọc biển số');
  return `<span class="${cls}" title="${title}"><span class="flag">${flag}</span><span class="txt">${esc(text)}</span></span>`;
}

async function pollState() {
  try {
    const r = await fetch('/api/state', { cache: 'no-store' });
    const d = await r.json();
    if (!d.available) {
      setCameraRunning(false);
      setConn(false, 'Hệ thống chưa chạy');
      setState('v', 'unknown', null);
      setState('h', 'unknown', null);
      document.getElementById('green-v').textContent = '⚡ Xanh thích ứng: -- s';
      document.getElementById('green-h').textContent = '⚡ Xanh thích ứng: -- s';
    } else {
      setCameraRunning(Boolean(d.camera_running));
      const jetson = d.jetson_connected;
      const demoRed = Boolean(d.demo_red);
      const ai = Boolean(d.ai_enabled);
      const aiPaused = d.ai_mode === 'paused-for-upload';
      const aiText = ai ? 'AI YOLO: Đang nhận dạng'
        : aiPaused ? 'AI chính: Tạm nhường CPU cho video upload'
        : 'AI: Chưa chạy';
      const jetsonText = jetson
        ? (demoRed ? 'Jetson: DEMO ALL-RED' : 'Jetson GPIO: Đã kết nối')
        : 'Jetson GPIO: Ngoại tuyến';
      const sync = d.sync || {};
      const syncTotal = Number(sync.events_total || 0);
      const syncDone = Number(sync.complete || 0);
      const syncWaiting = Number(sync.pending || 0);
      const driveText = syncTotal === 0 ? 'Drive: chưa có gói'
        : syncWaiting > 0 ? `Drive: ${syncDone}/${syncTotal} xong · ${syncWaiting} chờ`
        : `Drive: ${syncDone}/${syncTotal} xong`;
      // AI/video và Jetson/GPIO là hai kết nối độc lập.  Dot xanh khi YOLO
      // vẫn đang chạy, kể cả lúc chưa cắm dây/chưa bật dịch vụ GPIO Jetson.
      setConn(ai || jetson || aiPaused, `${aiText} · ${jetsonText} · ${driveText}`);
      setState('v', d.vertical, d.t_v);
      setState('h', d.horizontal, d.t_h);
      document.getElementById('cnt-v').textContent = `🚗 ${d.count_v ?? 0} xe`;
      document.getElementById('cnt-h').textContent = `🚗 ${d.count_h ?? 0} xe`;
      const gv = d.green_v ?? 0, gh = d.green_h ?? 0;
      document.getElementById('green-v').textContent =
        gv > 0 ? `⚡ Xanh thích ứng: ${gv} s` : '⚡ Xanh thích ứng: -- s';
      document.getElementById('green-h').textContent =
        gh > 0 ? `⚡ Xanh thích ứng: ${gh} s` : '⚡ Xanh thích ứng: -- s';
      document.getElementById('stat-cars').textContent = d.count_v ?? 0;
      document.getElementById('stat-motor').textContent = d.count_h ?? 0;
      document.getElementById('stat-fps').textContent = Math.round(d.fps ?? 0);
    }
  } catch (e) {
    setCameraRunning(false);
    setConn(false, 'Mất kết nối server');
  }
}

function renderHero(v) {
  const hero = document.getElementById('hero');
  if (!v) { hero.classList.add('hidden'); return; }
  hero.classList.remove('hidden');
  const img = document.getElementById('hero-img');
  if (v.image) {
    const src = '/violations/' + encodeURIComponent(v.image);
    img.src = src; img.className = 'hero-photo';
    img.onclick = () => openModal(src);
    img.onerror = () => { img.className = 'hero-photo none'; img.removeAttribute('src'); img.textContent = 'Không có ảnh'; };
  } else {
    img.className = 'hero-photo none'; img.removeAttribute('src');
  }
  const p = document.getElementById('hero-plate');
  const shownPlate = v.reviewed_plate || v.plate;
  const has = hasReadablePlate(shownPlate);
  const review = String(v.plate_status || '').toUpperCase().includes('UNVERIFIED');
  p.className = 'plate' + (has ? '' : ' na');
  p.querySelector('.flag').textContent = v.reviewed_plate ? '✓' : (review ? 'AI?' : (has ? 'VN' : 'OCR'));
  p.querySelector('.txt').textContent = has ? shownPlate : 'KHÔNG ĐỌC ĐƯỢC';
  const speed = v.speed_kmh ? ` | ${v.speed_kmh} km/h` : '';
  document.getElementById('hero-type').textContent = (v.type || '--') + speed;
  document.getElementById('hero-lane').textContent = v.lane || '--';
  document.getElementById('hero-time').textContent = v.time || '--';
}

async function pollViolations() {
  try {
    const r = await fetch('/api/violations', { cache: 'no-store' });
    const list = await r.json();
    document.getElementById('stat-viol').textContent = list.length;
    document.getElementById('viol-count').textContent = `${list.length} vi phạm`;

    renderHero(list.length ? list[0] : null);

    const grid = document.getElementById('viol-grid');
    if (!list.length) {
      grid.innerHTML = '<div class="viol-empty"><div class="big">✅</div>Chưa có vi phạm nào được ghi nhận.</div>';
      return;
    }
    grid.innerHTML = list.map(v => {
      const shownPlate = v.reviewed_plate || v.plate;
      const imgCell = v.image
        ? `<img class="vimg" src="/violations/${encodeURIComponent(v.image)}" onclick="openModal('/violations/${encodeURIComponent(v.image)}')" onerror="this.className='vimg none';this.removeAttribute('src');this.textContent='Không có ảnh'" />`
        : `<div class="vimg none">Không có ảnh</div>`;
      // Gắn phiên bản theo timestamp để Chrome không dùng lại clip FMP4 cũ
      // sau khi file đã được chuyển/ghi lại thành H.264.
      const clipSrc = v.clip
        ? `/violations/${encodeURIComponent(v.clip)}?v=${encodeURIComponent(v.time || '')}`
        : '';
      const clipBtn = clipSrc
        ? `<button class="clip-btn" onclick="openClip('${clipSrc}')">▶ Xem clip</button>`
        : '';
      const plateSrc = v.plate_crop
        ? `/violations/${encodeURIComponent(v.plate_crop)}`
        : '';
      const vehicleSrc = v.vehicle_crop
        ? `/violations/${encodeURIComponent(v.vehicle_crop)}`
        : '';
      const cropBtns = [
        vehicleSrc ? `<button class="clip-btn" onclick="openModal('${vehicleSrc}')">Ảnh xe</button>` : '',
        plateSrc ? `<button class="clip-btn" onclick="openModal('${plateSrc}')">Ảnh biển số</button>` : '',
      ].join('');
      const ocrMeta = v.plate_status
        ? `<div class="vrow"><span>OCR: ${esc(ocrStatusLabel(v.plate_status))}</span><span>${v.plate_conf ? esc(v.plate_conf) : ''}</span></div>`
        : '';
      const reviewMeta = v.reviewed_plate
        ? `<div class="vrow"><span>✓ Duyệt: ${esc(v.reviewed_plate)} (AI: ${esc(v.plate)})</span><span>${esc(v.review_status || 'HUMAN_REVIEWED')}</span></div>`
        : '';
      const speedMeta = v.event_type === 'SPEED_DEMO'
        ? `<div class="vrow"><span>⚠ Mô phỏng tốc độ: ${esc(v.speed_kmh || '--')} &gt; ${esc(v.speed_limit_kmh || '--')} km/h</span></div>
           <div class="vrow"><span>📐 ${esc(v.distance_m || '--')} m / ${esc(v.elapsed_s || '--')} s · Cần duyệt</span></div>`
        : '';
      return `<div class="vcard">
        ${imgCell}
        <div class="vbody">
          ${plateHTML(shownPlate, '', v.plate_status, Boolean(v.reviewed_plate))}
          <div class="vrow"><span>${esc(v.type)}</span><span class="tag">${esc(v.lane)}</span></div>
          ${ocrMeta}
          ${reviewMeta}
          ${speedMeta}
          <div class="vrow"><span>${esc(v.time)}</span>${clipBtn}${cropBtns}</div>
        </div>
      </div>`;
    }).join('');
  } catch (e) { /* giu nguyen khi loi tam thoi */ }
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s == null ? '' : String(s);
  return d.innerHTML;
}

window.openModal = (src) => {
  document.getElementById('modal-img').src = src;
  const m = document.getElementById('modal');
  m.classList.remove('hidden');
};
window.closeModal = () => document.getElementById('modal').classList.add('hidden');

// ---- Modal clip video vi pham ----
window.openClip = (src) => {
  const vid = document.getElementById('modal-vid');
  const status = document.getElementById('clip-status');
  // Reset a previous request before assigning the new URL.  Calling play()
  // immediately after src= can race metadata loading and leave Chromium's
  // controls at 0:00; retry once the MP4 headers are available.
  vid.pause();
  vid.removeAttribute('src');
  vid.load();
  vid.preload = 'metadata';
  vid.src = src;
  document.getElementById('modal-video').classList.remove('hidden');
  status.textContent = 'Đang tải thời lượng…';
  const playWhenReady = () => vid.play().catch(() => {});
  vid.onloadedmetadata = () => {
    if (Number.isFinite(vid.duration) && vid.duration > 0) {
      const total = Math.round(vid.duration);
      const mm = Math.floor(total / 60);
      const ss = String(total % 60).padStart(2, '0');
      status.textContent = `Thời lượng: ${mm}:${ss} (${total} giây)`;
    } else {
      status.textContent = 'Không đọc được thời lượng clip';
    }
    playWhenReady();
  };
  vid.oncanplay = playWhenReady;
  vid.onerror = () => { status.textContent = 'Clip chưa sẵn sàng — tải lại trang để thử lại'; };
  vid.load();
  // Keep the first play() inside the user's click gesture (autoplay policy),
  // while the handlers above retry after metadata/buffering completes.
  playWhenReady();
};
window.closeClip = () => {
  const vid = document.getElementById('modal-vid');
  vid.pause();
  vid.onloadedmetadata = null;
  vid.oncanplay = null;
  vid.onerror = null;
  vid.removeAttribute('src');
  vid.load();
  document.getElementById('clip-status').textContent = '';
  document.getElementById('modal-video').classList.add('hidden');
};

// ---- Bieu do thong ke (Feature #3): ve bang CSS thuan, khong can thu vien ----
const TYPE_VI = { car: 'Ô tô', motorcycle: 'Xe máy', motorbike: 'Xe máy',
                  bus: 'Xe buýt', truck: 'Xe tải', bicycle: 'Xe đạp' };

function renderHourChart(byHour) {
  const box = document.getElementById('chart-hour');
  if (!box) return;
  const arr = Array.isArray(byHour) ? byHour : [];
  const max = Math.max(1, ...arr);
  box.innerHTML = arr.map((v, h) => {
    const pct = Math.round((v / max) * 100);
    return `<div class="bh" title="${h}h: ${v} vi phạm">
      <span class="hv">${v || ''}</span>
      <div class="fill${v ? '' : ' zero'}" style="height:${v ? pct : 0}%"></div>
      <span class="hl">${h % 3 === 0 ? h : ''}</span>
    </div>`;
  }).join('');
}

function renderBarsV(elId, obj) {
  const box = document.getElementById(elId);
  if (!box) return;
  const entries = Object.entries(obj || {}).sort((a, b) => b[1] - a[1]);
  if (!entries.length) {
    box.innerHTML = '<div class="chart-empty">Chưa có dữ liệu</div>';
    return;
  }
  const max = Math.max(1, ...entries.map(e => e[1]));
  box.innerHTML = entries.map(([k, v]) => {
    const pct = Math.round((v / max) * 100);
    const label = TYPE_VI[k.toLowerCase()] || k;
    return `<div class="bv">
      <span class="lb">${esc(label)}</span>
      <div class="track"><div class="fv" style="width:${pct}%"></div></div>
      <span class="vv">${v}</span>
    </div>`;
  }).join('');
}

async function pollStats() {
  try {
    const r = await fetch('/api/stats', { cache: 'no-store' });
    const d = await r.json();
    renderHourChart(d.by_hour);
    renderBarsV('chart-type', d.by_type);
    renderBarsV('chart-lane', d.by_lane);
    const totalEl = document.getElementById('stats-total');
    if (totalEl) totalEl.textContent = `Tổng: ${d.total ?? 0}`;
  } catch (e) { /* giu nguyen khi loi tam thoi */ }
}

// ---- QR link tu /api/telegram ----
async function loadTelegramLink() {
  try {
    const r = await fetch('/api/telegram', { cache: 'no-store' });
    const d = await r.json();
    if (d.link) {
      document.getElementById('qr-link').href = d.link;
      if (d.name) document.getElementById('qr-caption').textContent = d.name;
    }
  } catch (e) { /* bo qua */ }
}

// ---- Webcam trinh duyet -> backend YOLO -> anh da ve box ----
const webcamVideo = document.getElementById('webcam-source');
const webcamCanvas = document.getElementById('webcam-capture');
const webcamResult = document.getElementById('webcam-result');
const webcamDevice = document.getElementById('webcam-device');
const webcamStart = document.getElementById('webcam-start');
const webcamStop = document.getElementById('webcam-stop');
let webcamStream = null;
let webcamLoopActive = false;
let webcamTimer = null;
let webcamAbort = null;
let webcamResultUrl = null;
let webcamSession = 0;

function setWebcamStatus(text, state = 'idle') {
  const badge = document.getElementById('webcam-status');
  if (!badge) return;
  badge.textContent = text;
  badge.dataset.state = state;
}

function setWebcamControls(running) {
  if (webcamStart) webcamStart.disabled = Boolean(running);
  if (webcamStop) webcamStop.disabled = !running;
  if (webcamDevice) webcamDevice.disabled = Boolean(running);
  const sourcePlaceholder = document.getElementById('webcam-source-placeholder');
  if (sourcePlaceholder) sourcePlaceholder.classList.toggle('hidden', Boolean(running));
}

function resetWebcamMetrics() {
  document.getElementById('webcam-fps').textContent = '0.0 FPS';
  document.getElementById('webcam-count').textContent = '0 phương tiện';
  document.getElementById('webcam-classes').textContent = 'Chưa có dữ liệu';
}

function readableWebcamError(error) {
  const name = String(error?.name || '');
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return 'Trình duyệt chưa được cấp quyền camera. Bấm biểu tượng ổ khóa/camera cạnh thanh địa chỉ để cho phép.';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'Không tìm thấy webcam. Hãy cắm camera USB hoặc kiểm tra camera laptop.';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return 'Webcam đang bị ứng dụng khác sử dụng. Hãy đóng Camera/Zoom/Meet rồi thử lại.';
  }
  return error?.message || 'Không bật được webcam.';
}

async function refreshWebcamDevices(preferredId = '') {
  if (!webcamDevice || !navigator.mediaDevices?.enumerateDevices) return;
  try {
    const devices = (await navigator.mediaDevices.enumerateDevices())
      .filter(device => device.kind === 'videoinput');
    const selected = preferredId || webcamDevice.value;
    webcamDevice.innerHTML = '';
    if (!devices.length) {
      webcamDevice.innerHTML = '<option value="">Camera mặc định</option>';
      return;
    }
    devices.forEach((device, index) => {
      const option = document.createElement('option');
      option.value = device.deviceId;
      option.textContent = device.label || `Camera ${index + 1}`;
      webcamDevice.appendChild(option);
    });
    if (selected && devices.some(device => device.deviceId === selected)) {
      webcamDevice.value = selected;
    }
  } catch (e) { /* ten camera co the bi an truoc khi cap quyen */ }
}

function webcamCountsText(raw) {
  if (!raw) return 'Không phát hiện xe';
  try {
    const data = JSON.parse(raw);
    const rows = Object.entries(data).filter(([, value]) => Number(value) > 0);
    return rows.length ? rows.map(([name, value]) => `${name}: ${value}`).join(' · ') : 'Không phát hiện xe';
  } catch (e) {
    return String(raw).replace(/[;,]/g, ' · ');
  }
}

function canvasJpeg(canvas, quality = 0.78) {
  return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
}

async function stopWebcam(releaseModel = true, quiet = false) {
  webcamSession += 1;
  webcamLoopActive = false;
  if (webcamTimer) clearTimeout(webcamTimer);
  webcamTimer = null;
  if (webcamAbort) webcamAbort.abort();
  webcamAbort = null;

  if (webcamStream) {
    webcamStream.getTracks().forEach(track => track.stop());
    webcamStream = null;
  }
  if (webcamVideo) webcamVideo.srcObject = null;
  if (webcamResultUrl) URL.revokeObjectURL(webcamResultUrl);
  webcamResultUrl = null;
  webcamResult?.classList.add('hidden');
  document.getElementById('webcam-result-placeholder')?.classList.remove('hidden');
  setWebcamControls(false);
  resetWebcamMetrics();
  if (!quiet) setWebcamStatus('● ĐÃ DỪNG WEBCAM', 'idle');

  if (releaseModel) {
    try {
      await fetch('/api/webcam/release', { method: 'POST', cache: 'no-store' });
    } catch (e) { /* server co the dang khoi dong lai */ }
  }
}

async function runWebcamInference(session) {
  if (!webcamLoopActive || session !== webcamSession || !webcamVideo || !webcamCanvas) return;
  try {
    if (webcamVideo.readyState < 2 || !webcamVideo.videoWidth) {
      webcamTimer = setTimeout(() => runWebcamInference(session), 120);
      return;
    }

    const width = Math.min(640, webcamVideo.videoWidth);
    const height = Math.max(1, Math.round(webcamVideo.videoHeight * width / webcamVideo.videoWidth));
    webcamCanvas.width = width;
    webcamCanvas.height = height;
    webcamCanvas.getContext('2d', { alpha: false }).drawImage(webcamVideo, 0, 0, width, height);
    const jpeg = await canvasJpeg(webcamCanvas);
    if (!jpeg || !webcamLoopActive || session !== webcamSession) throw new Error('Không chụp được khung webcam.');

    setWebcamStatus('● YOLO ĐANG NHẬN DẠNG…', 'starting');
    webcamAbort = new AbortController();
    const response = await fetch('/api/webcam/infer?conf=0.30&imgsz=416', {
      method: 'POST',
      headers: { 'Content-Type': 'image/jpeg' },
      body: jpeg,
      cache: 'no-store',
      signal: webcamAbort.signal,
    });
    webcamAbort = null;
    if (!response.ok) {
      let message = `AI webcam trả lỗi HTTP ${response.status}`;
      try {
        const data = await response.json();
        message = data.error || message;
      } catch (e) { /* response khong phai JSON */ }
      if (response.status === 409 || response.status === 429) {
        setWebcamStatus('● AI ĐANG BẬN VỚI VIDEO TEST', 'starting');
        document.getElementById('webcam-classes').textContent = message;
        webcamTimer = setTimeout(() => runWebcamInference(session), 900);
        return;
      }
      throw new Error(message);
    }

    const resultBlob = await response.blob();
    if (!webcamLoopActive || session !== webcamSession) return;
    const nextUrl = URL.createObjectURL(resultBlob);
    const previousUrl = webcamResultUrl;
    webcamResultUrl = nextUrl;
    webcamResult.onload = () => { if (previousUrl) URL.revokeObjectURL(previousUrl); };
    webcamResult.src = nextUrl;
    webcamResult.classList.remove('hidden');
    document.getElementById('webcam-result-placeholder')?.classList.add('hidden');

    const fps = Number(response.headers.get('X-AI-FPS') || 0);
    const count = Number(response.headers.get('X-Detection-Count') || 0);
    const latency = Number(response.headers.get('X-AI-Latency-Ms') || 0);
    const model = response.headers.get('X-AI-Model') || 'YOLOv26n COCO';
    document.getElementById('webcam-model').textContent = model;
    document.getElementById('webcam-fps').textContent = `${fps.toFixed(1)} FPS${latency ? ` · ${latency.toFixed(0)} ms` : ''}`;
    document.getElementById('webcam-count').textContent = `${count} phương tiện`;
    document.getElementById('webcam-classes').textContent = webcamCountsText(response.headers.get('X-AI-Counts'));
    setWebcamStatus('● WEBCAM + YOLO TRỰC TIẾP', 'running');
  } catch (error) {
    if (error?.name === 'AbortError' || !webcamLoopActive || session !== webcamSession) return;
    setWebcamStatus('● LỖI AI WEBCAM', 'error');
    document.getElementById('webcam-classes').textContent = readableWebcamError(error);
    webcamTimer = setTimeout(() => runWebcamInference(session), 1200);
    return;
  }
  if (webcamLoopActive && session === webcamSession) {
    webcamTimer = setTimeout(() => runWebcamInference(session), 80);
  }
}

async function startWebcam() {
  if (currentVideoJob?.active) {
    alert('Video Test đang chạy model AI. Hãy bấm Dừng hoặc chờ video xử lý xong rồi bật webcam.');
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    setWebcamStatus('● TRÌNH DUYỆT CHẶN CAMERA', 'error');
    document.getElementById('webcam-classes').textContent =
      'Hãy mở dashboard bằng http://localhost:8090 hoặc HTTPS.';
    return;
  }

  await stopWebcam(false, true);
  setWebcamStatus('● ĐANG XIN QUYỀN CAMERA…', 'starting');
  if (webcamStart) webcamStart.disabled = true;
  try {
    const selectedId = webcamDevice?.value || '';
    const video = {
      width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 24, max: 30 },
    };
    if (selectedId) video.deviceId = { exact: selectedId };
    webcamStream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
    webcamVideo.srcObject = webcamStream;
    await webcamVideo.play();
    const activeId = webcamStream.getVideoTracks()[0]?.getSettings?.().deviceId || selectedId;
    await refreshWebcamDevices(activeId);
    webcamLoopActive = true;
    webcamSession += 1;
    const session = webcamSession;
    setWebcamControls(true);
    setWebcamStatus('● ĐANG KHỞI ĐỘNG YOLO…', 'starting');
    runWebcamInference(session);
  } catch (error) {
    await stopWebcam(false, true);
    setWebcamStatus('● KHÔNG BẬT ĐƯỢC WEBCAM', 'error');
    document.getElementById('webcam-classes').textContent = readableWebcamError(error);
  }
}

// ---- Camera video: lam moi /frame.jpg lien tuc de thanh video ----
function refreshCamera() {
  const img = document.getElementById('cam-img');
  if (!img || !cameraRunning) return;
  const next = new Image();
  next.onload = () => {
    img.src = next.src;
    img.style.display = 'block';
    document.getElementById('cam-fallback').style.display = 'none';
  };
  next.onerror = () => {
    document.getElementById('cam-fallback').style.display = 'flex';
    img.style.display = 'none';
  };
  next.src = '/frame.jpg?t=' + Date.now();
}

// ---- Phòng thử nghiệm video local: upload -> AI worker tách biệt -> preview ----
const videoFile = document.getElementById('video-file');
const videoMode = document.getElementById('video-mode');
const videoRun = document.getElementById('video-run');
const jobPanel = document.getElementById('job-panel');
const jobPreview = document.getElementById('job-preview');
const jobVideo = document.getElementById('job-video');
const jobCancel = document.getElementById('job-cancel');
let currentVideoJob = null;
let jobPollBusy = false;
let demoRecipientConfigured = false;

const MODE_INFO = {
  vehicle: {
    badge: 'YOLO + ByteTrack',
    text: 'YOLO thật sẽ vẽ box, class (car, motorcycle, bus, truck, bicycle), confidence và track ID. Chế độ này chỉ phân tích phương tiện, không tự tạo vi phạm.',
  },
  redlight: {
    badge: 'YOLO + OCR · DEMO',
    text: 'Vạch dừng là phần trăm chiều cao video. “Toàn thời gian đèn đỏ” là mô phỏng có nhãn rõ; khi track vượt vạch, hệ thống lưu toàn khung, nguyên xe, crop biển số và CSV rồi xếp hàng đồng bộ Drive.',
  },
  speed: {
    badge: 'YOLO + 2 VẠCH · DEMO',
    text: 'Tốc độ = khoảng cách thực địa A–B / thời gian track đi giữa hai vạch. Nếu chưa đo khoảng cách ngoài đường thì kết quả chỉ là mô phỏng cần duyệt, không phải căn cứ phạt thật.',
  },
  heatmap: {
    badge: 'AI DENSITY HEATMAP',
    text: 'Bản đồ nhiệt mật độ giao thông thông minh: tích lũy điểm tiếp đất của bánh xe (Footprint) và thời gian dừng chờ đèn đỏ (Dwell Time) chuẩn Smart City.',
  },
};

function numberValue(id, fallback) {
  const value = Number(document.getElementById(id)?.value);
  return Number.isFinite(value) ? value : fallback;
}

function setDemoRecipientStatus(text) {
  const target = document.getElementById('demo-recipient-status');
  if (target) target.textContent = text;
}

async function loadDemoRecipient() {
  try {
    const response = await fetch('/api/demo-recipient', { cache: 'no-store' });
    if (!response.ok) throw new Error('recipient settings unavailable');
    const data = await response.json();
    demoRecipientConfigured = Boolean(data.configured);
    setDemoRecipientStatus(demoRecipientConfigured
      ? `Local demo recipient configured (ending ${data.tail || '----'}).`
      : 'No local demo recipient configured.');
  } catch (e) {
    demoRecipientConfigured = false;
    setDemoRecipientStatus('Open this dashboard as http://localhost:8090 to configure the demo recipient.');
  }
}

async function saveDemoRecipient() {
  const input = document.getElementById('demo-recipient-cccd');
  const cccd = String(input?.value || '').trim();
  if (!/^\d{12}$/.test(cccd)) {
    alert('Enter the 12-digit CCCD currently used to sign in on the phone app.');
    input?.focus();
    return;
  }
  try {
    const response = await fetch('/api/demo-recipient', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cccd }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    demoRecipientConfigured = true;
    input.value = '';
    setDemoRecipientStatus(`Local demo recipient configured (ending ${data.tail || '----'}).`);
  } catch (e) {
    alert(`Could not save the demo recipient: ${e.message}`);
  }
}

function updateModeOptions() {
  const mode = videoMode?.value || 'vehicle';
  document.querySelectorAll('.redlight-opt').forEach(el => el.classList.toggle('hidden', mode !== 'redlight'));
  document.querySelectorAll('.speed-opt').forEach(el => el.classList.toggle('hidden', mode !== 'speed'));
  const explain = document.querySelector('#mode-explain span:last-child');
  if (explain) explain.textContent = MODE_INFO[mode].text;
  const badge = document.getElementById('job-badge');
  if (badge && !currentVideoJob) badge.textContent = MODE_INFO[mode].badge;
}

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function artifactUrl(job, name) {
  return `/api/video-jobs/${encodeURIComponent(job.id)}/artifact/${encodeURIComponent(name)}`;
}

function renderVideoJob(job) {
  if (!job) return;
  currentVideoJob = job;
  jobPanel.classList.remove('hidden');
  const progress = job.progress || {};
  const result = job.result || {};
  const terminal = ['completed', 'completed_no_event', 'failed', 'interrupted', 'cancelled'].includes(job.status);
  const pct = terminal && job.status !== 'failed'
    ? 100 : Math.max(0, Math.min(100, Number(progress.progress_pct || 0)));
  document.getElementById('job-bar').style.width = `${pct}%`;
  document.getElementById('job-status').textContent = job.message || progress.message || 'Đang xử lý…';
  document.getElementById('job-badge').textContent = MODE_INFO[job.mode]?.badge || String(job.mode || 'AI').toUpperCase();
  jobCancel.classList.toggle('hidden', !job.active);
  videoRun.disabled = Boolean(job.active);
  videoRun.textContent = job.active ? '⏳ AI đang xử lý…' : '▶ Tải lên & chạy AI';

  const meta = [];
  meta.push(`Tiến độ: ${pct.toFixed(1)}%`);
  if (progress.frames_processed != null) meta.push(`Frame AI: ${progress.frames_processed}${progress.total_frames_expected ? '/' + progress.total_frames_expected : ''}`);
  if (progress.processing_fps != null || progress.fps != null) meta.push(`FPS: ${progress.processing_fps ?? progress.fps}`);
  if (progress.unique_vehicles != null) meta.push(`Track xe: ${progress.unique_vehicles}`);
  if (progress.event_count != null || progress.events != null || result.event_count != null) meta.push(`Sự kiện: ${progress.event_count ?? progress.events ?? result.event_count}`);
  if (progress.persistent_regions != null) meta.push(`Vùng chuyển động bền: ${progress.persistent_regions}`);
  if (progress.motion_density_percent != null) meta.push(`Mật độ chuyển động: ${progress.motion_density_percent}%`);
  if (job.drive_sync) meta.push(`Drive: ${job.drive_sync}`);
  if (job.notification_status) meta.push(`Demo delivery: ${job.notification_status}${job.notification_message ? ' - ' + job.notification_message : ''}`);
  if (job.simulation) meta.push('KẾT QUẢ MÔ PHỎNG · CẦN NGƯỜI DUYỆT');
  document.getElementById('job-meta').innerHTML = meta.map(v => `<span>${esc(v)}</span>`).join('');

  if (job.preview_available) {
    jobPreview.src = `/api/video-jobs/${encodeURIComponent(job.id)}/preview.jpg?t=${Date.now()}`;
    jobPreview.classList.remove('hidden');
  }

  const artifacts = Array.isArray(job.artifacts) ? job.artifacts : [];
  const finalVideo = artifacts.find(a => ['output.mp4', 'annotated.mp4'].includes(a.name));
  if (terminal && finalVideo && job.status !== 'failed') {
    const src = artifactUrl(job, finalVideo.name);
    if (jobVideo.dataset.src !== src) {
      jobVideo.dataset.src = src;
      jobVideo.src = src;
      jobVideo.load();
    }
    jobVideo.classList.remove('hidden');
    jobPreview.classList.add('hidden');
  } else {
    jobVideo.pause();
    jobVideo.classList.add('hidden');
  }

  const artifactBox = document.getElementById('job-artifacts');
  if (!artifacts.length) {
    artifactBox.innerHTML = '<span class="upload-sub">AI đang tạo preview/kết quả…</span>';
  } else {
    artifactBox.innerHTML = artifacts.map(item => {
      const ext = item.name.split('.').pop().toLowerCase();
      const icon = ext === 'csv' ? '📊' : ext === 'json' ? '🧾' : ext === 'mp4' ? '🎬' : '🖼️';
      return `<a href="${artifactUrl(job, item.name)}" target="_blank" rel="noopener">${icon} ${esc(item.name)} <small>(${formatBytes(item.bytes)})</small></a>`;
    }).join('');
  }

  if (terminal) {
    pollViolations();
    pollStats();
  }
}

async function pollVideoJob() {
  if (jobPollBusy) return;
  jobPollBusy = true;
  try {
    const path = currentVideoJob?.id
      ? `/api/video-jobs/${encodeURIComponent(currentVideoJob.id)}`
      : '/api/video-jobs/current';
    const response = await fetch(path, { cache: 'no-store' });
    if (!response.ok) return;
    const data = await response.json();
    if (data.job) renderVideoJob(data.job);
  } catch (e) { /* server có thể đang khởi động lại */ }
  finally { jobPollBusy = false; }
}

async function startVideoJob() {
  const file = videoFile?.files?.[0];
  if (!file) {
    alert('Bạn hãy chọn một video trước.');
    videoFile?.focus();
    return;
  }
  if (file.size > 256 * 1024 * 1024) {
    alert('Video lớn hơn 256 MB. Hãy cắt một đoạn ngắn để Jetson/máy local xử lý nhẹ và ổn định.');
    return;
  }
  if (webcamLoopActive || webcamStream) {
    await stopWebcam(true, false);
  }
  const mode = videoMode.value;
  const params = new URLSearchParams({
    mode,
    stride: String(numberValue('video-stride', 2)),
    max_frames: String(numberValue('max-frames', 900)),
    imgsz: mode === 'redlight' || mode === 'speed' ? '640' : '480',
    conf: '0.30',
  });
  if (mode === 'redlight') {
    params.set('stop_line_ratio', String(numberValue('stop-line-ratio', 72) / 100));
    params.set('force_red_simulation', document.getElementById('force-red').checked ? '1' : '0');
    const notifyDemo = Boolean(document.getElementById('notify-demo')?.checked);
    if (notifyDemo && !demoRecipientConfigured) {
      alert('Save the local 12-digit app recipient CCCD before sending a DEMO to Telegram and the app.');
      document.getElementById('demo-recipient-cccd')?.focus();
      return;
    }
    params.set('notify_demo', notifyDemo ? '1' : '0');
  }
  if (mode === 'speed') {
    params.set('line_a_ratio', String(numberValue('line-a-ratio', 45) / 100));
    params.set('line_b_ratio', String(numberValue('line-b-ratio', 72) / 100));
    params.set('distance_m', String(numberValue('distance-m', 8)));
    params.set('limit_kmh', String(numberValue('limit-kmh', 50)));
    params.set('direction', document.getElementById('speed-direction').value);
  }

  jobPanel.classList.remove('hidden');
  document.getElementById('job-status').textContent = `Đang tải ${file.name} (${formatBytes(file.size)})…`;
  document.getElementById('job-bar').style.width = '2%';
  document.getElementById('job-badge').textContent = MODE_INFO[mode].badge;
  document.getElementById('job-meta').textContent = 'Upload local an toàn; video gốc không được tự động đưa lên Drive.';
  videoRun.disabled = true;
  videoRun.textContent = '⏳ Đang tải video…';
  try {
    const response = await fetch(`/api/video-jobs?${params.toString()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name) },
      body: file,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    currentVideoJob = data.job;
    renderVideoJob(data.job);
  } catch (e) {
    document.getElementById('job-status').textContent = `Không chạy được: ${e.message}`;
    document.getElementById('job-bar').style.width = '0%';
    videoRun.disabled = false;
    videoRun.textContent = '▶ Tải lên & chạy AI';
  }
}

async function cancelVideoJob() {
  if (!currentVideoJob?.id) return;
  jobCancel.disabled = true;
  try {
    await fetch(`/api/video-jobs/${encodeURIComponent(currentVideoJob.id)}/cancel`, { method: 'POST' });
    await pollVideoJob();
  } finally {
    jobCancel.disabled = false;
  }
}

async function loadDriveButton() {
  const button = document.getElementById('drive-btn');
  try {
    const response = await fetch('/api/drive', { cache: 'no-store' });
    const data = await response.json();
    if (data.available && data.url) {
      button.href = data.url;
      button.title = 'Mở thư mục bằng chứng đã đồng bộ trên Google Drive';
      return;
    }
  } catch (e) { /* hiển thị trạng thái chưa cấu hình bên dưới */ }
  button.removeAttribute('href');
  button.textContent = '☁ Drive chưa cấu hình';
  button.onclick = ev => { ev.preventDefault(); alert('Chưa có liên kết thư mục Google Drive trong config/evidence_sync.json.'); };
}

if (videoMode) videoMode.addEventListener('change', updateModeOptions);
if (videoRun) videoRun.addEventListener('click', startVideoJob);
const demoRecipientSave = document.getElementById('demo-recipient-save');
if (demoRecipientSave) demoRecipientSave.addEventListener('click', saveDemoRecipient);
if (jobCancel) jobCancel.addEventListener('click', cancelVideoJob);
if (webcamStart) webcamStart.addEventListener('click', startWebcam);
if (webcamStop) webcamStop.addEventListener('click', () => stopWebcam(true, false));
if (navigator.mediaDevices?.addEventListener) {
  navigator.mediaDevices.addEventListener('devicechange', () => refreshWebcamDevices());
}
window.addEventListener('pagehide', () => {
  webcamLoopActive = false;
  if (webcamStream) webcamStream.getTracks().forEach(track => track.stop());
  try { navigator.sendBeacon('/api/webcam/release', new Blob([], { type: 'application/octet-stream' })); }
  catch (e) { /* bo qua khi trinh duyet dang dong */ }
});
if (jobVideo) jobVideo.onerror = () => {
  jobVideo.classList.add('hidden');
  if (currentVideoJob?.preview_available) jobPreview.classList.remove('hidden');
};
updateModeOptions();
loadDemoRecipient();
refreshWebcamDevices();
loadDriveButton();
pollVideoJob();
setInterval(pollVideoJob, 700);

loadTelegramLink();
pollState(); pollViolations(); pollStats();
setInterval(pollState, STATE_MS);
setInterval(pollViolations, VIOL_MS);
setInterval(pollStats, VIOL_MS);
setInterval(refreshCamera, 200);
refreshCamera();
