import { FormEvent, useState } from 'react';
import { Api, errorMessage } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import type { CitizenAccount } from '../../lib/types';

const PLATE_RE = /^(?:[0-9]{2}[A-Z][0-9]?-[0-9]{3}\.[0-9]{2}|[0-9]{2}-[A-Z][0-9] [0-9]{3}\.[0-9]{2})$/;
const CLASS_LABEL: Record<string, string> = { car: 'Ô tô', motorbike: 'Xe máy' };

interface Props {
  api: Api;
  account: CitizenAccount;
  onChanged: () => void;
}

interface Flash {
  ok: boolean;
  text: string;
}

// Gắn biển bằng mã đăng ký xe (8 chữ số). Sai mã nhiều lần sẽ bị khóa tạm — backend giới hạn và báo lỗi.
export function PlatesPanel({ api, account, onChanged }: Props) {
  const [plate, setPlate] = useState('');
  const [vehicleClass, setVehicleClass] = useState<'car' | 'motorbike'>('car');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  const full = account.plates.length >= account.max_plates;
  const plateOk = PLATE_RE.test(plate.trim());
  const codeOk = /^[0-9]{8}$/.test(code.trim());

  const bind = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setFlash(null);
    try {
      await api.post('/citizen/account/plates', {
        plate: plate.trim(),
        vehicle_class: vehicleClass,
        registration_code: code.trim(),
      });
      setFlash({ ok: true, text: `Đã gắn biển ${plate.trim()} vào tài khoản.` });
      setPlate('');
      setCode('');
      onChanged();
    } catch (err) {
      setFlash({ ok: false, text: errorMessage(err) });
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  const unbind = async (p: string) => {
    setRemoving(p);
    setFlash(null);
    try {
      await api.del(`/citizen/account/plates/${encodeURIComponent(p)}`);
      setFlash({ ok: true, text: `Đã bỏ gắn biển ${p}.` });
      onChanged();
    } catch (err) {
      setFlash({ ok: false, text: errorMessage(err) });
    } finally {
      setRemoving(null);
    }
  };

  return (
    <section className="card" aria-label="Biển số đã gắn">
      <h2>Biển số của tôi <span className="count">({account.plates.length}/{account.max_plates})</span></h2>

      {account.plates.length === 0 ? (
        <p className="hint">Chưa gắn biển số nào. Gắn biển để xem vi phạm và nhận thông báo của xe.</p>
      ) : (
        <ul className="list">
          {account.plates.map(p => (
            <li key={p.plate} className="item row-between">
              <div>
                <b className="mono">{p.plate}</b>
                <p className="meta">{CLASS_LABEL[p.vehicle_class] ?? p.vehicle_class} · gắn lúc {formatDateTime(p.bound_at)}</p>
              </div>
              <button type="button" className="ghost" disabled={removing === p.plate} onClick={() => unbind(p.plate)}>
                Bỏ gắn
              </button>
            </li>
          ))}
        </ul>
      )}

      <h3>Gắn thêm biển số</h3>
      {full ? (
        <p className="hint">Tài khoản đã gắn tối đa {account.max_plates} biển. Bỏ gắn một biển để gắn biển khác.</p>
      ) : (
        <form className="stack" onSubmit={bind}>
          <label>Biển số
            <input
              value={plate}
              onChange={e => setPlate(e.target.value.toUpperCase())}
              placeholder="51K-123.45 hoặc 59-X1 234.56"
              maxLength={16}
              required
            />
          </label>
          <small className={plate && !plateOk ? 'error' : 'hint'}>Đúng định dạng biển số Việt Nam, ví dụ 51K-123.45 hoặc 59-X1 234.56.</small>
          <label>Loại xe
            <select value={vehicleClass} onChange={e => setVehicleClass(e.target.value as 'car' | 'motorbike')}>
              <option value="car">Ô tô</option>
              <option value="motorbike">Xe máy</option>
            </select>
          </label>
          <label>Mã đăng ký xe (8 chữ số)
            <input
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
              inputMode="numeric"
              autoComplete="off"
              required
            />
          </label>
          <small className="hint">Nhập sai quá 5 lần, tài khoản sẽ bị khóa tạm 5 phút.</small>
          <button type="submit" disabled={busy || !plateOk || !codeOk}>{busy ? 'Đang gắn…' : 'Gắn biển số'}</button>
        </form>
      )}

      {flash && <p className={flash.ok ? 'notice' : 'error'} role={flash.ok ? 'status' : 'alert'}>{flash.text}</p>}
    </section>
  );
}
