import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { ApiError, errorMessage, loadToken, makeApi, saveToken } from '../../lib/api';
import { connectSmartWs, WsMessage } from '../../lib/ws';
import type { CitizenAccount } from '../../lib/types';
import { AuthPanel } from './AuthPanel';
import { BrandLogo } from './BrandLogo';
import { NotificationCenter } from './NotificationCenter';
import { PlatesPanel } from './PlatesPanel';
import { ProfilePanel } from './ProfilePanel';
import { TrafficAlertsPanel } from './TrafficAlertsPanel';
import { ViolationsPanel } from './ViolationsPanel';
import type { CitizenMode } from './citizenApi';
import { AlertIcon, BellIcon, CheckIcon, LockIcon, UserIcon } from './icons';
import { PlateChip } from './PlateChip';

const EXPIRED = 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.';
const NOT_CITIZEN = 'Trang này dành cho công dân. Cán bộ vui lòng đăng nhập trang cán bộ.';
const SAMPLE_PLATES = ['51K-123.45', '50H-222.33', '51G-678.90'];

type TabId = 'profile' | 'plates' | 'notifications' | 'alerts';

const TABS: { id: TabId; label: string }[] = [
  { id: 'profile', label: 'Hồ sơ' },
  { id: 'plates', label: 'Biển số' },
  { id: 'notifications', label: 'Thông báo' },
  { id: 'alerts', label: 'Cảnh báo' },
];

interface Props {
  onBack: () => void;
  mode?: CitizenMode;
  onLookupPlate?: (plate: string) => void;
}

function AccountHeader({ onBack, name, onSignOut }: { onBack: () => void; name?: string; onSignOut?: () => void }) {
  return (
    <header className="cz-header cz-header-account">
      <a className="cz-brand" href="index-citizen.html" aria-label="Smart Traffic · về trang tra cứu">
        <BrandLogo size={40} />
        <span className="cz-brand-text">
          <strong>Smart Traffic</strong>
          <small>SaiGon SMTF</small>
        </span>
      </a>
      <div className="cz-header-actions">
        {name && <span className="cz-user-chip"><UserIcon width={16} height={16} />{name}</span>}
        {name && onSignOut && (
          <button type="button" className="cz-btn cz-btn-ghost" onClick={onSignOut}>Đăng xuất</button>
        )}
        <button type="button" className="cz-btn cz-btn-outline" onClick={onBack}>← Về tra cứu</button>
      </div>
    </header>
  );
}

function TabBar({ active, onChange }: { active: TabId; onChange: (tab: TabId) => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? TABS.length - 1
        : event.key === 'ArrowRight'
          ? (index + 1) % TABS.length
          : (index - 1 + TABS.length) % TABS.length;
    onChange(TABS[nextIndex].id);
    refs.current[nextIndex]?.focus();
  };
  return (
    <div className="cz-tabs" role="tablist" aria-label="Khu tài khoản công dân">
      {TABS.map((tab, index) => (
        <button
          key={tab.id}
          ref={element => { refs.current[index] = element; }}
          type="button"
          role="tab"
          id={`cz-tab-${tab.id}`}
          aria-selected={active === tab.id}
          aria-controls={`cz-panel-${tab.id}`}
          tabIndex={active === tab.id ? 0 : -1}
          className={`cz-tab${active === tab.id ? ' is-active' : ''}`}
          onClick={() => onChange(tab.id)}
          onKeyDown={event => onKeyDown(event, index)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

// Panel của tab đang chọn đứng đầu DOM để trình đọc màn hình và công cụ kiểm
// luôn gặp đúng nội dung; 3 panel còn lại vẫn tồn tại (hidden) cho aria-controls.
function PanelSet({ active, render }: { active: TabId; render: (id: TabId) => ReactNode }) {
  const order = [active, ...TABS.map(tab => tab.id).filter(id => id !== active)];
  return (
    <>
      {order.map(id => (
        <div
          key={id}
          role="tabpanel"
          id={`cz-panel-${id}`}
          aria-labelledby={`cz-tab-${id}`}
          className="cz-tab-panel"
          hidden={id !== active}
          tabIndex={id === active ? 0 : undefined}
        >
          {id === active ? render(id) : null}
        </div>
      ))}
    </>
  );
}

function PublicAccount({ onLookupPlate }: { onLookupPlate?: (plate: string) => void }) {
  const [tab, setTab] = useState<TabId>('profile');
  return (
    <div className="cz-account-shell">
      <div className="cz-account-intro">
        <p className="cz-kicker">Tài khoản công dân</p>
        <h1>Khu tài khoản</h1>
        <p>Bản công khai không lưu hồ sơ cá nhân. Bạn vẫn tra cứu được mọi biển trong danh sách gợi ý mà không cần đăng nhập.</p>
      </div>
      <TabBar active={tab} onChange={setTab} />
      <PanelSet
        active={tab}
        render={id => {
          if (id === 'profile') {
            return (
              <section className="cz-panel" aria-labelledby="public-profile-title">
                <div className="cz-profile-head">
                  <span className="cz-avatar" aria-hidden="true">K</span>
                  <div>
                    <p className="cz-kicker">Phiên hiện tại</p>
                    <h2 id="public-profile-title">Khách tra cứu</h2>
                    <p className="cz-muted">Không đăng nhập · Khách tra cứu</p>
                  </div>
                </div>
                <dl className="cz-profile-facts">
                  <div><dt>Phiên</dt><dd>Công khai</dd></div>
                  <div><dt>Lưu trữ</dt><dd>Không lưu hồ sơ cá nhân</dd></div>
                  <div><dt>Đăng nhập</dt><dd>Có trên bản nội bộ</dd></div>
                  <div><dt>Thông báo</dt><dd>Không gửi trong bản công khai</dd></div>
                </dl>
                <div className="cz-panel-note">
                  <LockIcon width={19} height={19} />
                  <p>Đăng nhập, gắn biển và nhận thông báo dùng tài khoản công dân ở bản chạy Docker nội bộ.</p>
                </div>
              </section>
            );
          }
          if (id === 'plates') {
            return (
              <section className="cz-panel" aria-labelledby="public-plates-title">
                <div className="cz-panel-head">
                  <h2 id="public-plates-title">Biển số mẫu</h2>
                  <span className="cz-muted">3 biển</span>
                </div>
                <p className="cz-hint">Chọn một biển để quay lại trang tra cứu với biển đó.</p>
                <ul className="cz-plate-list">
                  {SAMPLE_PLATES.map(plate => (
                    <li key={plate}>
                      <PlateChip plate={plate} size="md" />
                      <button
                        type="button"
                        className="cz-btn cz-btn-ghost"
                        onClick={() => onLookupPlate?.(plate)}
                      >
                        Tra biển này
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            );
          }
          if (id === 'notifications') {
            return (
              <section className="cz-panel cz-empty-panel" aria-labelledby="public-notify-title">
                <span className="cz-empty-icon"><BellIcon width={26} height={26} /></span>
                <h2 id="public-notify-title">Không có thông báo cá nhân</h2>
                <p>Bản công khai không lưu thông báo. Trên bản nội bộ, thông báo về vi phạm mới sẽ xuất hiện ở đây.</p>
              </section>
            );
          }
          return (
            <section className="cz-panel cz-empty-panel" aria-labelledby="public-alerts-title">
              <span className="cz-empty-icon"><AlertIcon width={26} height={26} /></span>
              <h2 id="public-alerts-title">Cảnh báo giao thông</h2>
              <p>
                Cảnh báo theo khung giờ nằm trong trang cảnh 3D và bản điều hành nội bộ. Bản công khai chỉ hiển thị
                hồ sơ theo biển số.
              </p>
              <a className="cz-btn cz-btn-outline" href="index.html">Về trang chủ</a>
            </section>
          );
        }}
      />
    </div>
  );
}

export default function AccountWorkspace({ onBack, mode = 'local', onLookupPlate }: Props) {
  const [token, setToken] = useState<string | null>(() => loadToken('citizen'));
  const [account, setAccount] = useState<CitizenAccount | null>(null);
  const [tick, setTick] = useState(0);
  const [notice, setNotice] = useState('');
  const [tab, setTab] = useState<TabId>('profile');
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const previous = document.title;
    document.title = 'Khu tài khoản · Smart Traffic';
    const frame = requestAnimationFrame(() => mainRef.current?.focus());
    return () => {
      cancelAnimationFrame(frame);
      document.title = previous;
    };
  }, []);

  const signOut = useCallback((message: string) => {
    saveToken('citizen', null);
    setToken(null);
    setAccount(null);
    setNotice(message);
  }, []);

  const api = useMemo(() => makeApi(token, () => signOut(EXPIRED)), [token, signOut]);
  const bump = useCallback(() => setTick(value => value + 1), []);

  useEffect(() => {
    if (mode !== 'local' || !token) return undefined;
    let alive = true;
    makeApi(token).get<CitizenAccount>('/citizen/account')
      .then(result => {
        if (alive) setAccount(result);
      })
      .catch(error => {
        if (!alive) return;
        if (error instanceof ApiError && error.status === 401) signOut(EXPIRED);
        else signOut(error instanceof ApiError && error.status === 403 ? NOT_CITIZEN : errorMessage(error));
      });
    return () => { alive = false; };
  }, [mode, token, signOut]);

  const reloadAccount = useCallback(() => {
    api.get<CitizenAccount>('/citizen/account')
      .then(setAccount)
      .catch(() => undefined);
    bump();
  }, [api, bump]);

  useEffect(() => {
    if (mode !== 'local' || !token) return undefined;
    return connectSmartWs(token, (message: WsMessage) => {
      if (message.event === 'notification.new') {
        setNotice('Bạn có thông báo mới về vi phạm giao thông.');
        bump();
      } else if (message.event === 'violation.updated' || message.event === 'complaint.updated') {
        bump();
      }
    });
  }, [mode, token, bump]);

  const name = account?.full_name || account?.display_name || account?.username;

  return (
    <div className="cz-app cz-account-page">
      <a className="cz-skip-link" href="#account-main">Bỏ qua điều hướng</a>
      <AccountHeader
        onBack={onBack}
        name={mode === 'local' ? name : undefined}
        onSignOut={mode === 'local' && account ? () => signOut('') : undefined}
      />
      <main className="cz-account-main" id="account-main" ref={mainRef} tabIndex={-1}>
        {notice && <p className="cz-flash is-warn" role="status"><AlertIcon /><span>{notice}</span></p>}

        {mode === 'public' && <PublicAccount onLookupPlate={onLookupPlate} />}

        {mode === 'local' && !token && (
          <div className="cz-auth-grid">
            <aside className="cz-auth-intro">
              <p className="cz-kicker">Tài khoản công dân</p>
              <h1>Đăng nhập để theo dõi hồ sơ của mình</h1>
              <p>Trang công khai chỉ cần biển số. Đăng nhập khi bạn muốn gắn biển, nhận thông báo và khiếu nại.</p>
              <ul className="cz-benefit-list">
                <li><CheckIcon /> Gắn tối đa biển số của bạn</li>
                <li><CheckIcon /> Nhận thông báo khi hồ sơ thay đổi</li>
                <li><CheckIcon /> Gửi khiếu nại và xem kết quả xử lý</li>
                <li><CheckIcon /> Nộp phạt chỉ đổi trạng thái hồ sơ</li>
              </ul>
            </aside>
            <AuthPanel onLoggedIn={value => {
              saveToken('citizen', value);
              setNotice('');
              setToken(value);
            }} />
          </div>
        )}

        {mode === 'local' && token && !account && (
          <div className="cz-account-shell" aria-busy="true" aria-label="Đang tải tài khoản">
            <div className="cz-skeleton cz-skeleton-line is-short" />
            <div className="cz-skeleton cz-skeleton-block" />
          </div>
        )}

        {mode === 'local' && token && account && (
          <div className="cz-account-shell">
            <div className="cz-account-intro">
              <p className="cz-kicker">Tài khoản công dân</p>
              <h1>Xin chào, {account.full_name || account.display_name || account.username}</h1>
              <p>Quản lý biển số, theo dõi thông báo và xử lý hồ sơ của bạn tại một nơi.</p>
            </div>

            <TabBar active={tab} onChange={setTab} />

            <PanelSet
              active={tab}
              render={id => {
                if (id === 'profile') {
                  return (
                    <div className="cz-stack">
                      <ProfilePanel account={account} />
                      <ViolationsPanel
                        api={api}
                        tick={tick}
                        hasPlates={account.plates.length > 0}
                        onChanged={bump}
                      />
                    </div>
                  );
                }
                if (id === 'plates') return <PlatesPanel api={api} account={account} onChanged={reloadAccount} />;
                if (id === 'notifications') return <NotificationCenter api={api} tick={tick} onChanged={bump} inline />;
                return (
                  <div className="cz-stack">
                    <p className="cz-hint">Cảnh báo kẹt xe công khai, làm mới mỗi 30 giây. Không cần đăng nhập.</p>
                    <TrafficAlertsPanel />
                  </div>
                );
              }}
            />
          </div>
        )}
      </main>
    </div>
  );
}
