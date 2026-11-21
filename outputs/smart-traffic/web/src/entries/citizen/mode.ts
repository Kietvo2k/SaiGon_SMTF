// Bản build Vercel bật VITE_SMTF_SUBMIT=1 cho cả trang công dân.
// Giữ nhận diện riêng: trang này luôn dùng entry citizen, chỉ đổi nguồn dữ liệu.
export function isDemoRoute(envValue: string | undefined, search?: string): boolean {
  if (envValue === '1') return true;
  const query = search ?? (typeof window !== 'undefined' ? window.location.search : '');
  return new URLSearchParams(query).get('demo') === 'vercel';
}
