import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, errorMessage, loadToken, makeApi, saveToken } from '../../lib/api';
import { connectSmartWs, WsMessage } from '../../lib/ws';
import type { CitizenAccount } from '../../lib/types';
import { AuthPanel } from './AuthPanel';
import { LookupPanel } from './LookupPanel';
import { NotificationCenter } from './NotificationCenter';
import { PlatesPanel } from './PlatesPanel';
import { TrafficAlertsPanel } from './TrafficAlertsPanel';
import { ViolationsPanel } from './ViolationsPanel';

const EXPIRED = 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.';
const NOT_CITIZEN = 'Trang này dành cho công dân. Cán bộ vui lòng đăng nhập trang cán bộ.';

export function App() {
  const [token, setToken] = useState<string | null>(() => loadToken('citizen'));
  const [account, setAccount] = useState<CitizenAccount | null>(null);
  const [tick, setTick] = useState(0);
  const [notice, setNotice] = useState('');

  const signOut = useCallback((message: string) => {
    saveToken('citizen', null);
    setToken(null);
    setAccount(null);
    setNotice(message);
  }, []);

  const api = useMemo(() => makeApi(token, () => signOut(EXPIRED)), [token, signOut]);
  const bump = useCallback(() => setTick(t => t + 1), []);

  // Tài khoản công dân: /citizen/account từ chối vai trò khác (403) nên đây cũng là bước kiểm quyền.
  useEffect(() => {
    if (!token) return;
    let alive = true;
    makeApi(token).get<CitizenAccount>('/citizen/account')
      .then(a => {
        if (alive) setAccount(a);
      })
      .catch(e => {
        if (!alive) return;
        if (e instanceof ApiError && e.status === 401) signOut(EXPIRED);
        else signOut(e instanceof ApiError && e.status === 403 ? NOT_CITIZEN : errorMessage(e));
      });
    return () => { alive = false; };
  }, [token, signOut]);

  const reloadAccount = useCallback(() => {
    api.get<CitizenAccount>('/citizen/account')
      .then(setAccount)
      .catch(() => undefined);
    bump();
  }, [api, bump]);

  // Thông báo tức thời: notification.new, violation.updated, complaint.updated làm tải lại danh sách.
  useEffect(() => {
    if (!token) return;
    return connectSmartWs(token, (msg: WsMessage) => {
      if (msg.event === 'notification.new') {
        setNotice('Bạn có thông báo mới về vi phạm giao thông.');
        bump();
      } else if (msg.event === 'violation.updated' || msg.event === 'complaint.updated') {
        bump();
      }
    });
  }, [token, bump]);

  return (
    <div className="page">
      <header className="topbar">
        <h1>Tra cứu vi phạm giao thông</h1>
        {account ? (
          <div className="who-box">
            <span>{account.full_name || account.username}</span>
            <button type="button" className="ghost" onClick={() => signOut('')}>Đăng xuất</button>
          </div>
        ) : null}
      </header>

      <main className="wrap">
        {notice && <p className="notice" role="status">{notice}</p>}

        {!token && <AuthPanel onLoggedIn={t => {
          saveToken('citizen', t);
          setNotice('');
          setToken(t);
        }} />}

        {token && !account && <p className="hint" role="status">Đang tải tài khoản…</p>}

        {token && account && (
          <>
            <NotificationCenter api={api} tick={tick} onChanged={bump} />
            <PlatesPanel api={api} account={account} onChanged={reloadAccount} />
            <ViolationsPanel api={api} tick={tick} hasPlates={account.plates.length > 0} onChanged={bump} />
          </>
        )}

        <TrafficAlertsPanel />

        <LookupPanel />
      </main>
    </div>
  );
}
