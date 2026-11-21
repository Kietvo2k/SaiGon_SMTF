import { evidenceKindLabel } from '../../lib/labels';

// Nhãn ngắn cho thumbnail; vẫn giữ nhãn đầy đủ trong alt để trình đọc màn hình mô tả đúng.
const SHORT: Record<string, string> = {
  before: 'Trước khi vượt vạch',
  after: 'Sau khi vượt vạch',
  plate: 'Ảnh biển số',
  plate_crop: 'Ảnh biển số',
};

export function evidenceShortLabel(kind: string): string {
  return SHORT[kind] ?? evidenceKindLabel(kind);
}
