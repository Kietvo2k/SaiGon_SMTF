import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('cổng công dân mặc định', () => {
  it('cho tra biển số trực tiếp, không đòi tài khoản hoặc mã đăng ký xe', () => {
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain('Tra cứu vi phạm theo biển số');
    expect(html).not.toContain('Tên đăng nhập');
    expect(html).not.toContain('Mã đăng ký xe');
    expect(html).not.toContain('Biển số của tôi');
  });
});
