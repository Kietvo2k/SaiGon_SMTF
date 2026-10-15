export function formatVnd(n: number): string {
  return n.toLocaleString('vi-VN') + ' đ';
}

// Chưa xác minh (NĐ 168/2024 chưa đủ) thì không hiện số tiền; backend cũng không gửi số tiền trong trường hợp này.
export function formatPenalty(p: { vnd_min?: number | null; vnd_max?: number | null; verified?: boolean } | null | undefined): string {
  if (!p || !p.verified) return 'Mức phạt đang cập nhật theo NĐ 168/2024/NĐ-CP';
  return `${formatVnd(p.vnd_min ?? 0)} – ${formatVnd(p.vnd_max ?? 0)}`;
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
