// Test cho cameraOptions — danh sách camera giao lộ dùng để chọn trình chiếu.
import { assert, describe, it } from 'vitest';
import { cameraOptions, cameraDefault } from './cameras';

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
});
