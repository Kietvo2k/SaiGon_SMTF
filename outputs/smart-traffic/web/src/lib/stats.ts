import type { Stats } from './types';

export interface StatsSummary {
  total: number;
  peakHour: { hour: number; count: number } | null;
  topNode: { node_id: string; node_label: string | null; count: number } | null;
  topCode: { violation_code: string; count: number } | null;
}

export function summarizeStats(stats: Stats | null | undefined): StatsSummary {
  if (!stats) {
    return { total: 0, peakHour: null, topNode: null, topCode: null };
  }
  const peak = stats.by_hour.reduce<{ hour: number; count: number } | null>(
    (best, row) => (row.count > 0 && (!best || row.count > best.count) ? row : best),
    null,
  );
  const topNode = stats.by_node.reduce<Stats['by_node'][number] | null>(
    (best, row) => (row.count > 0 && (!best || row.count > best.count) ? row : best),
    null,
  );
  const topCode = stats.by_code.reduce<Stats['by_code'][number] | null>(
    (best, row) => (row.count > 0 && (!best || row.count > best.count) ? row : best),
    null,
  );
  return {
    total: stats.total,
    peakHour: peak,
    topNode,
    topCode,
  };
}

export function barPercent(count: number, maxCount: number): number {
  if (!Number.isFinite(count) || count <= 0 || !Number.isFinite(maxCount) || maxCount <= 0) return 0;
  return Math.min(100, Math.max(4, Math.round((count / maxCount) * 100)));
}
