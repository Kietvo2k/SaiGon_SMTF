// Ngữ cảnh cảnh dùng chung cho đổi góc nhìn và tải lại pipeline đồ họa.
const NORTH_VIEWS = new Set(['hx', 'l81', 'csg', 'ctn', 'bac']);
const CLASSIC_VIEWS = new Set(['materials', 'river', 'boulevard', 'corridor', 'overview', 'bason', 'flood25']);
const REGIONS = new Set(['all', 'trung-tam', 'ven-song', 'bac', 'nam']);

export function sceneView32(view, smart = false) {
  return (smart ? NORTH_VIEWS : CLASSIC_VIEWS).has(view) ? view : smart ? 'bac' : 'overview';
}

export function sceneQuery32({ search = '', version = '31a', view, region, mode, light } = {}) {
  const query = new URLSearchParams(search);
  const smart = query.get('app') === 'smart';
  query.set('v', smart ? '32a' : version);
  query.set('view', sceneView32(view ?? query.get('view'), smart));
  const nextRegion = smart ? 'bac' : region ?? query.get('region');
  if (REGIONS.has(nextRegion) && nextRegion !== 'all') query.set('region', nextRegion);
  else query.delete('region');
  if (mode === 'lite' || mode === 'preview') {
    query.set('mode', mode);
    // Chỉ bỏ ghi đè chất lượng khi người dùng/chế độ tiết kiệm đổi preset.
    query.delete('quality');
    query.delete('density');
  }
  if (['day', 'golden', 'night'].includes(light)) query.set('light', light);
  return query;
}
