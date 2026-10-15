interface PagerProps {
  page: number;
  pages: number;
  onChange: (page: number) => void;
}

// Phân trang tối giản; ẩn khi chỉ có một trang.
export function Pager({ page, pages, onChange }: PagerProps) {
  if (pages <= 1) return null;
  return (
    <nav className="pager" aria-label="Phân trang">
      <button type="button" disabled={page <= 1} onClick={() => onChange(page - 1)}>Trang trước</button>
      <span>Trang {page} / {pages}</span>
      <button type="button" disabled={page >= pages} onClick={() => onChange(page + 1)}>Trang sau</button>
    </nav>
  );
}

export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}
