import { lazy, Suspense, useState } from 'react';
import { LookupPanel } from './LookupPanel';
import { TrafficAlertsPanel } from './TrafficAlertsPanel';

const AccountWorkspace = lazy(() => import('./AccountWorkspace'));

export function App() {
  const [accountOpen, setAccountOpen] = useState(false);
  if (accountOpen) return (
    <Suspense fallback={<p className="loading" role="status">Đang mở hồ sơ cá nhân…</p>}>
      <AccountWorkspace onBack={() => setAccountOpen(false)} />
    </Suspense>
  );
  return (
    <div className="page public-page">
      <header className="public-header">
        <a className="wordmark" href="index-citizen.html" aria-label="SaiGon SMTF · Tra cứu">SMTF<span>SAIGON</span></a>
        <span className="public-area">Giao thông khu Bắc</span>
      </header>
      <main className="public-main">
        <div className="lookup-intro">
          <p className="eyebrow">THÔNG TIN VI PHẠM</p>
          <h1>Tra cứu vi phạm<br />giao thông</h1>
          <p>Nhập biển số để xem kết quả. Không cần đăng nhập.</p>
        </div>
        <LookupPanel />
        <details className="traffic-disclosure">
          <summary>Tình hình giao thông khu vực</summary>
          <TrafficAlertsPanel />
        </details>
      </main>
      <footer className="public-footer">
        <span>SaiGon SMTF · Thông tin giao thông khu Bắc</span>
        <button type="button" className="text-button" onClick={() => setAccountOpen(true)}>Hồ sơ cá nhân</button>
      </footer>
    </div>
  );
}
