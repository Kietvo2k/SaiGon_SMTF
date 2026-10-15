import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forecastEdge32, alerts32, combineWithLookahead32 } from '../forecast-32.js';

function makeRecent(slope, n=6, t0=0, base=0.4){
  const out=[];
  for(let i=0;i<n;i++){
    const t=t0+i*60;
    out.push({t, level: Math.max(0,Math.min(1, base + slope*(t-t0)/60))});
  }
  return out;
}

test('xu hướng tăng -> prob tăng theo horizon', () => {
  const history = new Array(24).fill(0.3);
  const recent = makeRecent(0.05, 6, 0, 0.3);
  const p10 = forecastEdge32({history, recent, horizonMin:10});
  const p20 = forecastEdge32({history, recent, horizonMin:20});
  const p30 = forecastEdge32({history, recent, horizonMin:30});
  assert.ok(p20.prob > p10.prob, `20 >10 ${p10.prob} vs ${p20.prob}`);
  assert.ok(p30.prob > p20.prob, `30 >20 ${p30.prob} vs ${p20.prob}`);
  for(const p of [p10,p20,p30]){ assert.ok(p.prob>=0&&p.prob<=1); assert.ok(p.reliability>=0&&p.reliability<=1); }
});

test('xu hướng giảm -> prob giảm theo horizon', () => {
  const history = new Array(24).fill(0.6);
  const recent = makeRecent(-0.04, 6, 0, 0.7);
  const p10 = forecastEdge32({history, recent, horizonMin:10});
  const p30 = forecastEdge32({history, recent, horizonMin:30});
  assert.ok(p30.prob < p10.prob, `giam ${p10.prob} vs ${p30.prob}`);
});

test('ít dữ liệu -> reliability thấp', () => {
  const historyThin = new Array(24).fill(0);
  const recentThin = [{t:0, level:0.2}];
  const recentOk = makeRecent(0.01, 6, 0, 0.3);
  const rThin = forecastEdge32({history: historyThin, recent: recentThin, horizonMin:10});
  const rOk = forecastEdge32({history: new Array(24).fill(0.3), recent: recentOk, horizonMin:10});
  assert.ok(rThin.reliability < rOk.reliability, `${rThin.reliability} vs ${rOk.reliability}`);
  assert.ok(rThin.reliability < 0.6, `thin low ${rThin.reliability}`);
});

test('nhiễu cao -> reliability giảm', () => {
  const history = new Array(24).fill(0.5);
  const stable = [{t:0,level:0.5},{t:60,level:0.51},{t:120,level:0.5},{t:180,level:0.51},{t:240,level:0.5}];
  const noisy = [{t:0,level:0.1},{t:60,level:0.9},{t:120,level:0.2},{t:180,level:0.8},{t:240,level:0.15}];
  const rStable = forecastEdge32({history, recent: stable, horizonMin:10});
  const rNoisy = forecastEdge32({history, recent: noisy, horizonMin:10});
  assert.ok(rNoisy.reliability < rStable.reliability, `noisy ${rNoisy.reliability} vs ${rStable.reliability}`);
});

test('horizon xa -> reliability giảm', () => {
  const history = new Array(24).fill(0.5);
  const recent = makeRecent(0.01, 6, 0, 0.5);
  const r10 = forecastEdge32({history, recent, horizonMin:10});
  const r30 = forecastEdge32({history, recent, horizonMin:30});
  assert.ok(r30.reliability < r10.reliability, `30 ${r30.reliability} vs 10 ${r10.reliability}`);
});

test('prob là xác suất kẹt level>=0.7: level cao cho prob cao', () => {
  const historyHigh = new Array(24).fill(0.9);
  const historyLow = new Array(24).fill(0.1);
  const recentHigh = makeRecent(0, 5, 0, 0.9);
  const recentLow = makeRecent(0, 5, 0, 0.1);
  const pHigh = forecastEdge32({history: historyHigh, recent: recentHigh, horizonMin:10});
  const pLow = forecastEdge32({history: historyLow, recent: recentLow, horizonMin:10});
  assert.ok(pHigh.prob > 0.6, `high ${pHigh.prob}`);
  assert.ok(pLow.prob < 0.4, `low ${pLow.prob}`);
});

test('alerts32 sắp theo prob giảm dần và lọc theo ngưỡng', () => {
  const levels = new Float32Array([0.2, 0.8, 0.5]);
  const forecasts = [
    {prob:0.2, reliability:0.9, horizonMin:10},
    {prob:0.85, reliability:0.8, horizonMin:10},
    {prob:0.65, reliability:0.7, horizonMin:10},
  ];
  const alerts = alerts32(levels, forecasts, {probThreshold:0.6});
  assert.equal(alerts.length, 2);
  assert.equal(alerts[0].edge, 1);
  assert.equal(alerts[1].edge, 2);
  assert.ok(alerts[0].prob >= alerts[1].prob);
  for(const a of alerts){ assert.ok('level' in a); assert.ok('reliability' in a); assert.ok('horizonMin' in a); }
});

test('combineWithLookahead32 trộn đúng trọng số', () => {
  const stat = {prob:0.2, reliability:0.8};
  const look = {prob:0.8, reliability:0.9};
  const c0 = combineWithLookahead32(stat, look, 0);
  assert.ok(Math.abs(c0.prob - 0.2) < 1e-9);
  const c1 = combineWithLookahead32(stat, look, 1);
  assert.ok(Math.abs(c1.prob - 0.8) < 1e-9);
  const c05 = combineWithLookahead32(stat, look, 0.5);
  assert.ok(Math.abs(c05.prob - 0.5) < 1e-9);
  assert.ok(c05.reliability >= 0 && c05.reliability <= 1);
  const cNeg = combineWithLookahead32(stat, look, -1);
  assert.ok(Math.abs(cNeg.prob - 0.2) < 1e-9);
  const cOver = combineWithLookahead32(stat, look, 2);
  assert.ok(Math.abs(cOver.prob - 0.8) < 1e-9);
});

test('forecastEdge32 với recent rỗng vẫn trả prob/reliability hợp lệ', () => {
  const r = forecastEdge32({history: new Array(24).fill(0.4), recent: [], horizonMin:10});
  assert.ok(r.prob>=0&&r.prob<=1);
  assert.ok(r.reliability>=0&&r.reliability<=1);
  assert.ok(r.reliability < 0.5);
});
