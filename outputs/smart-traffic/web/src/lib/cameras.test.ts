// Test cho cameraOptions — danh sách camera giao lộ dùng để chọn trình chiếu.
import { assert, describe, it } from 'vitest';
import { cameraOptions, cameraDefault, cameraGridSlice, cameraPageForId } from './cameras';

describe('cameraOptions', () => {
  const streams = [
    { camera_id: 'CAM-HX-001', fps: 2, url: '/api/v1/media/stream/CAM-HX-001', active: true, label: 'Cầu vượt Hàng Xanh ∩ Điện Biên Phủ · hướng Điện Biên Phủ' },
    { camera_id: 'CAM-HX-002', fps: 2, url: '/api/v1/media/stream/CAM-HX-002', active: true, label: 'Ngã tư Hàng Xanh ∩ Xô Viết Nghệ Tĩnh · hướng Xô Viết Nghệ Tĩnh' },
    { camera_id: 'CAM-HX-003', fps: 2, url: '/api/v1/media/stream/CAM-HX-003', active: true },
  ];

  it('gồm camera_id và nhãn hiển thị, giữ nguyên thứ tự backend', () => {
    const opts = cameraOptions(streams);
    assert.deepEqual(opts.map(o => o.value), ['CAM-HX-001', 'CAM-HX-002', 'CAM-HX-003']);
    assert.equal(opts[0].label, 'CAM-HX-001 · Cầu vượt Hàng Xanh ∩ Điện Biên Phủ · hướng Điện Biên Phủ');
    assert.equal(opts[2].label, 'CAM-HX-003');   // thiếu label → dùng mã
  });

  it('bỏ phần tử thiếu camera_id và dedupe mã trùng', () => {
    const opts = cameraOptions([
      { camera_id: '', active: true },
      ...streams,
      { camera_id: 'CAM-HX-001', active: true, label: 'trùng' },
    ]);
    assert.deepEqual(opts.map(o => o.value), ['CAM-HX-001', 'CAM-HX-002', 'CAM-HX-003']);
  });

  it('cameraDefault chọn camera đầu tiên; rỗng thì null', () => {
    assert.equal(cameraDefault(streams), 'CAM-HX-001');
    assert.equal(cameraDefault([]), null);
  });

  it('cameraGridSlice và cameraPageForId phân trang đúng cho lưới 1/4/9', () => {
    const ten = Array.from({ length: 10 }, (_, i) => ({ value: `CAM-${i + 1}`, label: `Cam ${i + 1}` }));
    const p1 = cameraGridSlice(ten, 4, 1);
    assert.equal(p1.page, 1);
    assert.equal(p1.totalPages, 3);
    assert.deepEqual(p1.items.map(x => x.value), ['CAM-1', 'CAM-2', 'CAM-3', 'CAM-4']);
    const p3 = cameraGridSlice(ten, 4, 99);
    assert.equal(p3.page, 3);
    assert.deepEqual(p3.items.map(x => x.value), ['CAM-9', 'CAM-10']);
    const p9 = cameraGridSlice(ten, 9, 2);
    assert.equal(p9.totalPages, 2);
    assert.deepEqual(p9.items.map(x => x.value), ['CAM-10']);
    assert.equal(cameraPageForId(ten, 'CAM-7', 4), 2);
    assert.equal(cameraPageForId(ten, 'CAM-10', 9), 2);
    assert.equal(cameraPageForId(ten, 'MISSING', 4), 1);
  });
});
