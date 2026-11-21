import type { CitizenAccount } from '../../lib/types';

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return 'CD';
  return words.slice(-2).map(word => word[0]?.toUpperCase() ?? '').join('');
}

export function ProfilePanel({ account }: { account: CitizenAccount }) {
  const name = account.full_name || account.display_name || account.username;
  return (
    <section className="cz-panel" aria-labelledby="profile-title">
      <div className="cz-profile-head">
        <span className="cz-avatar" aria-hidden="true">{initials(name)}</span>
        <div>
          <p className="cz-kicker">Hồ sơ công dân</p>
          <h2 id="profile-title">{name}</h2>
          <p className="cz-muted">@{account.username}</p>
        </div>
      </div>
      <dl className="cz-profile-facts">
        <div><dt>Họ và tên</dt><dd>{account.full_name || 'Chưa cập nhật'}</dd></div>
        <div><dt>Tên hiển thị</dt><dd>{account.display_name || 'Chưa cập nhật'}</dd></div>
        <div><dt>Email</dt><dd>{account.email || 'Chưa cập nhật'}</dd></div>
        <div><dt>Số điện thoại</dt><dd>{account.phone || 'Chưa cập nhật'}</dd></div>
        <div><dt>Biển đã gắn</dt><dd>{account.plates.length}/{account.max_plates}</dd></div>
        <div><dt>Vai trò</dt><dd>Công dân</dd></div>
      </dl>
      <p className="cz-hint">
        Thông tin liên hệ chỉ dùng để đối chiếu hồ sơ. Hệ thống không gửi thư xác minh.
      </p>
    </section>
  );
}
