import { lazy, Suspense, useRef, useState } from 'react';
import { BrandLogo } from './BrandLogo';
import type { CitizenMode } from './citizenApi';
import { CameraIcon, CheckIcon, ShieldIcon, UserIcon } from './icons';
import { LookupPanel } from './LookupPanel';
import { TrafficAlertsPanel } from './TrafficAlertsPanel';
import { ThemeToggle } from '../../theme/ThemeToggle';

const AccountWorkspace = lazy(() => import('./AccountWorkspace'));

interface Props {
  mode?: CitizenMode;
}

export function App({ mode = 'local' }: Props) {
  const [accountOpen, setAccountOpen] = useState(false);
  const [seed, setSeed] = useState<{ plate: string; nonce: number } | null>(null);
  const seedNonce = useRef(0);

  const openAccount = () => setAccountOpen(true);
  const lookupPlate = (plate: string) => {
    seedNonce.current += 1;
    setSeed({ plate, nonce: seedNonce.current });
    setAccountOpen(false);
  };

  if (accountOpen) {
    return (
      <Suspense
        fallback={(
          <div className="cz-app cz-account-page">
            <div className="cz-account-fallback" role="status">
              <span className="cz-spinner" aria-hidden="true" />
              Đang mở khu tài khoản…
            </div>
          </div>
        )}
      >
        <AccountWorkspace mode={mode} onBack={() => setAccountOpen(false)} onLookupPlate={lookupPlate} />
      </Suspense>
    );
  }

  return (
    <div className="cz-app">
      <a className="cz-skip-link" href="#main">Bỏ qua điều hướng</a>

      <header className="cz-header">
        <a className="cz-brand" href="index-citizen.html" aria-label="Smart Traffic · trang tra cứu biển số">
          <BrandLogo size={40} />
          <span className="cz-brand-text">
            <strong>Smart Traffic</strong>
            <small>SaiGon SMTF</small>
          </span>
        </a>

        <nav className="cz-nav" aria-label="Điều hướng chính">
          <a href="index.html">Giới thiệu</a>
          <a href="index-citizen.html" aria-current="page">Tra cứu</a>
          <a href="index-officer.html">Điều hành</a>
        </nav>

        <div className="cz-header-actions">
          <ThemeToggle />
          {mode !== 'public' && (
            <button type="button" className="cz-btn cz-btn-outline" onClick={openAccount}>
              <UserIcon width={17} height={17} />
              <span>Đăng nhập</span>
            </button>
          )}
        </div>
      </header>

      <main id="main" className="cz-main">
        <section className="cz-hero" aria-labelledby="page-title">
          <div className="cz-hero-copy">
            <p className="cz-eyebrow">Cổng thông tin giao thông khu Bắc</p>
            <h1 id="page-title">Tra cứu biển số,{' '}<br />xem rõ từng vi phạm.</h1>
            <p className="cz-lede">
              Hồ sơ, ảnh bằng chứng trước–sau vạch và mức phạt kèm căn cứ pháp lý — trong một lần tra.
            </p>
            <p className="cz-hero-note">Không cần đăng nhập để tra cứu · Ô tô và xe máy · Biển số được chuẩn hoá tự động.</p>
          </div>

          <LookupPanel mode={mode} seed={seed} onRequireLogin={openAccount} />
        </section>

        <ul className="cz-data-strip" aria-label="Nguồn và phạm vi dữ liệu">
          <li><CameraIcon width={19} height={19} /><span>Camera giao thông khu Bắc TP.HCM</span></li>
          <li><ShieldIcon width={19} height={19} /><span>Ảnh bằng chứng trước, sau vạch và biển số</span></li>
          <li><CheckIcon width={19} height={19} /><span>Căn cứ Nghị định 168/2024/NĐ-CP</span></li>
        </ul>

        {mode === 'local' && (
          <details className="cz-alerts">
            <summary>
              <span>Tình hình giao thông khu vực</span>
              <span className="cz-muted">Cập nhật mỗi 30 giây</span>
            </summary>
            <TrafficAlertsPanel />
          </details>
        )}
      </main>

      <footer className="cz-footer">
        <div className="cz-footer-brand">
          <BrandLogo size={32} />
          <p>
            <strong>Smart Traffic</strong>
            <span>SaiGon SMTF · Cổng thông tin giao thông khu Bắc TP.HCM.</span>
          </p>
        </div>
        <nav className="cz-footer-links" aria-label="Liên kết chân trang">
          <a href="index.html">Trang chủ</a>
          <a href="index-officer.html">Trung tâm điều hành</a>
          {mode !== 'public' && <button type="button" className="cz-link" onClick={openAccount}>Tài khoản công dân</button>}
        </nav>
      </footer>
    </div>
  );
}
