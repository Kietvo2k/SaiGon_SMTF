import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { runCheck } from './checks.mjs';
import { validateKpi } from './kpi.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));

function temporaryDirectory(t) {
  const directory = mkdtempSync(join(tmpdir(), 'smtf-meta-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function runNodeSuite(directory, source, id = 'GATE-META-SAMPLE', requiredCases = []) {
  const file = join(directory, 'sample.test.mjs');
  writeFileSync(file, source, 'utf8');
  return runCheck({
    id,
    command: process.execPath,
    args: ['--test', '--test-reporter=tap', file],
    cwd: directory,
    timeoutMs: 5000,
    reporter: 'tap',
    requiredFiles: [file],
    requiredCases,
    // Node bỏ lượt chạy --test lồng nhau khi thừa hưởng biến nội bộ này.
    env: { NODE_TEST_CONTEXT: undefined },
  }, { outputDir: directory });
}

test('GATE-META-09 kiểm bộ còn ca xanh nhưng bị bỏ mất ca bắt buộc', t => {
  const directory = temporaryDirectory(t);
  const result = runNodeSuite(directory, "import { test } from 'node:test'; test('CHECK-01 đạt', () => {});",
    'GATE-META-MISSING-ID', ['CHECK-01', 'CHECK-02']);
  assert.equal(result.status, 'FAIL');
  assert.equal(result.reason, 'missing-test-ids');
  assert.match(result.message, /CHECK-02/);
});

function reportCommand(directory, reportPath, contents) {
  return {
    id: 'GATE-META-REPORT',
    command: process.execPath,
    args: [
      '-e', 'require("node:fs").writeFileSync(process.argv[1], process.argv[2], "utf8")',
      reportPath, contents,
    ],
    cwd: directory,
    timeoutMs: 5000,
    reportPath,
  };
}

test('GATE-META-01 xác nhận hai ca thật, thống kê và tệp log', t => {
  const directory = temporaryDirectory(t);
  const result = runNodeSuite(directory, `
    import assert from 'node:assert/strict';
    import { test } from 'node:test';
    test('ca thứ nhất', () => assert.equal(3 + 4, 7));
    test('ca thứ hai', () => assert.equal(4 * 4, 16));
  `);
  assert.equal(result.status, 'PASS');
  assert.equal(result.reason, 'tests-passed');
  assert.deepEqual(result.details, { total: 2, passed: 2, incomplete: 0 });
  assert.equal(result.logs.length, 2);
  assert.ok(result.logs.every(file => existsSync(join(directory, file))));
});

test('GATE-META-02 bắt đúng một lỗi có chủ đích trong bộ ca còn lại đã xanh', t => {
  const directory = temporaryDirectory(t);
  const result = runNodeSuite(directory, `
    import assert from 'node:assert/strict';
    import { test } from 'node:test';
    test('ca đối chứng giữ xanh', () => assert.equal(3 + 4, 7));
    test('MUT-01 sai kết quả', () => assert.equal(4 * 4, 15));
  `);
  assert.equal(result.status, 'FAIL');
  assert.equal(result.reason, 'exit-code');
  const log = readFileSync(join(directory, result.logs[0]), 'utf8');
  assert.match(log, /^ok 1 - ca đối chứng giữ xanh$/m);
  assert.match(log, /^not ok 2 - MUT-01 sai kết quả$/m);
  assert.match(log, /^# fail 1$/m);
});

test('GATE-META-03 từ chối tệp chạy được nhưng không đăng ký ca nào', t => {
  const result = runNodeSuite(temporaryDirectory(t), 'export const sample = 42;\n');
  assert.equal(result.status, 'FAIL');
  assert.equal(result.reason, 'incomplete-tests');
});

test('GATE-META-04 từ chối ca skip hoặc todo dù Node trả mã 0', t => {
  const directory = temporaryDirectory(t);
  for (const flag of ['skip', 'todo']) {
    const id = `GATE-META-${flag.toUpperCase()}`;
    const result = runNodeSuite(directory, `
      import { test } from 'node:test';
      test('ca xanh', () => {});
      test('ca chưa làm', { ${flag}: true }, () => {});
    `, id);
    assert.equal(result.status, 'FAIL', flag);
    assert.equal(result.reason, 'incomplete-tests', flag);
    assert.equal(result.details.incomplete, 1, flag);
  }
});

test('GATE-META-05 báo đúng nguyên nhân khi tiến trình hết giờ', t => {
  const directory = temporaryDirectory(t);
  const result = runCheck({
    id: 'GATE-META-TIMEOUT',
    command: process.execPath,
    args: ['-e', 'setInterval(() => {}, 60_000)'],
    cwd: directory,
    timeoutMs: 500,
  }, { outputDir: directory });
  assert.equal(result.status, 'FAIL');
  assert.equal(result.reason, 'timeout');
});

test('GATE-META-06 từ chối báo cáo hỏng và báo cáo cũ', t => {
  const directory = temporaryDirectory(t);
  const badReport = join(directory, 'malformed.json');
  const result = runCheck({
    ...reportCommand(directory, badReport, '{"success":'),
    reporter: 'vitest',
  }, { outputDir: directory });
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.reason, 'invalid-report');
  assert.equal(readFileSync(badReport, 'utf8'), '{"success":');

  const oldReport = join(directory, 'previous.json');
  writeFileSync(oldReport, 'bằng chứng của lượt trước', 'utf8');
  const stale = runCheck(reportCommand(directory, oldReport, 'kết quả mới'), {
    outputDir: directory,
  });
  assert.equal(stale.status, 'BLOCKED');
  assert.equal(stale.reason, 'stale-report');
  assert.equal(readFileSync(oldReport, 'utf8'), 'bằng chứng của lượt trước');
});

function benchmarkReport() {
  const seeds = [31031, 31032, 31033, 31034, 31035];
  const scenario = 'peak-hang-xanh';
  return {
    seeds,
    scenario,
    duration_s: 1800,
    window_s: [300, 1800],
    pass_threshold: true,
    throughput_ok: true,
    mean_delta_pct: 16,
    rows: seeds.map(seed => {
      const setup = {
        seed,
        scenario,
        duration_s: 1800,
        a1_window_s: [300, 1800],
        demand: { poolScale: 2 },
        breaker_s: 180,
        params: {},
      };
      return {
        seed,
        fixed: { ...setup, mode: 'fixed', a1_delay_s_hx: 100, a1_crossings_hx: 100 },
        smart: { ...setup, mode: 'smart', a1_delay_s_hx: 84, a1_crossings_hx: 96 },
      };
    }),
  };
}

test('GATE-META-07 bắt báo cáo KPI cố tình khai đạt dù số đo giảm dưới 15%', t => {
  const directory = temporaryDirectory(t);
  function evaluate(name, report) {
    const reportPath = join(directory, `${name}.json`);
    return runCheck({
      ...reportCommand(directory, reportPath, JSON.stringify(report)),
      id: name,
      inspect: text => validateKpi(JSON.parse(text)),
    }, { outputDir: directory });
  }

  const report = benchmarkReport();
  const control = evaluate('GATE-META-A1-CONTROL', report);
  assert.equal(control.status, 'PASS');
  assert.equal(control.details.meanDelayImprovementPct, 16);

  report.rows[1].smart.a1_delay_s_hx = 90;
  const mutant = evaluate('GATE-META-A1-MUT-02', report);
  assert.equal(mutant.status, 'FAIL');
  assert.equal(mutant.reason, 'acceptance');
  assert.equal(mutant.details.meanDelayImprovementPct, 14.8);
  assert.match(mutant.message, /Độ trễ trung bình.*14\.80%.*15%/);
  assert.equal(mutant.details.errors.length, 1);
});

test('GATE-META-08 CLI release chặn bằng chứng sai SHA và xuất đủ mã bắt buộc', t => {
  const directory = temporaryDirectory(t);
  const stale = join(directory, 'stale.json');
  writeFileSync(stale, JSON.stringify({
    schemaVersion: 1,
    commit: 'stale-commit',
    contractDigest: 'stale-contract',
  }), 'utf8');
  const processResult = spawnSync(process.execPath, [
    'scripts/hardtest/run.mjs', '--profile', 'release', '--output-dir', directory,
  ], {
    cwd: root,
    encoding: 'utf8',
    timeout: 15000,
    env: { ...process.env, HARDTEST_RELEASE_MANIFEST: stale, HARDTEST_RELEASE_EVIDENCE: stale },
  });
  assert.ifError(processResult.error);
  assert.equal(processResult.status, 1, processResult.stderr);
  const runs = readdirSync(directory, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && entry.name.startsWith('smtf-hardtest-'));
  assert.equal(runs.length, 1);
  const report = JSON.parse(readFileSync(join(directory, runs[0].name, 'report.json'), 'utf8'));
  assert.equal(report.profile, 'release');
  assert.equal(report.ok, false);
  const checks = new Map(report.checks.map(check => [check.id, check]));
  assert.equal(checks.size, report.checks.length);
  const required = [
    'AGENT-PREFLIGHT', 'GATE-META', 'GATE-CROSS', 'SIM-REGRESSION',
    'WEB-TYPECHECK', 'WEB-TEST', 'WEB-BUILD', 'API-REGRESSION',
    'PUB-01', 'DATA-01', 'SIM-01', 'SIM-A1', 'AI-01', 'CAM-01', 'USER-01', 'PERF-01', 'DOCKER-01',
  ];
  for (const id of required) assert.equal(checks.get(id)?.status, 'BLOCKED', id);
  const inputs = checks.get('GATE-RELEASE-INPUTS');
  assert.equal(inputs.status, 'BLOCKED');
  assert.equal(inputs.reason, 'missing-or-invalid-inputs');
  assert.match(inputs.message, /HARDTEST_RELEASE_MANIFEST sai phiên bản, commit/);
  assert.match(inputs.message, /HARDTEST_RELEASE_EVIDENCE sai phiên bản, commit/);
});
