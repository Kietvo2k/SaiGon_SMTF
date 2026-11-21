import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('cổng công dân mặc định', () => {
  it('cho tra biển số trực tiếp, không đòi tài khoản hoặc mã đăng ký xe', () => {
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain('Nhập biển số xe');
    expect(html).toContain('51K-123.45');
    expect(html).toContain('data:image/svg+xml');
    expect(html).not.toContain('Tên đăng nhập');
    expect(html).not.toContain('Mã đăng ký xe');
    expect(html).not.toContain('Biển số của tôi');
  });

  it('có vùng thông báo trạng thái và nhãn thật cho ô biển số', () => {
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain('for="plate-input"');
    expect(html).toContain('id="plate-input"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('aria-describedby="plate-help"');
  });

  it('hiển thị đủ ba biển mẫu để bấm thử', () => {
    const html = renderToStaticMarkup(<App />);
    for (const plate of ['51K-123.45', '50H-222.33', '51G-678.90']) {
      expect(html).toContain(plate);
    }
  });
});
