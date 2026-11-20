import assert from 'node:assert/strict';
import { assertNorthOnlyRuntime, clippedLength, pointOutsideEndpoints, region } from './oracle.mjs';

function expectRed(label, action) {
  assert.throws(action, undefined, `${label} phải đỏ`);
}

const prewarmAllMutant = `const region='bac'; for (const region of REGIONS_31) { await renderer.compileAsync(scene, warm); }`;
expectRed('NORTH-RUNTIME-PREWARM-ALL', () => assertNorthOnlyRuntime('data/public-north/scene.js', prewarmAllMutant));

const crossing = [[-5000, -2500], [0, -2500], [3000, -2500]];
assert.ok(pointOutsideEndpoints(crossing, region));
const expected = clippedLength(crossing, region);
expectRed('NORTH-GEOMETRY-ENDPOINTS', () => assert.ok(expected === 0, 'Endpoint-only mutant không được coi là clip thành công.'));

console.log('NORTH mutant red: PREWARM-ALL và GEOMETRY-ENDPOINTS đều bị oracle bắt.');
