#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, globSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCheck } from './checks.mjs';
import { verifyReleaseInputs } from './evidence.mjs';
import { KPI_DURATION_S, KPI_SCENARIO, KPI_SEEDS, validateKpi } from './kpi.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const webRoot = join(root, 'outputs/smart-traffic/web');
const node = process.execPath;
const minute = 60_000;
const releaseIds = ['PUB-01', 'DATA-01', 'SIM-01', 'AI-01', 'CAM-01', 'USER-01', 'PERF-01', 'DOCKER-01'];
const usage = 'node scripts/hardtest/run.mjs --profile ci|release [--output-dir <thư mục cha>]';

function parseArguments(args) {
  const options = new Map();
  for (let i = 0; i < args.length; i += 2) {
    const [key, value] = args.slice(i, i + 2);
    if (!['--profile', '--output-dir'].includes(key) || !value || value.startsWith('--') || options.has(key)) {
      throw new Error(usage);
    }
    options.set(key, value);
  }
  const profile = options.get('--profile');
  if (!['ci', 'release'].includes(profile)) throw new Error(usage);
  return { profile, outputBase: resolve(options.get('--output-dir') ?? tmpdir()) };
}

function pythonExecutable() {
  if (process.env.HARDTEST_PYTHON) return process.env.HARDTEST_PYTHON;
  const executable = process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python';
  const venvs = ['.venv', '.venv311'].map(name => join(root, 'outputs/smart-traffic/backend', name, executable));
  return venvs.find(existsSync) ?? 'python';
}

function nodeTests(id, files, timeoutMs = 3 * minute, requiredCases = []) {
  return {
    id, command: node, cwd: root, args: ['--test', '--test-reporter=tap', ...files],
    timeoutMs, reporter: 'tap', requiredFiles: files, requiredCases,
  };
}

const caseIds = (prefix, count) => Array.from({ length: count }, (_, i) => `${prefix}-${String(i + 1).padStart(2, '0')}`);

function ciChecks(outputDir) {
  const vitestReport = join(outputDir, 'WEB-TEST.json');
  const pytestReport = join(outputDir, 'API-REGRESSION.xml');
  return [
    nodeTests('AGENT-PREFLIGHT', ['scripts/agent/preflight.test.mjs']),
    nodeTests('GATE-META', ['scripts/hardtest/kpi.test.mjs', 'scripts/hardtest/evidence.test.mjs', 'scripts/hardtest/meta.test.mjs'], 3 * minute, caseIds('GATE-META', 9)),
    nodeTests('GATE-CROSS', ['scripts/hardtest/cross.test.mjs'], 3 * minute, caseIds('GATE-CROSS', 5)),
    nodeTests('SIM-REGRESSION', ['outputs/hcmc-poc/test/*.test.mjs'], 18 * minute),
    {
      id: 'WEB-TYPECHECK',
      command: node,
      args: ['node_modules/typescript/bin/tsc', '--noEmit'],
      cwd: webRoot,
      timeoutMs: 3 * minute,
    },
    {
      id: 'WEB-TEST',
      command: node,
      args: ['node_modules/vitest/vitest.mjs', 'run', '--reporter=json', '--outputFile', vitestReport],
      cwd: webRoot,
      timeoutMs: 3 * minute,
      reporter: 'vitest',
      reportPath: vitestReport,
    },
    {
      id: 'WEB-BUILD',
      command: node,
      args: ['node_modules/vite/bin/vite.js', 'build', '--outDir', join(outputDir, 'web-build')],
      cwd: webRoot,
      timeoutMs: 3 * minute,
    },
    {
      id: 'API-REGRESSION',
      command: pythonExecutable(),
      args: ['-B', '-m', 'pytest', 'outputs/smart-traffic/backend/tests', '-q', '-p', 'no:cacheprovider', '--junitxml', pytestReport],
      cwd: root,
      timeoutMs: 12 * minute,
      reporter: 'junit',
      reportPath: pytestReport,
    },
  ];
}

function kpiCheck(outputDir) {
  const reportPath = join(outputDir, `a1-${KPI_SCENARIO}.json`);
  return {
    id: 'SIM-A1',
    command: node,
    args: [
      'scripts/kpi-ab-32.mjs', '--seeds', KPI_SEEDS.join(','), '--scenario', KPI_SCENARIO,
      '--duration', String(KPI_DURATION_S), '--mode', 'both', '--out', outputDir,
    ],
    cwd: root,
    timeoutMs: 120 * minute,
    reportPath,
    inspect: text => validateKpi(JSON.parse(text)),
  };
}

function releaseChecks() {
  return releaseIds.map(id => {
    const files = [`scripts/hardtest/release/${id}.test.mjs`];
    return nodeTests(id, files, (id === 'PERF-01' ? 40 : 12) * minute, [id]);
  });
}

function digest(path) {
  const file = join(root, path);
  return existsSync(file) ? createHash('sha256').update(readFileSync(file)).digest('hex') : null;
}

function git(...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
}

function hasWorktreeChanges() {
  return Boolean(git('status', '--porcelain=v1', '--untracked-files=normal', '--', '.', ':!work', ':!.claude/launch.json'));
}

function blocked(id, reason, message) {
  return { id, status: 'BLOCKED', reason, message, elapsedMs: 0, logs: [] };
}

function main({ profile, outputBase }) {
  mkdirSync(outputBase, { recursive: true });
  const outputDir = mkdtempSync(join(outputBase, 'smtf-hardtest-'));
  const startedAt = new Date().toISOString();
  const checks = [];
  const report = {
    schemaVersion: 1,
    profile,
    commit: git('rev-parse', 'HEAD'),
    worktreeDirty: hasWorktreeChanges(),
    contractDigest: digest('docs/agent/CONTRACT-PUBLIC-DEMO.md'),
    specDigest: digest('docs/agent/PUBLIC-DEMO-SPEC.md'),
    fixtureDigest: digest('docs/agent/fixtures/public-demo-v1.json'),
    startedAt,
    checks,
  };
  const add = check => {
    checks.push(check);
    console.log(`[${check.status}] ${check.id} ${check.message}`);
  };
  const execute = check => {
    console.log(`[RUN] ${check.id}`);
    add(runCheck(check, { outputDir }));
  };
  const baseline = ciChecks(outputDir);
  const publication = profile === 'release' ? [...releaseChecks(), kpiCheck(outputDir)] : [];
  console.log(`Hardtest ${profile} · ${outputDir}`);

  if (!report.contractDigest || !report.specDigest || !report.fixtureDigest) {
    add(blocked('GATE-SPEC', 'missing-contract', 'Thiếu đặc tả, hợp đồng hoặc fixture đã quy định.'));
  }
  if (profile === 'release' && report.worktreeDirty) {
    add(blocked('GATE-RELEASE-SOURCE', 'dirty-worktree', 'Cần checkout sạch để gắn bằng chứng với đúng commit.'));
  }
  const envFile = name => process.env[name] ? resolve(process.env[name]) : undefined;
  const manifestPath = envFile('HARDTEST_RELEASE_MANIFEST');
  const evidencePath = envFile('HARDTEST_RELEASE_EVIDENCE');
  if (profile === 'release') {
    const inputs = verifyReleaseInputs({ manifestPath, evidencePath, commit: report.commit, contractDigest: report.contractDigest });
    report.releaseManifestDigest = inputs.releaseManifestDigest;
    report.evidenceDigest = inputs.evidenceDigest;
    if (inputs.ok) {
      add({
        id: 'GATE-RELEASE-INPUTS', status: 'PASS', reason: 'inputs-bound',
        message: 'Manifest và các tệp bằng chứng đã khớp commit và hợp đồng.', elapsedMs: 0, logs: [],
      });
    } else {
      add(blocked('GATE-RELEASE-INPUTS', 'missing-or-invalid-inputs', inputs.errors.join(' ')));
    }
  }
  const allChecks = [...baseline, ...publication];
  const missing = new Map();
  for (const check of allChecks) {
    const absent = check.requiredFiles?.filter(file => globSync(file, { cwd: root }).length === 0) ?? [];
    if (absent.length) missing.set(check.id, absent);
  }
  const inputsBlocked = checks.some(check => check.status !== 'PASS') ||
    (profile === 'release' && missing.size > 0);
  for (const check of allChecks) {
    const absent = missing.get(check.id);
    if (absent) {
      add(blocked(check.id, 'missing-suite', `Thiếu bộ nghiệm thu ${absent.join(', ')}.`));
    } else if (inputsBlocked) {
      add(blocked(check.id, 'prerequisites', 'Còn điều kiện khởi chạy cần hoàn tất.'));
    } else {
      check.env = {
        ...(manifestPath && { HARDTEST_RELEASE_MANIFEST: manifestPath }),
        ...(evidencePath && { HARDTEST_RELEASE_EVIDENCE: evidencePath }),
        HARDTEST_COMMIT: report.commit,
        HARDTEST_CONTRACT_DIGEST: report.contractDigest,
        HARDTEST_RUN_DIR: outputDir,
      };
      execute(check);
    }
  }
  if (profile === 'release' && checks.every(check => check.status === 'PASS')) {
    const inputs = verifyReleaseInputs({ manifestPath, evidencePath, commit: report.commit, contractDigest: report.contractDigest });
    if (git('rev-parse', 'HEAD') !== report.commit || hasWorktreeChanges() || !inputs.ok ||
        report.releaseManifestDigest !== inputs.releaseManifestDigest || report.evidenceDigest !== inputs.evidenceDigest) {
      add(blocked('GATE-RELEASE-PROVENANCE', 'inputs-changed', 'Commit, checkout hoặc bằng chứng đã đổi trong lượt kiểm.'));
    }
  }
  const ok = checks.length > 0 && checks.every(check => check.status === 'PASS');
  const reportPath = join(outputDir, 'report.json');
  writeFileSync(reportPath, JSON.stringify({ ...report, finishedAt: new Date().toISOString(), ok }, null, 2) + '\n', 'utf8');
  console.log(`Báo cáo ${reportPath}`);
  return ok ? 0 : 1;
}

let options;
try {
  options = parseArguments(process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 2;
}
if (options) {
  try {
    process.exitCode = main(options);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
