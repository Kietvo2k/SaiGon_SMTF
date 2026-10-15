export function formatVnd(n: number): string {
  return n.toLocaleString('vi-VN') + ' đ';
}

// Chưa xác minh (NĐ 168/2024 chưa đủ) thì không hiện số tiền; backend cũng không gửi số tiền trong trường hợp này.
export function formatPenalty(p: { vnd_min?: number | null; vnd_max?: number | null; verified?: boolean } | null | undefined): string {
  if (!p || !p.verified) return 'Mức phạt đang cập nhật theo NĐ 168/2024/NĐ-CP';
  return `${formatVnd(p.vnd_min ?? 0)} – ${formatVnd(p.vnd_max ?? 0)}`;
}

// Ô ngày dd/mm/yyyy: chỉ giữ chữ số và tự chèn "/" sau ngày và tháng (tối đa 8 chữ số).
export function formatDateInput(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

// dd/mm/yyyy → yyyy-mm-dd (định dạng API); ngày không tồn tại (31/02) hoặc sai mẫu → null.
export function parseDateVi(text: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  if (!m) return null;
  const [day, month, year] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

// yyyy-mm-dd → dd/mm/yyyy để hiển thị; chuỗi khác (kể cả rỗng) trả lại nguyên hoặc rỗng.
export function isoToVi(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

// Thời điểm theo giờ Việt Nam (UTC+7), dạng dd/mm/yyyy hh:mm.
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '–';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
