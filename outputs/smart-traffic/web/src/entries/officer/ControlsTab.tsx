import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Api, errorMessage } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { displayNodeLabel } from '../../lib/labels';
import {
  OVERRIDE_MAX_S,
  OVERRIDE_MIN_S,
  SCENARIO_OPTIONS,
  type ScenarioChoice,
  normalizeVmsText,
  overrideDurationError,
  phaseLabel,
  remainingSeconds,
  scenarioLabel,
  vmsTextError,
  VMS_TEXT_MAX,
} from '../../lib/controls';
import type { ControlsState, SignalNodeState, VmsItem } from '../../lib/types';

interface Props {
  api: Api;
  tick: number;
  canControl: boolean;   // chỉ chỉ huy trực ban và quản trị viên ghi; cán bộ chỉ xem
}

interface Flash {
  ok: boolean;
  text: string;
}

const REFRESH_MS = 5000;
const MODE_LABEL: Record<string, string> = { fixed: 'Cố định', smart: 'Thông minh' };
const VMS_MODE_LABEL: Record<string, string> = { auto: 'Tự động', manual: 'Thủ công' };
const DEFAULT_DURATION_S = 60;

export function ControlsTab({ api, tick, canControl }: Props) {
  const [state, setState] = useState<ControlsState | null>(null);
  const [vms, setVms] = useState<VmsItem[]>([]);
  const [loadError, setLoadError] = useState('');
  const [flash, setFlash] = useState<Flash | null>(null);
  const [busy, setBusy] = useState(false);
  const [duration, setDuration] = useState(DEFAULT_DURATION_S);
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState<ScenarioChoice | null>(null);
  const [pendingMode, setPendingMode] = useState<string | null>(null);   // chế độ vừa gửi, chờ trạm báo lại
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      const [s, v] = await Promise.all([
        api.get<ControlsState>('/officer/controls/state'),
        api.get<{ items: VmsItem[] }>('/officer/vms'),
      ]);
      setState(s);
      setPendingMode(p => (p === s.mode ? null : p));
      setVms(v.items);
      setLoadError('');
    } catch (e) {
      setLoadError(errorMessage(e));
    }
  }, [api]);

  useEffect(() => {
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load, tick]);

  // Đếm ngược thời gian ghi đè mỗi giây.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const run = async (action: () => Promise<unknown>, okText: string, onOk?: () => void) => {
    setBusy(true);
    setFlash(null);
    try {
      await action();
      onOk?.();
      await load();   // làm mới trạng thái trước, rồi mới báo thành công (không hiện thông báo khi bảng còn cũ)
      setFlash({ ok: true, text: okText });
    } catch (e) {
      setFlash({ ok: false, text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  const setMode = (mode: 'fixed' | 'smart') =>
    run(() => api.post('/officer/controls/signal-mode', { mode }),
      `Đã gửi lệnh chuyển đèn sang chế độ ${MODE_LABEL[mode]}.`,
      () => setPendingMode(mode));

  const override = (node: SignalNodeState, group: 0 | 1 | null) => {
    const name = displayNodeLabel(node.label) || node.node_id;
    if (group !== null) {
      const err = overrideDurationError(duration);
      if (err) {
        setFlash({ ok: false, text: err });
        return;
      }
    }
    const body = { node_id: node.node_id, group, duration_s: group === null ? DEFAULT_DURATION_S : duration, reason: reason.trim() };
    run(() => api.post('/officer/controls/signal-override', body),
      group === null ? `Đã hủy ghi đè tại ${name}.` : `Đã ghi đè ${name}: ưu tiên nhóm ${group} trong ${duration} giây.`);
  };

  const startScenario = (choice: ScenarioChoice) => {
    setPending(null);
    run(() => api.post('/officer/controls/scenario', { scenario: choice }),
      choice === 'none' ? 'Đã dừng kịch bản đang chạy.' : `Đã chạy kịch bản: ${scenarioLabel(choice)}.`);
  };

  const saveVms = (item: VmsItem, text: string, mode: 'auto' | 'manual') =>
    run(() => api.put(`/officer/vms/${item.vms_id}`, { text: normalizeVmsText(text), mode }),
      mode === 'auto' ? `${item.vms_id}: đã trả quyền tự động cho hệ thống.` : `${item.vms_id}: đã cập nhật nội dung.`);

  const current = state?.scenario ?? null;
  const pendingLabel = pending === 'none' ? 'dừng kịch bản đang chạy' : pending ? scenarioLabel(pending) : '';

  return (
    <section className="panel ctl" aria-label="Điều khiển thủ công">
      {!canControl && (
        <p className="warn" role="note">Chế độ chỉ xem. Chỉ huy trực ban hoặc quản trị viên mới điều khiển đèn, kịch bản và bảng VMS.</p>
      )}

      <div className="toolbar">
        <p className="count">Chế độ đèn hiện tại: <b>{MODE_LABEL[state?.mode ?? ''] ?? (state?.mode || '–')}</b></p>
        <p className="count">Kịch bản đang chạy: <b>{current ? scenarioLabel(current.key) : 'Không có'}</b></p>
      </div>

      {flash && <p className={flash.ok ? 'notice' : 'error'} role={flash.ok ? 'status' : 'alert'}>{flash.text}</p>}
      {loadError && <p className="error" role="alert">{loadError}</p>}

      <h2>Chế độ đèn</h2>
      {canControl ? (
        <>
          <div className="seg" role="group" aria-label="Chế độ đèn">
            {(['fixed', 'smart'] as const).map(m => (
              <button
                key={m}
                type="button"
                aria-pressed={state?.mode === m}
                disabled={busy || state?.mode === m}
                onClick={() => setMode(m)}
              >
                {MODE_LABEL[m]}
              </button>
            ))}
          </div>
          {pendingMode && state?.mode !== pendingMode && (
            <p className="meta">Đang chờ trạm áp dụng chế độ {MODE_LABEL[pendingMode]}.</p>
          )}
        </>
      ) : (
        <p className="meta">Đèn đang ở chế độ <b>{MODE_LABEL[state?.mode ?? ''] ?? '–'}</b>.</p>
      )}

      <h2>Pha đèn và ghi đè</h2>
      {canControl && (
        <div className="toolbar">
          <label>Thời gian ghi đè (giây)
            <input
              type="number"
              min={OVERRIDE_MIN_S}
              max={OVERRIDE_MAX_S}
              step={1}
              value={duration}
              onChange={e => setDuration(Number(e.target.value))}
            />
          </label>
          <label>Lý do (không bắt buộc)
            <input value={reason} maxLength={120} onChange={e => setReason(e.target.value)} />
          </label>
        </div>
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Nút</th><th>Cụm</th><th>Pha hiện tại</th><th>Ghi đè</th>
              {canControl && <th>Thao tác</th>}
            </tr>
          </thead>
          <tbody>
            {(state?.signals ?? []).map(s => {
              const ov = state?.overrides.find(o => o.node_id === s.node_id);
              const left = ov ? remainingSeconds(ov.until_at, now) : 0;
              const active = Boolean(ov) && left > 0;
              return (
                <tr key={s.node_id}>
                  <td>{displayNodeLabel(s.label) || s.node_id} <span className="mono meta">{s.node_id}</span></td>
                  <td>{s.cluster_id ?? '–'}</td>
                  <td>{phaseLabel(s.phase, s.group)}</td>
                  <td>
                    {active && ov
                      ? <span className="badge warn">Nhóm {ov.group} · còn {left} giây</span>
                      : <span className="meta">Không</span>}
                  </td>
                  {canControl && (
                    <td className="actions">
                      <button type="button" disabled={busy} onClick={() => override(s, 0)}>Ưu tiên nhóm 0</button>
                      <button type="button" disabled={busy} onClick={() => override(s, 1)}>Ưu tiên nhóm 1</button>
                      <button type="button" className="ghost" disabled={busy || !active} onClick={() => override(s, null)}>Hủy ghi đè</button>
                    </td>
                  )}
                </tr>
              );
            })}
            {(state?.signals ?? []).length === 0 && (
              <tr><td colSpan={canControl ? 5 : 4} className="empty">Chưa có nút đèn nào báo trạng thái.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <h2>Kịch bản</h2>
      {canControl ? (
        <>
          <ul className="scenario-list">
            {SCENARIO_OPTIONS.map(o => (
              <li key={o.key}>
                <button
                  type="button"
                  className={o.key === 'none' ? 'scenario-btn ghost' : 'scenario-btn'}
                  disabled={busy}
                  onClick={() => setPending(o.key)}
                >
                  <span>{o.label}</span>
                  <small>{o.hint}</small>
                </button>
              </li>
            ))}
          </ul>
          {pending && (
            <div className="confirm-box" role="alertdialog" aria-label="Xác nhận kịch bản">
              <span>Xác nhận {pendingLabel}? Trạm 3D áp dụng ngay và việc này được ghi vào nhật ký.</span>
              <span className="actions">
                <button type="button" disabled={busy} onClick={() => startScenario(pending)}>Xác nhận</button>
                <button type="button" className="ghost" onClick={() => setPending(null)}>Hủy</button>
              </span>
            </div>
          )}
        </>
      ) : (
        <p className="meta">Chỉ huy trực ban hoặc quản trị viên mới chạy hoặc dừng kịch bản.</p>
      )}

      <h2>Bảng VMS</h2>
      <div className="vms-grid">
        {vms.map(item => (
          <VmsCard
            key={item.vms_id}
            item={item}
            canControl={canControl}
            busy={busy}
            onSave={(text, mode) => saveVms(item, text, mode)}
          />
        ))}
      </div>
    </section>
  );
}

interface VmsCardProps {
  item: VmsItem;
  canControl: boolean;
  busy: boolean;
  onSave: (text: string, mode: 'auto' | 'manual') => void;
}

// Một bảng VMS: nội dung trạm đang hiển thị (nếu có), ô soạn nội dung và chế độ Tự động / Thủ công.
function VmsCard({ item, canControl, busy, onSave }: VmsCardProps) {
  const [mode, setMode] = useState<'auto' | 'manual'>(item.mode);
  const [text, setText] = useState(item.text);
  const [error, setError] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const err = vmsTextError(text, mode);
    setError(err);
    if (!err) onSave(text, mode);
  };

  const shownText = item.shown ?? (item.mode === 'manual' ? item.text : '');
  const count = normalizeVmsText(text).length;

  return (
    <article className="vms-card" aria-label={`Bảng ${item.vms_id}`}>
      <div className="card-head">
        <b className="mono">{item.vms_id}</b>
        <span className="badge">Cài đặt: {VMS_MODE_LABEL[item.mode] ?? item.mode}</span>
      </div>
      <p className="vms-screen">
        {shownText || 'Hệ thống tự hiển thị thông tin giao thông'}
      </p>
      {item.reported_at && (
        <small>Trạm báo ({VMS_MODE_LABEL[item.shown_mode ?? ''] ?? 'tự động'}) lúc {formatDateTime(item.reported_at)}</small>
      )}

      {canControl ? (
        <form className="vms-form" onSubmit={submit}>
          <fieldset>
            <legend>Chế độ</legend>
            <label className="radio"><input type="radio" name={`mode-${item.vms_id}`} checked={mode === 'auto'} onChange={() => { setMode('auto'); setError(''); }} /> Tự động</label>
            <label className="radio"><input type="radio" name={`mode-${item.vms_id}`} checked={mode === 'manual'} onChange={() => setMode('manual')} /> Thủ công</label>
          </fieldset>
          <label>Nội dung ({count}/{VMS_TEXT_MAX})
            <input
              value={text}
              disabled={mode === 'auto'}
              maxLength={300}
              onChange={e => { setText(e.target.value); setError(''); }}
            />
          </label>
          {error && <p className="error" role="alert">{error}</p>}
          <button type="submit" disabled={busy}>Lưu nội dung</button>
        </form>
      ) : (
        <p className="meta">
          {item.set_by ? `Cài đặt bởi ${item.set_by}, lúc ${formatDateTime(item.set_at)}.` : 'Chưa có cài đặt từ cán bộ.'}
        </p>
      )}
    </article>
  );
}
