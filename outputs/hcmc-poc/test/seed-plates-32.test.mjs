import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { plateFor32, loadOwners32 } from '../violation-perception-32.js?v=32a';

const require = createRequire(import.meta.url);
const PYTHON = process.env.PYTHON || 'python';

test('plates.json do seed_plates.py sinh khớp plateFor32 bản JS (test chéo)', () => {
  execFileSync(PYTHON, ['outputs/smart-traffic/backend/app/seed/seed_plates.py', '--out', 'outputs/smart-traffic/backend/app/seed/plates.json'], { stdio: 'pipe' });
  const rows = JSON.parse(fs.readFileSync('outputs/smart-traffic/backend/app/seed/plates.json', 'utf8'));
  assert.ok(rows.length >= 3600, `chỉ ${rows.length} dòng`);
  const owners = JSON.parse(fs.readFileSync('outputs/smart-traffic/backend/app/seed/owners.json', 'utf8'));
  assert.equal(owners.length, 200);
  loadOwners32(owners);
  const byKey = new Map(rows.map(r => [`${r.slot}|${r.gen}|${r.vehicle_class}`, r]));
  for (const [slot, gen, cls] of [[1, 0, 'car'], [42, 1, 'car'], [42, 1, 'motorbike'], [3599, 2, 'car'], [100, 0, 'motorbike'], [2, 0, 'car'], [2, 0, 'motorbike']]) {
    const py = byKey.get(`${slot}|${gen}|${cls}`);
    assert.ok(py, `thiếu dòng ${slot}|${gen}|${cls}`);
    const js = plateFor32(slot, gen, cls, py.salt || 0);
    assert.equal(js.plate, py.plate, `plate lệch slot=${slot} gen=${gen} cls=${cls}`);
    assert.equal(js.salt, py.salt);
    assert.equal(js.color, py.color);
    assert.equal(js.owner_name, py.owner_name);
    assert.equal(js.owner_phone, py.owner_phone);
    assert.equal(js.is_scenario, py.is_scenario);
    assert.equal(js.plate_format, py.plate_format);
  }
});

test('định dạng biển sinh ra luôn khớp regex; scenario rows đúng 6', () => {
  const rows = JSON.parse(fs.readFileSync('outputs/smart-traffic/backend/app/seed/plates.json', 'utf8'));
  for (const r of rows.slice(0, 200)) {
    const re = r.plate_format === 'motorbike' ? /^[0-9]{2}-[A-Z][0-9] [0-9]{3}\.[0-9]{2}$/ : /^[0-9]{2}[A-Z][0-9]?-[0-9]{3}\.[0-9]{2}$/;
    assert.match(r.plate, re, JSON.stringify(r));
  }
  assert.equal(rows.filter(r => r.is_scenario).length, 6);
  // Biển phải DUY NHẤT (khử trùng bằng salt khi sinh).
  assert.equal(new Set(rows.map(r => r.plate)).size, rows.length, 'biển trùng');
  // Không trùng (slot, gen, vehicle_class); cùng (slot, gen) khác format thì biển khác nhau.
  const keys = new Set(rows.map(r => `${r.slot}|${r.gen}|${r.vehicle_class}`));
  assert.equal(keys.size, rows.length, 'trùng khoá (slot, gen, vehicle_class)');
  const fmtPairs = new Map();
  for (const r of rows) {
    const k = `${r.slot}|${r.gen}`;
    const prev = fmtPairs.get(k);
    if (prev && prev.plate_format !== r.plate_format) assert.notEqual(prev.plate, r.plate);
    fmtPairs.set(k, r);
  }
});
