import type { HTMLAttributes } from 'react';

interface PlateChipProps extends HTMLAttributes<HTMLSpanElement> {
  plate: string;
  size?: 'sm' | 'md' | 'lg';
}

// Biển số tĩnh: nền trắng, viền đen, dải xanh VN — cùng ngôn ngữ với ô nhập.
export function PlateChip({ plate, size = 'sm', className = '', ...rest }: PlateChipProps) {
  return (
    <span className={`cz-plate-chip cz-plate-chip-${size} ${className}`.trim()} {...rest}>
      <span className="cz-plate-chip-strip" aria-hidden="true">VN</span>
      <span className="cz-plate-chip-value">{plate}</span>
    </span>
  );
}
