// make-evidence.cjs — tạo ảnh bằng chứng mẫu cho 8 hồ sơ demo-v2 từ khung camera đã chụp
// từ chính trạm 3D (work/smtf-agent/demo2-cams/CAM-*.jpg):
//   before.jpg  = khung camera gốc.
//   after.jpg   = khung có overlay khung nhận diện tự động + nhãn + giờ (canvas vẽ lại, không bịa xe).
//   plate.jpg   = ảnh cắt vùng biển số (320×120) từ khung after.
// Kiểm đồng thời ảnh nguồn không phải khung đen/tuyết (trung bình pixel + độ lệch).
// Chạy: node work/smtf-agent/make-evidence.cjs
const { readFileSync, writeFileSync, mkdirSync } = require('node:fs');
const { chromium } = require('D:/FilelaptrinhD/MemoryHub/node_modules/.pnpm/playwright-core@1.64.1/node_modules/playwright-core');

const MAP = [
  ['51K-123.45', 'CAM-BAC-002'],
  ['51G-678.90', 'CAM-HX-001'],
  ['59-X1 234.56', 'CAM-BAC-003'],
  ['59-B1 777.77', 'CAM-HX-002'],
  ['51L-345.67', 'CAM-BAC-004'],
  ['60C-999.88', 'CAM-BAC-005'],
  ['50H-222.33', 'CAM-BAC-001'],
  ['52F-111.22', 'CAM-HX-005'],
];
const camsDir = 'work/smtf-agent/demo2-cams';
const outRoot = 'supabase/samples/evidence';
const PLATE_W = 320, PLATE_H = 120;

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const page = await browser.newPage();
  await page.goto('about:blank');
  const report = [];
  for (const [plate, cameraId] of MAP) {
    const src = `${camsDir}/${cameraId}.jpg`;
    const dataUrl = 'data:image/jpeg;base64,' + readFileSync(src).toString('base64');
    const result = await page.evaluate(async ({ dataUrl, plate }) => {
      const img = await new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('giải mã JPEG lỗi'));
        image.src = dataUrl;
      });
      const w = img.naturalWidth, h = img.naturalHeight;
      const base = document.createElement('canvas');
      base.width = w; base.height = h;
      const ctx = base.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, w, h).data;
      let sum = 0, sumSq = 0, n = 0;
      for (let i = 0; i < data.length; i += 4) {
        const v = (data[i] + data[i + 1] + data[i + 2]) / 3;
        sum += v; sumSq += v * v; n++;
      }
      const avg = sum / n;
      const std = Math.sqrt(sumSq / n - avg * avg);
      // Khung nhận diện mẫu: hộp ở vùng dưới giữa khung (xe gần vạch), nhãn tiếng Việt + giờ.
      const box = { x: Math.round(w / 2 - 150), y: Math.round(h * 0.52), w: 300, h: 150 };
      const after = document.createElement('canvas');
      after.width = w; after.height = h;
      const a = after.getContext('2d');
      a.drawImage(base, 0, 0);
      a.strokeStyle = '#ffd166';
      a.lineWidth = 3;
      a.strokeRect(box.x, box.y, box.w, box.h);
      a.fillStyle = 'rgba(12,22,28,.78)';
      a.fillRect(box.x - 2, box.y - 34, box.w + 200, 30);
      a.fillStyle = '#eaf6f7';
      a.font = '600 17px "Segoe UI", sans-serif';
      a.fillText(`Khung nhận diện tự động · ${plate}`, box.x + 6, box.y - 12);
      const stamp = new Date();
      const stampText = `${String(stamp.getDate()).padStart(2, '0')}/${String(stamp.getMonth() + 1).padStart(2, '0')}/${stamp.getFullYear()} ${String(stamp.getHours()).padStart(2, '0')}:${String(stamp.getMinutes()).padStart(2, '0')}:${String(stamp.getSeconds()).padStart(2, '0')}`;
      a.fillStyle = 'rgba(12,22,28,.7)';
      a.fillRect(w - 320, h - 40, 308, 28);
      a.fillStyle = '#eaf6f7';
      a.font = '600 15px "Segoe UI", sans-serif';
      a.fillText(`${stampText} · ${'Ảnh mẫu'}`, w - 312, h - 20);
      // Ảnh cắt biển: đúng vùng khung nhận diện, kích thước 320×120 như plate_crop của trạm.
      const plateCanvas = document.createElement('canvas');
      plateCanvas.width = 320; plateCanvas.height = 120;
      const pc = plateCanvas.getContext('2d');
      pc.drawImage(after, box.x + box.w / 2 - 160, box.y + box.h / 2 - 60, 320, 120, 0, 0, 320, 120);
      const toJpeg = canvas => new Promise(res => canvas.toBlob(b => {
        const reader = new FileReader();
        reader.onload = () => res(reader.result);
        reader.readAsDataURL(b);
      }, 'image/jpeg', 0.85));
      return {
        avg: Math.round(avg), std: Math.round(std * 10) / 10,
        before: await toJpeg(base), after: await toJpeg(after), plate: await toJpeg(plateCanvas)
      };
    }, { dataUrl, plate });
    mkdirSync(`${outRoot}/${plate}`, { recursive: true });
    for (const kind of ['before', 'after', 'plate']) {
      writeFileSync(`${outRoot}/${plate}/${kind}.jpg`, Buffer.from(result[kind].split(',')[1], 'base64'));
    }
    report.push({ plate, cameraId, avg: result.avg, std: result.std });
  }
  await browser.close();
  console.log(JSON.stringify(report, null, 1));
  const bad = report.filter(r => r.avg < 18 || r.std < 8);
  if (bad.length) { console.error('KHUNG NGHI VẤN (đen/blank):', JSON.stringify(bad)); process.exit(2); }
  console.log('OK: 8 hồ sơ × 3 ảnh bằng chứng.');
})().catch(e => { console.error('LỖI:', e.message); process.exit(1); });
