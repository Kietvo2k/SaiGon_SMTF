const url = new URL(location.href);
url.searchParams.set('app', 'smart');
url.searchParams.set('region', 'bac');
url.searchParams.set('transport', 'public');
if (!url.searchParams.has('mode')) url.searchParams.set('mode', 'lite');
if (!url.searchParams.has('view')) url.searchParams.set('view', 'bac');
history.replaceState(null, '', url);

const loader = document.querySelector('#loaderText');
try {
  const data = await Promise.all(['scene.json', 'road-graph.json', 'runtime-sidecars.json'].map(async file => {
    const response = await fetch(`./data/public-north/${file}`);
    if (!response.ok) throw new Error(`Không tải được ${file} (HTTP ${response.status}).`);
    return response.json();
  }));
  const [scene, graph, config] = data;
  if (config.region !== 'bac' || graph.region !== 'bac' || !config.globals || !scene.roads.length || scene.roads.length !== graph.roads.length) {
    throw new Error('Dữ liệu khu Bắc không khớp.');
  }
  window.CITY_DATA = scene;
  window.ROAD_GRAPH_31 = graph;
  window.PUBLIC_NORTH_CONFIG_32 = config;
  Object.assign(window, config.globals);
  await import('../webgpu-materials-24.js?v=32c');
  document.querySelector('#stationStatus32')?.remove();
  if (document.querySelector('script[data-submit-hud]')) {
    const { mountSubmitHud } = await import('../submit-hud.js');
    const { junctionRows32 } = await import('../signal-preview-32.js?v=32c');
    const app = window.__smartApp;
    const [nodeMap, cameras] = await Promise.all([config.nodeMapUrl, config.camerasUrl].map(async path => {
      const response = await fetch(path);
      if (!response.ok) throw new Error(`Không tải được danh mục (HTTP ${response.status}).`);
      return response.json();
    }));
    const junctions = junctionRows32(app.traffic.net, nodeMap);
    mountSubmitHud({
      junctions,
      cameras: cameras.map(({camera_id, junction_id, label}) => ({ cameraId: camera_id, junctionId: junction_id, label })),
      showOverview: () => document.querySelector('#cityNav [data-view="bac"]')?.click(),
      focusJunction: row => app.focusJunction32(row),
      showStandard: row => app.focusJunction32(row || junctions[0])
    });
  }
} catch (error) {
  console.error('CITY24_PUBLIC_DATA_ERROR', error);
  loader.textContent = `Lỗi nạp dữ liệu · ${error.message}`;
}
