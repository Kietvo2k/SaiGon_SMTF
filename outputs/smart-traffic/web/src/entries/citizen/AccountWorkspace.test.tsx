import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import AccountWorkspace from './AccountWorkspace';

describe('khu tài khoản công dân', () => {
  it('bản công khai có đủ 4 tab và không giả lập đăng nhập', () => {
    const html = renderToStaticMarkup(<AccountWorkspace mode="public" onBack={() => undefined} />);
    expect(html).toContain('role="tablist"');
    expect((html.match(/role="tab"/g) ?? []).length).toBe(4);
    for (const label of ['Hồ sơ', 'Biển số', 'Thông báo', 'Cảnh báo']) {
      expect(html).toContain(label);
    }
    expect(html).toContain('Khách tra cứu');
    expect(html).not.toContain('type="password"');
  });

  it('bản công khai cho quay lại trang tra cứu', () => {
    const html = renderToStaticMarkup(<AccountWorkspace mode="public" onBack={() => undefined} />);
    expect(html).toContain('← Về tra cứu');
  });

  it('mọi aria-controls đều trỏ tới panel tồn tại trong DOM', () => {
    const html = renderToStaticMarkup(<AccountWorkspace mode="public" onBack={() => undefined} />);
    const controls = [...html.matchAll(/aria-controls="([^"]+)"/g)].map(match => match[1]);
    expect(controls).toHaveLength(4);
    for (const id of controls) {
      expect(html, id).toContain(`id="${id}"`);
    }
    expect((html.match(/role="tabpanel"/g) ?? []).length).toBe(4);
  });

  it('bản nội bộ chưa đăng nhập vẫn giữ form đăng nhập công dân', () => {
    const html = renderToStaticMarkup(<AccountWorkspace mode="local" onBack={() => undefined} />);
    expect(html).toContain('Đăng nhập để theo dõi hồ sơ của mình');
    expect(html).toContain('Tên đăng nhập');
    expect(html).toContain('Mật khẩu');
  });
});
