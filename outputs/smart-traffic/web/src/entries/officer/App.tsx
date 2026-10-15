import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Api, ApiError, errorMessage, login, loadToken, makeApi, saveToken } from '../../lib/api';
import { OFFICER_TAB_LABELS, OfficerTab, officerTabs } from '../../lib/access';
import { roleLabel } from '../../lib/labels';
import { connectSmartWs, WsMessage } from '../../lib/ws';
import type { Kpi, Me } from '../../lib/types';
import { ViolationsTab } from './ViolationsTab';
import { ComplaintsTab } from './ComplaintsTab';
import { StatsTab } from './StatsTab';
import { AuditTab } from './AuditTab';
import { StaffTab } from './StaffTab';

const TITLE = 'SaiGon SMTF · Trung tâm điều hành giao thông khu Bắc';
const EXPIRED = 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.';
const MODE_LABEL: Record<string, string> = { fixed: 'Cố định', smart: 'Thông minh' };

export function App() {
  const [token, setToken] = useState<string | null>(() => loadToken('officer'));
  const [me, setMe] = useState<Me | null>(null);
  const [tab, setTab] = useState<OfficerTab>('violations');
  const [tick, setTick] = useState(0);
  const [kpi, setKpi] = useState<Kpi>({});
  const [notice, setNotice] = useState('');

  const signOut = useCallback((message: string) => {
    saveToken('officer', null);
    setToken(null);
    setMe(null);
    setKpi({});
    setNotice(message);
  }, []);

  const api: Api = useMemo(() => makeApi(token, () => signOut(EXPIRED)), [token, signOut]);
  const bump = useCallback(() => setTick(t => t + 1), []);

  // Vai trò lấy từ /auth/me; không có tab nào (công dân, trạm) thì không cho vào.
  useEffect(() => {
    if (!token) return;
    let alive = true;
    makeApi(token).get<Me>('/auth/me')
      .then(info => {
        if (!alive) return;
        const tabs = officerTabs(info.role);
        if (tabs.length === 0) {
          signOut('Tài khoản này không có quyền vào trang cán bộ.');
          return;
        }
        setMe(info);
        setTab(tabs[0]);
      })
      .catch(e => {
        if (!alive) return;
        signOut(e instanceof ApiError && e.status === 401 ? EXPIRED : errorMessage(e));
      });
    return () => { alive = false; };
  }, [token, signOut]);

  // Thời gian thực: sự kiện vi phạm/khiếu nại làm tải lại; KPI cập nhật trực tiếp; dự phòng làm mới 15 s.
  useEffect(() => {
    if (!token || !me) return;
    const stop = connectSmartWs(token, (msg: WsMessage) => {
      if (msg.event === 'kpi.update') setKpi(msg.data ?? {});
      else if (['violation.created', 'violation.updated', 'complaint.updated'].includes(msg.event)) bump();
    });
    const timer = setInterval(bump, 15000);
    return () => {
      stop();
      clearInterval(timer);
    };
  }, [token, me, bump]);

  useEffect(() => {
    if (!me) return;
    api.get<Kpi>('/officer/kpi').then(setKpi).catch(() => undefined);
  }, [api, me, tick]);

  if (!token) {
    return <LoginForm notice={notice} onLogin={async (u, p) => {
      const body = await login(u, p);
      saveToken('officer', body.access_token);
      setNotice('');
      setToken(body.access_token);
    }} />;
  }
  if (!me) return <p className="loading" role="status">Đang kiểm tra phiên đăng nhập…</p>;

  const tabs = officerTabs(me.role);
  const current = tabs.includes(tab) ? tab : tabs[0];

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>{TITLE}</h1>
          <p className="who">{me.display_name || me.username} · {roleLabel(me.role)}</p>
        </div>
        <button type="button" className="ghost" onClick={() => signOut('')}>Đăng xuất</button>
      </header>

      <section className="kpi" aria-label="Chỉ số hệ thống">
        <span>Chờ trung bình <b>{kpi.wait_avg_s ?? '–'}</b> s</span>
        <span>Hàng chờ lớn nhất <b>{kpi.queue_max ?? '–'}</b></span>
        <span>Lưu lượng <b>{kpi.flow_per_min ?? '–'}</b> xe/phút</span>
        <span>Chế độ đèn <b>{MODE_LABEL[kpi.mode ?? ''] ?? (kpi.mode || '–')}</b></span>
      </section>

      {notice && <p className="notice" role="status">{notice}</p>}

      <nav className="tabs" role="tablist" aria-label="Chức năng">
        {tabs.map(t => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={current === t}
            className={current === t ? 'tab active' : 'tab'}
            onClick={() => setTab(t)}
          >
            {OFFICER_TAB_LABELS[t]}
          </button>
        ))}
      </nav>

      <main role="tabpanel">
        {current === 'violations' && <ViolationsTab api={api} tick={tick} onChanged={bump} />}
        {current === 'complaints' && <ComplaintsTab api={api} tick={tick} onChanged={bump} />}
        {current === 'stats' && <StatsTab api={api} tick={tick} />}
        {current === 'audit' && <AuditTab api={api} tick={tick} />}
        {current === 'staff' && <StaffTab api={api} selfId={me.id} />}
      </main>
    </div>
  );
}

function LoginForm({ notice, onLogin }: { notice: string; onLogin: (u: string, p: string) => Promise<void> }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await onLogin(username.trim(), password);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPassword('');   // không giữ mật khẩu trong state sau khi gửi
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <form className="login" onSubmit={submit}>
        <h1>{TITLE}</h1>
        <p className="hint">Đăng nhập tài khoản cán bộ hoặc quản trị.</p>
        <label>Tài khoản
          <input value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" required />
        </label>
        <label>Mật khẩu
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required />
        </label>
        <button type="submit" disabled={busy}>{busy ? 'Đang đăng nhập…' : 'Đăng nhập'}</button>
        {(error || notice) && <p className="error" role="alert">{error || notice}</p>}
      </form>
    </div>
  );
}
