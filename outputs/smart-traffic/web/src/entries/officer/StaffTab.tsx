import { FormEvent, useEffect, useState } from 'react';
import { Api, errorMessage } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { roleLabel } from '../../lib/labels';
import type { Page, StaffUser } from '../../lib/types';

interface Props {
  api: Api;
  selfId: number;
}

type StaffRole = 'officer' | 'commander';
const ROLE_OPTIONS: [StaffRole, string][] = [['officer', 'Cán bộ xử lý'], ['commander', 'Chỉ huy trực ban']];
const USERNAME_RE = /^[A-Za-z0-9_.-]{3,32}$/;

interface Flash {
  ok: boolean;
  text: string;
}

// Chỉ admin mới vào tab này. Không thao tác được trên chính mình (backend cũng chặn).
export function StaffTab({ api, selfId }: Props) {
  const [roleFilter, setRoleFilter] = useState<'' | StaffRole>('');
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [loadError, setLoadError] = useState('');

  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [newRole, setNewRole] = useState<StaffRole>('officer');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let alive = true;
    const qs = roleFilter ? `?role=${roleFilter}` : '';
    api.get<Page<StaffUser>>(`/admin/users${qs}`)
      .then(r => {
        if (!alive) return;
        setUsers(r.items);
        setLoadError('');
      })
      .catch(e => { if (alive) setLoadError(errorMessage(e)); });
    return () => { alive = false; };
  }, [api, roleFilter, reloadKey]);

  const reload = () => setReloadKey(k => k + 1);

  const changeRole = async (u: StaffUser, role: StaffRole) => {
    setBusyId(u.id);
    setFlash(null);
    try {
      await api.put(`/admin/users/${u.id}/role`, { role });
      setFlash({ ok: true, text: `Đã đổi vai trò của ${u.username} thành ${roleLabel(role)}. Phiên cũ của tài khoản này sẽ bị từ chối.` });
      reload();
    } catch (e) {
      setFlash({ ok: false, text: errorMessage(e) });
    } finally {
      setBusyId(null);
    }
  };

  const toggleActive = async (u: StaffUser) => {
    setBusyId(u.id);
    setFlash(null);
    try {
      await api.post(`/admin/users/${u.id}/active`, { active: !u.active });
      setFlash({ ok: true, text: u.active ? `Đã khóa tài khoản ${u.username}.` : `Đã mở khóa tài khoản ${u.username}.` });
      reload();
    } catch (e) {
      setFlash({ ok: false, text: errorMessage(e) });
    } finally {
      setBusyId(null);
    }
  };

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setFlash(null);
    try {
      await api.post('/admin/users', {
        username: username.trim(),
        password,
        display_name: displayName.trim(),
        role: newRole,
      });
      setFlash({ ok: true, text: `Đã tạo tài khoản ${username.trim()} (${roleLabel(newRole)}).` });
      setUsername('');
      setDisplayName('');
      reload();
    } catch (err) {
      setFlash({ ok: false, text: errorMessage(err) });
    } finally {
      setPassword('');   // không giữ mật khẩu sau khi gửi
      setCreating(false);
    }
  };

  const usernameOk = USERNAME_RE.test(username.trim());
  const passwordOk = password.length >= 8 && new TextEncoder().encode(password).length <= 72;

  return (
    <section className="panel" aria-label="Quản trị cán bộ">
      {flash && <p className={flash.ok ? 'notice' : 'error'} role={flash.ok ? 'status' : 'alert'}>{flash.text}</p>}

      <form className="create-form" onSubmit={create}>
        <h2>Tạo tài khoản cán bộ</h2>
        <label>Tên đăng nhập
          <input value={username} onChange={e => setUsername(e.target.value)} placeholder="officer2" autoComplete="off" required />
        </label>
        <small className={username && !usernameOk ? 'error' : 'hint'}>3–32 ký tự: chữ, số, dấu _ . -</small>
        <label>Tên hiển thị
          <input value={displayName} onChange={e => setDisplayName(e.target.value)} required />
        </label>
        <label>Mật khẩu ban đầu
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" required />
        </label>
        <small className={password && !passwordOk ? 'error' : 'hint'}>Tối thiểu 8 ký tự, tối đa 72 byte.</small>
        <label>Vai trò
          <select value={newRole} onChange={e => setNewRole(e.target.value as StaffRole)}>
            {ROLE_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <button type="submit" disabled={creating || !usernameOk || !passwordOk || !displayName.trim()}>
          {creating ? 'Đang tạo…' : 'Tạo tài khoản'}
        </button>
      </form>

      <div className="toolbar">
        <label>Lọc theo vai trò
          <select value={roleFilter} onChange={e => setRoleFilter(e.target.value as '' | StaffRole)}>
            <option value="">Tất cả cán bộ</option>
            {ROLE_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
      </div>

      {loadError && <p className="error" role="alert">{loadError}</p>}

      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Tên đăng nhập</th><th>Tên hiển thị</th><th>Vai trò</th><th>Trạng thái</th><th>Tạo lúc</th><th>Thao tác</th></tr>
          </thead>
          <tbody>
            {users.map(u => {
              const isSelf = u.id === selfId;
              return (
                <tr key={u.id}>
                  <td className="mono">{u.username}{isSelf && <small> (bạn)</small>}</td>
                  <td>{u.display_name || '–'}</td>
                  <td>
                    <select
                      aria-label={`Vai trò của ${u.username}`}
                      value={u.role}
                      disabled={isSelf || busyId === u.id}
                      onChange={e => changeRole(u, e.target.value as StaffRole)}
                    >
                      {ROLE_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </td>
                  <td><span className={`badge ${u.active ? 'ok' : 'off'}`}>{u.active ? 'Đang hoạt động' : 'Đã khóa'}</span></td>
                  <td>{formatDateTime(u.created_at)}</td>
                  <td className="actions">
                    <button
                      type="button"
                      className={u.active ? 'danger' : ''}
                      disabled={isSelf || busyId === u.id}
                      onClick={() => toggleActive(u)}
                    >
                      {u.active ? 'Khóa' : 'Mở khóa'}
                    </button>
                  </td>
                </tr>
              );
            })}
            {users.length === 0 && !loadError && <tr><td colSpan={6} className="empty">Chưa có tài khoản cán bộ.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
