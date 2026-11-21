import logoSvg from '../../../public/logo-smart-traffic.svg?raw';

// Nhúng nội dung logo từ public/ để QA cục bộ không phụ thuộc MIME của máy chủ tĩnh.
const logoSrc = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(logoSvg)}`;

export function BrandLogo({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <img
      className={className}
      src={logoSrc}
      alt=""
      width={size}
      height={size}
      aria-hidden="true"
      decoding="async"
    />
  );
}
