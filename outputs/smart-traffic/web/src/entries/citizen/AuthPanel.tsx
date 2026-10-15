import { FormEvent, useState } from 'react';
import { ApiError, errorMessage, login, makeApi } from '../../lib/api';

const NOT_CITIZEN = 'Trang này dành cho công dân. Cán bộ vui lòng đăng nhập trang cán bộ.';
const USERNAME_RE = /^[A-Za-z0-9_.-]{3,32}$/;
const EMAIL_RE = /^[^@\s]{1,64}@[^@\s]{1,190}\.[^@\s]{2,20}$/;
const PHONE_RE = /^0[0-9]{8,10}$/;

interface Props {
  onLoggedIn: (token: string) => void;
}

// Đăng nhập / đăng ký công dân. Mật khẩu chỉ nằm trong ô nhập và bị xóa sau mỗi lần gửi.
export function AuthPanel({ onLoggedIn }: Props) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  const switchMode = (next: 'login' | 'register') => {
    setMode(next);
    setError('');
  };

  const signIn = async (user: string, pw: string) => {
    const body = await login(user, pw);
    if (body.role !== 'citizen') throw new ApiError(403, 'FORBIDDEN', NOT_CITIZEN);
    onLoggedIn(body.access_token);
  };

  const submitLogin = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await signIn(username.trim(), password);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPassword('');
      setBusy(false);
    }
  };

  const submitRegister = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const user = username.trim();
    try {
      // Đăng ký rồi đăng nhập luôn bằng đúng thông tin vừa nhập.
      await makeApi(null).post('/citizen/account/register', {
        username: user,
        password,
        full_name: fullName.trim(),
        email: email.trim(),
        ...(phone.trim() ? { phone: phone.trim() } : {}),
      });
      await signIn(user, password);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPassword('');
      setBusy(false);
    }
  };

  const passwordBytes = new TextEncoder().encode(password).length;
  const registerValid = USERNAME_RE.test(username.trim())
    && password.length >= 8 && passwordBytes <= 72
    && fullName.trim().length >= 2
    && EMAIL_RE.test(email.trim())
    && (!phone.trim() || PHONE_RE.test(phone.trim()));

  return (
    <section className="card auth" aria-label="Tài khoản công dân">
      <div className="seg" role="tablist" aria-label="Chọn đăng nhập hoặc đăng ký">
        <button type="button" role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'on' : ''} onClick={() => switchMode('login')}>
          Đăng nhập
        </button>
        <button type="button" role="tab" aria-selected={mode === 'register'} className={mode === 'register' ? 'on' : ''} onClick={() => switchMode('register')}>
          Đăng ký
        </button>
      </div>
      <p className="hint">Đăng nhập để gắn biển số, xem vi phạm của xe và nhận thông báo.</p>

      {mode === 'login' ? (
        <form className="stack" onSubmit={submitLogin}>
          <label>Tên đăng nhập
            <input value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" required />
          </label>
          <label>Mật khẩu
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required />
          </label>
          <button type="submit" disabled={busy}>{busy ? 'Đang đăng nhập…' : 'Đăng nhập'}</button>
        </form>
      ) : (
        <form className="stack" onSubmit={submitRegister}>
          <label>Tên đăng nhập
            <input value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" required />
          </label>
          <small className={username && !USERNAME_RE.test(username.trim()) ? 'error' : 'hint'}>3–32 ký tự: chữ, số, dấu _ . -</small>
          <label>Họ và tên
            <input value={fullName} onChange={e => setFullName(e.target.value)} autoComplete="name" required />
          </label>
          <label>Email
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required />
          </label>
          <small className="hint">Email chỉ lưu vào hồ sơ. Hệ thống chưa gửi thư xác minh.</small>
          <label>Số điện thoại (tùy chọn)
            <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} autoComplete="tel" placeholder="09xxxxxxxx" />
          </label>
          <label>Mật khẩu
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" required />
          </label>
          <small className={password && (password.length < 8 || passwordBytes > 72) ? 'error' : 'hint'}>
            Từ 8 đến 72 byte (khoảng 72 ký tự Latin).
          </small>
          <button type="submit" disabled={busy || !registerValid}>{busy ? 'Đang đăng ký…' : 'Đăng ký và đăng nhập'}</button>
        </form>
      )}

      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}
