import { useState } from 'react';
import { formatDateInput, isoToVi, parseDateVi } from '../lib/format';

interface Props {
  label: string;
  value: string;                 // yyyy-mm-dd hoặc '' (định dạng API)
  onChange: (iso: string) => void;
}

// Ô ngày cố định dd/mm/yyyy (không dùng <input type="date"> vì trình duyệt tự theo ngôn ngữ máy).
// Chỉ báo giá trị lên cha khi ngày đủ và hợp lệ; xóa hết thì báo '' (bỏ bộ lọc).
export function DateField({ label, value, onChange }: Props) {
  const [text, setText] = useState(() => isoToVi(value));
  const [error, setError] = useState('');
  const [synced, setSynced] = useState(value);

  // Cha đổi giá trị (ví dụ "Xóa bộ lọc ngày") → đồng bộ ngay trong lúc render, không chờ hiệu ứng.
  if (value !== synced) {
    setSynced(value);
    setText(isoToVi(value));
    setError('');
  }

  const type = (raw: string) => {
    const formatted = formatDateInput(raw);
    setText(formatted);
    if (formatted === '') {
      setError('');
      onChange('');
      return;
    }
    const iso = parseDateVi(formatted);
    if (iso) {
      setError('');
      onChange(iso);
    } else {
      setError(formatted.length === 10 ? 'Ngày không hợp lệ, nhập theo dạng dd/mm/yyyy.' : 'Nhập đủ dd/mm/yyyy để lọc theo ngày.');
    }
  };

  // Rời ô khi còn dở: trả về giá trị đang áp dụng.
  const leave = () => {
    if (text !== '' && !parseDateVi(text)) {
      setText(isoToVi(value));
      setError('');
    }
  };

  return (
    <div className="date-field">
      <label>{label}
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="dd/mm/yyyy"
          maxLength={10}
          value={text}
          aria-invalid={error !== '' || undefined}
          onChange={e => type(e.target.value)}
          onBlur={leave}
        />
      </label>
      {error && <small className="field-error">{error}</small>}
    </div>
  );
}
