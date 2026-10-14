export function formatVnd(n: number): string {
  return n.toLocaleString('vi-VN') + ' đ';
}

export function formatPenalty(p: { vnd_min?: number; vnd_max?: number; verified?: boolean }): string {
  if (!p || !p.verified) return 'Mức phạt đang cập nhật theo NĐ 168/2024/NĐ-CP';
  return `${formatVnd(p.vnd_min ?? 0)} – ${formatVnd(p.vnd_max ?? 0)}`;
}
