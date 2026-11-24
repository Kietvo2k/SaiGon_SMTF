// Kiểm nhanh bộ lọc M2a trên dữ liệu thật (không commit).
import fs from 'node:fs';
import { regionOf, regionContains, REGIONS_31 } from '../outputs/hcmc-poc/city-region-31.js';
import { loadSignatureRegistry } from '../outputs/hcmc-poc/signature-registry-31.js';
import { SIGNAL_PLAN_32 } from '../outputs/hcmc-poc/signal-plan-32.js';
import { lockRoadFilter32, selectNorthBuildings32, lockRegionLabels32, northCameraLimits32 } from '../outputs/hcmc-poc/city-lock-32.js';

const load = rel => { const code = fs.readFileSync(new URL('../outputs/hcmc-poc/' + rel, import.meta.url), 'utf8'); const win = {}; new Function('window', code)(win); return win; };
const D = load('data/scene.js').CITY_DATA;
const G = load('data/road-graph-31.js').ROAD_GRAPH_31;
const registry = loadSignatureRegistry(load('data/signature-registry-31.js').SIGNATURE_REGISTRY_31);

const nodeById = new Map(G.nodes.map(node => [node.id, node]));
const signalPoints = SIGNAL_PLAN_32.map(row => nodeById.get(row.osm_id)).filter(Boolean).map(node => [node.x, node.z]);
console.log('signalPoints', signalPoints.length, JSON.stringify(signalPoints.map(([x, z]) => [Math.round(x), Math.round(z)])));

const roads = D.roads;
const { hidden, stats } = lockRoadFilter32({ roads, regionOf, signalPoints, isSignatureWay: id => registry.isSignatureWay(id) });
console.log('lockRoad stats', JSON.stringify(stats));

const buildings = selectNorthBuildings32({ buildings: D.buildings, roads, regionOf, isSignature: id => registry.isSignatureBuilding(id) });
console.log('buildings', JSON.stringify({
  before: buildings.before, ordinary: buildings.ordinary, signature: buildings.signature,
  kept: buildings.kept, keptOrdinary: buildings.keptOrdinary, dropped: buildings.dropped,
  pctKeptOrdinary: +(buildings.ratio * 100).toFixed(1)
}));

for (const label of lockRegionLabels32(REGIONS_31)) {
  console.log('label', label.id, Math.round(label.x), Math.round(label.z), 'in region:', regionContains(label.id, label.x, label.z), label.text);
}
const bac = REGIONS_31.find(region => region.id === 'bac');
console.log('bac bbox', JSON.stringify(bac.bbox), 'limits', JSON.stringify(northCameraLimits32(bac.bbox)));
