// Dữ liệu minh họa độc lập với fixture dùng làm oracle của bộ kiểm.
export const SAMPLE_ACCOUNTS = [
  { id: 1, username: 'congdan_mau', role: 'citizen', display_name: 'Công dân mẫu' },
  { id: 2, username: 'canbo_mau', role: 'officer', display_name: 'Cán bộ mẫu' },
  { id: 3, username: 'chihuy_mau', role: 'commander', display_name: 'Chỉ huy mẫu' },
  { id: 4, username: 'quantri_mau', role: 'admin', display_name: 'Quản trị mẫu' }
].map(user => ({ ...user, password: 'SMTF-Mau-2026', active: true }));

export function emptySnapshot(buildId) {
  return {
    snapshot_version: 'public-demo-v1', revision: 0, build_id: buildId,
    station: { status: 'missing', id: null, last_seen_at: null },
    simulation: { seed: null, scenario: 'none', mode: 'fixed', t_sim: 0, paused: false },
    junctions: [],
    kpi: { wait_avg_s: 0, queue_max: 0, flow_per_min: 0, trips_completed: 0, admission_wait: 0, recoveries: 0 },
    routes: [], cameras: []
  };
}
