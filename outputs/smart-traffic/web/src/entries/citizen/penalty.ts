import type { Penalty } from '../../lib/types';

// Dòng căn cứ + điểm trừ cho trang công dân. Không hiện "Trừ 0 điểm GPLX".
export function citizenPenaltyContext(
  penalty: Pick<Penalty, 'verified' | 'source' | 'license_deduction_points'> | null | undefined,
): string {
  if (!penalty?.verified || !penalty.source) return '';
  const points = penalty.license_deduction_points;
  return points && points > 0 ? `${penalty.source} · Trừ ${points} điểm GPLX` : penalty.source;
}
