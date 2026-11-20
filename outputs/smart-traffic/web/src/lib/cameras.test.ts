// Test cho cameraOptions — danh sách camera giao lộ dùng để chọn trình chiếu.
import { assert, describe, it } from 'vitest';
import {
  cameraDefault, cameraGridSlice, cameraGroups, cameraJunctions,
  cameraOptions, cameraPageForId, filterCamerasByJunction,
} from './cameras';

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

  it('cameraGroups, cameraJunctions và filterCamerasByJunction nhóm và lọc đúng theo nút giao lộ', () => {
    const groups = cameraGroups([
      ...streams,
      { camera_id: 'CAM-HX-004', label: 'Ngã tư Hàng Xanh ∩ Xô Viết Nghệ Tĩnh · hướng Nam', active: true },
      { camera_id: 'CAM-HX-009', junction_id: 'HX-04', label: 'hướng về XVNT', active: true },
    ]);
    assert.deepEqual(
      groups.map(g => [g.junction, g.items.map(i => i.value)]),
      [
        ['Cầu vượt Hàng Xanh × Điện Biên Phủ', ['CAM-HX-001']],
        ['Ngã tư Hàng Xanh × Xô Viết Nghệ Tĩnh', ['CAM-HX-002', 'CAM-HX-004']],
        ['Nút khác', ['CAM-HX-003']],
        ['HX-04', ['CAM-HX-009']],
      ],
    );
    assert.equal(groups[0].items[0].direction, 'hướng Điện Biên Phủ');
    assert.deepEqual(cameraJunctions([
      ...streams,
      { camera_id: 'CAM-HX-004', label: 'Ngã tư Hàng Xanh ∩ Xô Viết Nghệ Tĩnh · hướng Nam' },
    ]), [
      { junction: 'Cầu vượt Hàng Xanh × Điện Biên Phủ', count: 1 },
      { junction: 'Ngã tư Hàng Xanh × Xô Viết Nghệ Tĩnh', count: 2 },
      { junction: 'Nút khác', count: 1 },
    ]);
    assert.deepEqual(
      filterCamerasByJunction(groups, 'Ngã tư Hàng Xanh × Xô Viết Nghệ Tĩnh').map(c => c.value),
      ['CAM-HX-002', 'CAM-HX-004'],
    );
    assert.equal(filterCamerasByJunction(groups, '').length, 5);
    assert.deepEqual(filterCamerasByJunction(groups, 'Không tồn tại'), []);
  });
});
