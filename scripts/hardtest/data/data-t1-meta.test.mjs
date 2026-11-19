import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { runCheck } from '../checks.mjs';
import { verifyReleaseInputs } from '../evidence.mjs';

// Oracle độc lập: khóa từng tên ca theo brief, không đọc expected từ helper sản phẩm.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const suite = 'scripts/hardtest/data/data-t1.test.mjs';
const review = 'scripts/hardtest/data/data-t1-review.test.mjs';
const backend = 'outputs/smart-traffic/backend';
const reviewPy = backend + '/tests/test_public_demo_review.py';
const modules = 'outputs/shared/public-demo';
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
const startSha = git('rev-parse', 'HEAD');
const commonDir = git('rev-parse', '--path-format=absolute', '--git-common-dir');
const pythonBin = process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python';
const python = process.env.HARDTEST_PYTHON || [root, dirname(commonDir)]
  .flatMap(base => ['.venv311', '.venv'].map(name => join(base, backend, name, pythonBin)))
  .find(existsSync) || 'python';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const evidenceRoot = join(root, 'work/smtf-agent/meta');
mkdirSync(evidenceRoot, { recursive: true });
const outputRoot = mkdtempSync(join(evidenceRoot, 'data-t1-'));
console.log('DATA-T1-META evidence:', outputRoot, 'candidate:', startSha);

const expectedNames = [
  'DATA-T1-TRANSPORT entry có factory tường minh và đúng ba phương thức',
  'DATA-T1-TRANSPORT local giữ path/query/bearer, lỗi, Blob và AbortSignal qua HTTP thật',
  'DATA-T1-AUTH public đăng nhập bốn role, chống token giả và logout thu hồi phiên, không fetch loopback',
  'DATA-T1-TRANSPORT public từ chối storage/AbortSignal và media thiếu có mã lỗi, không fallback',
  'DATA-T1-AUTH quyền do session quyết định, disable và expiry thu hồi public token',
  'DATA-T1-LEASE hai tab tranh lease, chỉ owner thắng được heartbeat/snapshot/ACK',
  'DATA-T1-ACK bridge giữ pending đến callback, áp một lần và unsubscribe idempotent',
  'DATA-T1-ACK bridge stop/start không nhận renew cũ hoặc ACK ngoài lifecycle hiện hành (response trước start mới)',
  'DATA-T1-ACK bridge stop/start không nhận renew cũ hoặc ACK ngoài lifecycle hiện hành (response sau start mới)',
  'DATA-T1-ACK callback từ chối trả rejected và không ghi applied_t_sim',
  'DATA-T1-TRANSACTION abort sau write nhưng trước complete không lưu command/audit hoặc phát event sớm',
  'DATA-T1-ACK chưa dequeue không ACK được; command terminal không đổi bởi ACK trùng',
  'DATA-T1-EXPIRY quá 10 giây thực, reload và takeover vẫn expired, owner cũ không hồi sinh lệnh',
  'DATA-T1-PROFILE hai tab cùng kho, context độc lập không thấy session/command/snapshot của nhau',
  'DATA-T1-TRANSACTION writer chưa subscribe vẫn phát event metadata sau complete sang tab đọc',
  'DATA-T1-TRANSACTION quota lỗi không làm mất command đã commit hoặc phiên đang dùng',
  'DATA-T1-TRANSPORT local subscribe nhận envelope WS và hủy idempotent',
  'DATA-T1-LOCAL adapter local gọi FastAPI thật với DB test riêng, giữ pending/ACK/error/Blob/abort',
];
const requiredCases = ['DATA-T1-TRANSPORT', 'DATA-T1-AUTH', 'DATA-T1-LEASE', 'DATA-T1-ACK', 'DATA-T1-TRANSACTION', 'DATA-T1-EXPIRY', 'DATA-T1-PROFILE', 'DATA-T1-LOCAL'];
const reviewNames = [
  'DATA-T1-R3 public: URL encode một lần, dedup giữ nguyên ID',
  'DATA-T1-R6 public: telemetry hiện hành thay mode, override và pha đèn',
  'DATA-T1-R6 public: TTL 1 giây bắt đầu lúc ACK, trạng thái lệnh vẫn applied sau hết hạn',
  'DATA-T1-R4 runtime: mười camera nối đúng cụm đèn logic',
  'DATA-T1-R5 runtime: snapshot mang seed thật của hai mô phỏng',
];
const reviewPyNames = [
  'test_r1_station_writes_require_current_lease_during_takeover',
  'test_r1_station_ws_fences_already_open_and_new_legacy_sessions[inbound]',
  'test_r1_station_ws_fences_already_open_and_new_legacy_sessions[outbound]',
  'test_r3_uvicorn_command_id_round_trip_and_dedup',
  'test_r4_local_fallback_camera_to_logic_cluster',
  'test_r7_local_frame_notifies_committed_snapshot_and_stream',
];
const records = [];
const sourcePaths = [...git('ls-files', '-z', '--', modules, backend).split('\0').filter(Boolean), suite, review];
git('diff', 'HEAD', '--exit-code', '--', ...sourcePaths);
const initialBytes = new Map(sourcePaths.map(path => [path, readFileSync(join(root, path))]));
const subject = join(outputRoot, 's');
let cleanTap;
let cleanReviewTap;
let cleanReviewXml;

function directory(label) {
  const path = join(outputRoot, label);
  mkdirSync(path, { recursive: true });
  return path;
}

function check(label, options) {
  const outputDir = directory(label);
  const command = { id: label, command: process.execPath, cwd: root, timeoutMs: 90000, ...options };
  const result = runCheck(command, { outputDir });
  const rawLogs = Object.fromEntries(result.logs.map(path => {
    const absolute = join(outputDir, path);
    return [path, existsSync(absolute) ? digest(readFileSync(absolute)) : null];
  }));
  const record = {
    label, candidate: startSha, command: command.command, args: command.args, cwd: command.cwd,
    productRoot: command.env?.DATA_T1_ROOT ?? null,
    reportSha256: command.reportPath && existsSync(command.reportPath) ? digest(readFileSync(command.reportPath)) : null,
    result, rawLogs,
  };
  records.push(record);
  writeFileSync(join(outputDir, 'result.json'), JSON.stringify(record, null, 2) + '\n', 'utf8');
  return { result, outputDir, stdout: existsSync(join(outputDir, `${label}.stdout.log`)) ? readFileSync(join(outputDir, `${label}.stdout.log`), 'utf8') : '' };
}

function nodeSubject(label, file, { pattern, productRoot = root } = {}) {
  const ids = file === suite ? requiredCases : ['DATA-T1-R3', 'DATA-T1-R4', 'DATA-T1-R5', 'DATA-T1-R6'];
  return check(label, {
    args: ['--test', '--test-reporter=tap', ...(pattern ? ['--test-name-pattern', pattern] : []), file],
    reporter: 'tap', requiredCases: pattern ? [] : ids,
    env: { DATA_T1_ROOT: productRoot },
  });
}

function primary(label, pattern) {
  return nodeSubject(label, suite, { pattern, productRoot: pattern ? subject : root });
}

function pytest(label, { productRoot = root, id, fixture } = {}) {
  const reportPath = join(directory(label), 'junit.xml');
  const path = fixture || reviewPy + (id ? '::' + id : '');
  const result = check(label, {
    command: python, cwd: productRoot, timeoutMs: 120000,
    args: ['-B', '-m', 'pytest', path, '-q', '-p', 'no:cacheprovider', '--rootdir', productRoot, '--junitxml', reportPath],
    reporter: 'junit', reportPath,
    env: { DATA_T1_ROOT: productRoot, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' },
  });
  return { ...result, xml: existsSync(reportPath) ? readFileSync(reportPath, 'utf8') : '' };
}

function assertInventory(tap, names = expectedNames) {
  const actual = [...tap.matchAll(/^ok \d+ - (.+)\r?$/gm)].map(match => match[1].replace(/\r$/, ''));
  assert.deepEqual(actual, names, 'DATA-T1 inventory phải đủ từng ca đúng một lần');
}

function assertPyInventory(xml, names = reviewPyNames) {
  const cases = [...xml.matchAll(/<testcase\s+([^>]+)>/g)].map(([, attrs]) => ({
    module: /\bclassname="([^"]+)"/.exec(attrs)?.[1],
    name: /\bname="([^"]+)"/.exec(attrs)?.[1],
  }));
  assert.ok(cases.every(item => item.module?.endsWith('.test_public_demo_review')), 'JUnit sai module review');
  assert.deepEqual(cases.map(item => item.name), names, 'JUnit phải đủ đúng từng ID Pytest review');
}

function assertCounts(run, count) {
  expectReason(run, 'PASS', 'tests-passed');
  assert.deepEqual(run.result.details, { total: count, passed: count, incomplete: 0 });
}

function prepareSubject() {
  if (existsSync(subject)) return;
  // Chỉ sao các file Git đã kiểm sạch; không động vào checkout được giao.
  for (const [path, bytes] of initialBytes) {
    if (path === suite || path === review) continue;
    const destination = join(subject, path);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(join(root, path), destination);
    assert.equal(digest(readFileSync(destination)), digest(bytes), path);
  }
  writeFileSync(join(subject, 'snapshot.json'), JSON.stringify({
    commit: startSha, original: root,
    sourceSha256: Object.fromEntries([...initialBytes].map(([path, bytes]) => [path, digest(bytes)])),
  }, null, 2) + '\n', 'utf8');
}

function nodeFixture(label, source, options = {}) {
  const path = join(directory(label), 'subject.test.mjs');
  writeFileSync(path, source, 'utf8');
  return check(label, { args: ['--test', '--test-reporter=tap', path], reporter: 'tap', ...options });
}

function replay(label, tap, options = {}) {
  const path = join(directory(label), 'captured.tap');
  writeFileSync(path, tap, 'utf8');
  return check(label, { args: ['-e', 'process.stdout.write(require("node:fs").readFileSync(process.argv[1]))', path], reporter: 'tap', requiredCases, ...options });
}

function expectReason(actual, status, reason) {
  assert.equal(actual.result.status, status, JSON.stringify(actual.result));
  assert.equal(actual.result.reason, reason, JSON.stringify(actual.result));
}

function replaceOnce(source, oldText, newText) {
  assert.equal(source.split(oldText).length - 1, 1, 'Mutant phải khớp đúng một span đã biết');
  return source.replace(oldText, newText);
}

function mutation(label, path, mutate, run, cases, verifyRed) {
  assert.ok(cleanTap, 'Phải có baseline sạch trước khi chạy mutant');
  prepareSubject();
  const absolute = join(subject, path);
  const bytes = readFileSync(absolute);
  assert.equal(digest(bytes), digest(initialBytes.get(path)), 'Chỉ đột biến byte sạch đã chụp đầu lượt');
  const backup = directory(label);
  const originalPath = join(backup, 'original.bin');
  const mutantPath = join(backup, 'mutant.bin');
  writeFileSync(originalPath, bytes);
  let red;
  try {
    const source = bytes.toString('utf8');
    const mutant = mutate(source).replace(/\r?\n/g, source.includes('\r\n') ? '\r\n' : '\n');
    assert.notEqual(mutant, bytes.toString('utf8'));
    writeFileSync(absolute, mutant, 'utf8');
    writeFileSync(mutantPath, readFileSync(absolute));
    const diff = spawnSync('git', ['diff', '--no-index', '--text', '--', originalPath, mutantPath], { encoding: 'utf8', windowsHide: true });
    assert.ifError(diff.error);
    assert.equal(diff.status, 1, diff.stderr);
    writeFileSync(join(backup, 'mutant.diff'), diff.stdout, 'utf8');
    red = run(`${label}-red`);
  } finally {
    writeFileSync(absolute, bytes);
    assert.equal(digest(readFileSync(absolute)), digest(bytes), 'Phải khôi phục nguyên byte');
  }
  const clean = run(`${label}-restored`);
  writeFileSync(join(backup, 'restoration.json'), JSON.stringify({
    candidate: startSha, subject, path, beforeSha256: digest(bytes), afterSha256: digest(readFileSync(absolute)),
    mutantSha256: digest(readFileSync(mutantPath)),
    red: red.result, restored: clean.result,
  }, null, 2) + '\n', 'utf8');
  expectReason(red, 'FAIL', 'exit-code');
  assert.match(red.result.message, /mã 1\./, 'Assertion đỏ phải trả exit 1');
  assertCounts(clean, cases.length);
  if (clean.xml) assertPyInventory(clean.xml, cases);
  else assertInventory(clean.stdout, cases);
  verifyRed(red);
}

function nodeMutation(label, path, mutate, file, pattern, cases, expectedFailures) {
  mutation(label, path, mutate, id => nodeSubject(id, file, { pattern, productRoot: subject }), cases, red => {
    const failures = [...red.stdout.matchAll(/^not ok \d+ - ([^\r\n]+)\r?\n([\s\S]*?)(?=^# Subtest:|^1\.\.|(?![\s\S]))/gm)];
    assert.deepEqual(failures.map(match => match[1]), expectedFailures.map(([name]) => name), 'Mutant phải trượt đúng tên ca');
    for (const [index, [, signature]] of expectedFailures.entries()) {
      assert.match(failures[index][2], /ERR_ASSERTION/);
      assert.match(failures[index][2], signature, 'Mutant phải trượt đúng assertion');
    }
    assert.doesNotMatch(red.stdout, /thiếu entry adapter|TimeoutError|testTimeoutFailure/);
  });
}

function pyMutation(label, path, mutate, id, signature) {
  mutation(label, path, mutate, name => pytest(name, { productRoot: subject, id }), [id], red => {
    assertPyInventory(red.xml, [id]);
    assert.match(red.xml, /<failure\b/);
    assert.doesNotMatch(red.xml, /<(?:error|skipped)\b/);
    assert.match(red.stdout, signature, 'Mutant phải trượt đúng assertion Pytest');
  });
}

after(() => {
  writeFileSync(join(outputRoot, 'summary.json'), JSON.stringify({ candidate: startSha, subject, requirements: ['DATA-01', 'USER-01', 'DOCKER-01'], records }, null, 2) + '\n', 'utf8');
});

test('DATA-T1-META-01 suite chính sạch có đủ 18 ca, exit và log thật', () => {
  const clean = primary('primary-clean');
  expectReason(clean, 'PASS', 'tests-passed');
  assert.deepEqual(clean.result.details, { total: 18, passed: 18, incomplete: 0 });
  assertInventory(clean.stdout);
  assert.equal(clean.result.logs.length, 2);
  for (const path of clean.result.logs) assert.equal(existsSync(join(clean.outputDir, path)), true);
  cleanTap = clean.stdout;
});

test('DATA-T1-META-02 thiếu ID phải fail missing-test-ids dù đủ 18 dòng xanh', () => {
  assert.ok(cleanTap);
  const altered = cleanTap.replaceAll('DATA-T1-LOCAL', 'REMOVED-LOCAL');
  const actual = replay('runner-missing-id', altered);
  expectReason(actual, 'FAIL', 'missing-test-ids');
  assert.match(actual.result.message, /DATA-T1-LOCAL/);
});

test('DATA-T1-META-03 thiếu một ca cùng ID và ca lặp bị meta inventory chặn', () => {
  assert.ok(cleanTap);
  const altered = cleanTap.replaceAll(expectedNames[9], expectedNames[6]);
  const actual = replay('runner-duplicate-case', altered);
  // API runner chỉ kiểm ID nhóm, nên guard inventory riêng là bắt buộc.
  expectReason(actual, 'PASS', 'tests-passed');
  assert.throws(() => assertInventory(actual.stdout), /inventory phải đủ từng ca/);
  // Fixture của runner, không được coi là 17 ca sản phẩm đã kiểm hành vi.
  const remaining = expectedNames.filter((_, index) => index !== 9);
  const missing = nodeFixture('runner-missing-case', `import { test } from 'node:test';\n${remaining.map(name => `test(${JSON.stringify(name)}, () => {});`).join('\n')}`, { requiredCases });
  expectReason(missing, 'PASS', 'tests-passed');
  assert.equal(missing.result.details.total, 17);
  assert.throws(() => assertInventory(missing.stdout), /inventory phải đủ từng ca/);
});

test('DATA-T1-META-04 zero, skip và todo trả incomplete-tests dù tiến trình exit 0', () => {
  for (const [label, source] of [
    ['zero', 'export const noTests = true;'],
    ['skip', "import { test } from 'node:test'; test('DATA-T1-ACK bỏ kiểm', { skip: true }, () => {});"],
    ['todo', "import { test } from 'node:test'; test('DATA-T1-ACK chưa viết', { todo: true }, () => {});"],
  ]) expectReason(nodeFixture(`runner-${label}`, source), 'FAIL', 'incomplete-tests');
});

test('DATA-T1-META-05 tiến trình lỗi giữ exit-code và log assertion nguyên vẹn', () => {
  const actual = nodeFixture('runner-exit', "import assert from 'node:assert/strict'; import { test } from 'node:test'; test('META-CONTROL assertion có nhãn', () => assert.equal(4, 5, 'MUT-RUNNER-WRONG-RESULT')); console.error('META-STDERR-MARKER');");
  expectReason(actual, 'FAIL', 'exit-code');
  assert.match(actual.stdout, /MUT-RUNNER-WRONG-RESULT/);
  // Node TAP chuyển stderr của worker thành diagnostic stdout; kiểm stderr ở tiến trình trực tiếp.
  assert.match(actual.stdout, /META-STDERR-MARKER/);
  const raw = check('runner-stderr', { args: ['-e', 'console.error("META-RAW-STDERR"); process.exitCode = 7;'] });
  expectReason(raw, 'FAIL', 'exit-code');
  assert.match(raw.result.message, /mã 7\./);
  assert.equal(readFileSync(join(raw.outputDir, raw.result.logs[1]), 'utf8').trim(), 'META-RAW-STDERR');
});

test('DATA-T1-META-06 TAP bị cắt hoặc đổi format bị BLOCKED invalid-report', () => {
  assert.ok(cleanTap);
  for (const [label, tap] of [
    ['truncated', cleanTap.slice(0, cleanTap.indexOf('\n1..18'))],
    ['format', cleanTap.replace('# tests 18', '# test_count 18')],
  ]) expectReason(replay(`runner-${label}`, tap), 'BLOCKED', 'invalid-report');
});

test('DATA-T1-META-07 report thiếu/hỏng/cũ không được xanh', () => {
  const outputDir = directory('runner-report-inputs');
  const reportPath = join(outputDir, 'report.json');
  const command = { args: ['-e', ''], reporter: 'vitest', reportPath };
  expectReason(check('runner-report-missing', command), 'BLOCKED', 'invalid-report');
  expectReason(check('runner-report-malformed', { ...command, args: ['-e', 'require("node:fs").writeFileSync(process.argv[1], "{bad")', reportPath] }), 'BLOCKED', 'invalid-report');
  const stale = check('runner-report-stale', command);
  expectReason(stale, 'BLOCKED', 'stale-report');
  // API trả trước khi spawn nên hai tên log được khai báo chưa có tệp; ghi là gap trong bàn giao.
  assert.equal(stale.result.logs.every(path => !existsSync(join(stale.outputDir, path))), true);
  assert.equal(readFileSync(reportPath, 'utf8'), '{bad');
});

test('DATA-T1-META-08 sai commit, mất artifact hoặc log đổi byte bị verifier hiện hữu chặn', () => {
  const dir = directory('runner-provenance');
  const contractDigest = digest(readFileSync(join(root, 'docs/agent/CONTRACT-PUBLIC-DEMO.md')));
  const identity = { schemaVersion: 1, commit: startSha, contractDigest };
  const manifestPath = join(dir, 'manifest.json');
  const evidencePath = join(dir, 'evidence.json');
  const artifactPath = join(dir, 'capture.log');
  const bytes = Buffer.from('META-CONTROL raw log gắn đúng candidate\n');
  writeFileSync(artifactPath, bytes);
  writeFileSync(manifestPath, JSON.stringify(identity));
  const evidence = { ...identity, releaseManifestDigest: digest(readFileSync(manifestPath)), checks: ['CAM-01', 'USER-01', 'PERF-01'].map(id => ({ id, artifacts: [{ path: 'capture.log', sha256: digest(bytes) }] })) };
  const input = { manifestPath, evidencePath, commit: startSha, contractDigest };
  const save = () => writeFileSync(evidencePath, JSON.stringify(evidence));
  save();
  assert.equal(verifyReleaseInputs(input).ok, true);
  evidence.commit = '0'.repeat(40); save();
  assert.match(verifyReleaseInputs(input).errors.join(' '), /commit/);
  evidence.commit = startSha; save();
  writeFileSync(artifactPath, 'META-CONTROL log đã bị đổi');
  assert.match(verifyReleaseInputs(input).errors.join(' '), /SHA-256 không khớp/);
  rmSync(artifactPath);
  assert.equal(verifyReleaseInputs(input).ok, false);
});

test('DATA-T1-META-09 mutant ACK trước callback bị DATA-T1-ACK bắt', () => {
  nodeMutation('MUT-ACK-EARLY', modules + '/station-bridge.js', source => replaceOnce(source,
    'result = await applyCommand(command);',
    "await send('POST', 'commands/' + encodeURIComponent(command.command_id) + '/ack', { status: 'applied', applied_t_sim: 0 }, held.capability);\n      result = await applyCommand(command);"),
  suite, 'DATA-T1-ACK bridge giữ pending', [expectedNames[6]], [[expectedNames[6], /Gửi thành công không phải ACK/]]);
});

test('DATA-T1-META-10 mutant bỏ guard ACK trước dequeue bị DATA-T1-ACK bắt', () => {
  nodeMutation('MUT-ACK-NO-DEQUEUE', modules + '/public-routes.js', source => replaceOnce(source,
    "if (!command.delivered) fail(409, 'CONFLICT', 'Trạm chưa nhận lệnh');", '// MUT-ACK-NO-DEQUEUE'),
  suite, 'DATA-T1-ACK chưa dequeue', [expectedNames[11]], [[expectedNames[11], /ACK giả trước dequeue không được applied/]]);
});

test('DATA-T1-META-11 mutant dequeue replay bị DATA-T1-ACK bắt', () => {
  nodeMutation('MUT-DEQUEUE-REPLAY', modules + '/public-routes.js', source => replaceOnce(source,
    "command.status !== 'pending' || command.delivered || command.generation", "command.status !== 'pending' || command.generation"),
  suite, 'DATA-T1-ACK chưa dequeue', [expectedNames[11]], [[expectedNames[11], /Dequeue không phát cùng command hai lần/]]);
});

test('DATA-T1-META-12 mutant BroadcastChannel trước complete bị DATA-T1-TRANSACTION bắt', () => {
  nodeMutation('MUT-TX-EVENT-EARLY', modules + '/public-store.js', source => replaceOnce(source,
    "await tx.put('meta', meta); await tx.put('events', entry); events.push(entry);",
    "await tx.put('meta', meta); await tx.put('events', entry); events.push(entry);\n          const early = new BroadcastChannel('smtf-public-demo-v1'); early.postMessage({ id: entry.id }); early.close();"),
  suite, 'DATA-T1-TRANSACTION writer', [expectedNames[14]], [[expectedNames[14], /Broadcast chỉ sau transaction.complete/]]);
});

test('DATA-T1-META-13 mutant resolve trước complete phải bị DATA-T1-TRANSACTION bắt', () => {
  nodeMutation('MUT-TX-RESOLVE-EARLY', modules + '/public-store.js', source => replaceOnce(source,
    'result = await operation(tx);', 'result = await operation(tx);\n        resolve(result); // MUT-TX-RESOLVE-EARLY'),
  suite, 'DATA-T1-TRANSACTION writer', [expectedNames[14]], [[expectedNames[14], /Broadcast chỉ sau transaction.complete/]]);
});

test('DATA-T1-META-14 mutant bỏ epoch guard renew cũ bị hai thứ tự stop/start bắt', () => {
  nodeMutation('MUT-RENEW-EPOCH', modules + '/station-bridge.js', source => replaceOnce(source,
    'if (stopped || epoch !== version || lease?.capability !== held.capability) return;', '// MUT-RENEW-EPOCH: nhận response lifecycle cũ'),
  suite, 'DATA-T1-ACK bridge stop/start', expectedNames.slice(7, 9), [
    [expectedNames[7], /Start mới phải claim lại/],
    [expectedNames[8], /Lifecycle cũ không được tiếp tục|restart-capability-1/],
  ]);
});

test('DATA-T1-META-16 khóa đúng 5 tên Node và 6 ID Pytest review sạch', () => {
  const node = nodeSubject('review-node-clean', review);
  assertCounts(node, 5);
  assertInventory(node.stdout, reviewNames);
  cleanReviewTap = node.stdout;
  const py = pytest('review-py-clean');
  assertCounts(py, 6);
  assertPyInventory(py.xml);
  cleanReviewXml = py.xml;
});

test('DATA-T1-META-17 runner và inventory review chặn thiếu ca, skip, zero và báo cáo sai', () => {
  assert.ok(cleanReviewTap);
  assert.ok(cleanReviewXml);
  const reviewIds = ['DATA-T1-R3', 'DATA-T1-R4', 'DATA-T1-R5', 'DATA-T1-R6'];
  expectReason(replay('review-node-missing-id', cleanReviewTap.replaceAll('DATA-T1-R3', 'REMOVED-R3'),
    { requiredCases: reviewIds }), 'FAIL', 'missing-test-ids');
  const duplicate = replay('review-node-duplicate', cleanReviewTap.replaceAll(reviewNames[2], reviewNames[1]),
    { requiredCases: reviewIds });
  expectReason(duplicate, 'PASS', 'tests-passed');
  assert.throws(() => assertInventory(duplicate.stdout, reviewNames), /inventory/);

  for (const [name, source, reason, status = 'FAIL'] of [
    ['skip', 'import pytest\n@pytest.mark.skip(reason="meta")\ndef test_skip(): pass\n', 'incomplete-tests'],
    ['zero', 'VALUE = 42\n', 'exit-code'],
    ['assert', 'def test_fail(): assert 3 == 4, "META-JUNIT-ASSERT"\n', 'exit-code'],
  ]) {
    const fixture = join(directory('review-py-' + name), 'test_fixture.py');
    writeFileSync(fixture, source, 'utf8');
    const py = pytest('review-py-' + name, { fixture });
    expectReason(py, status, reason);
    if (name === 'zero') assert.match(py.result.message, /mã 5\./);
    if (name === 'assert') {
      assert.match(py.result.message, /mã 1\./);
      assert.match(py.stdout, /META-JUNIT-ASSERT/);
    }
  }

  for (const [name, xml, status, reason] of [
    ['missing-entry', cleanReviewXml.replace(/<testcase\s+[^>]+\/>/, ''), 'BLOCKED', 'invalid-report'],
    ['wrong-id', cleanReviewXml.replace(reviewPyNames[5], reviewPyNames[4]), 'PASS', 'tests-passed'],
    ['truncated', cleanReviewXml.slice(0, -15), 'BLOCKED', 'invalid-report'],
    ['no-report', null, 'BLOCKED', 'invalid-report'],
  ]) {
    const label = 'review-junit-' + name;
    const reportPath = join(directory(label), 'junit.xml');
    const args = xml === null ? ['-e', ''] : ['-e', 'const fs = require("node:fs"); fs.copyFileSync(process.argv[1], process.argv[2]);',
      join(directory(label), 'input.xml'), reportPath];
    if (xml !== null) writeFileSync(args[2], xml, 'utf8');
    const actual = check(label, { args, reporter: 'junit', reportPath });
    expectReason(actual, status, reason);
    if (name === 'wrong-id') assert.throws(() => assertPyInventory(readFileSync(reportPath, 'utf8')), /đúng từng ID/);
  }
});

test('DATA-T1-META-18 quyền lease phải được kiểm lại khi nguồn trạm đổi', () => {
  const path = backend + '/app/ws.py';
  pyMutation('MUT-LEASE-OLD-SOURCE', path, source => replaceOnce(source.replace(/\r\n/g, '\n'),
    "            _guard_station(claims)\n            await broadcast(event, payload.get('data', {}),",
    "            # MUT-LEASE-OLD-SOURCE: chỉ kiểm tại auth, bỏ kiểm lại ở inbound.\n            await broadcast(event, payload.get('data', {}),"),
  reviewPyNames[1], /assert seen == \['current'\]/);
});

test('DATA-T1-META-19 slash và literal %2F không gộp khi đọc/ACK', () => {
  nodeMutation('MUT-ID-DECODE-TWICE', modules + '/public-routes.js', source => replaceOnce(source,
    'try { return decodeURIComponent(segment); }',
    'try {\n    const decoded = decodeURIComponent(segment);\n    return /%2F/i.test(decoded) ? decodeURIComponent(decoded) : decoded;\n  }'),
  review, '^DATA-T1-R3', [reviewNames[0]], [[reviewNames[0], /GET\/ACK phải giải mã đúng một lần/]]);
});

test('DATA-T1-META-20 TTL override phải tính từ ACK thay vì enqueue', () => {
  nodeMutation('MUT-TTL-ENQUEUE', modules + '/public-routes.js', source => replaceOnce(source,
    'state.value.overrides.push({ ...data, until_at: utc(Date.now() + data.duration_s * 1000),',
    'state.value.overrides.push({ ...data, until_at: command.compatible.until_at,'),
  review, 'TTL 1 giây', [reviewNames[2]], [[reviewNames[2], /Override phải có hiệu lực sau ACK trễ hơn 1 giây/]]);
});

test('DATA-T1-META-21 frame phải tăng snapshot revision', () => {
  pyMutation('MUT-FRAME-REVISION', backend + '/app/routers/station.py', source => replaceOnce(source.replace(/\r\n/g, '\n'),
    "snapshots.put_state(conn, 'snapshot', value)\n            events.append(snapshots.snapshot_event(conn))\n    FRAMES[cam]",
    "snapshots.put_state(conn, 'snapshot', value)\n            # Không tăng revision hoặc phát snapshot.updated.\n    FRAMES[cam]"),
  reviewPyNames[5], /assert \{'new_revision': after\['revision'\] > before\['revision'\]/);
});

test('DATA-T1-META-15 khôi phục cuối và chạy lại đủ 18+5+6 ca sạch', () => {
  git('diff', 'HEAD', '--exit-code', '--', ...sourcePaths);
  for (const path of sourcePaths) {
    assert.equal(digest(readFileSync(join(root, path))), digest(initialBytes.get(path)), path);
    if (path !== suite && path !== review) assert.equal(digest(readFileSync(join(subject, path))), digest(initialBytes.get(path)), path);
  }
  const clean = primary('primary-final');
  assertCounts(clean, 18);
  assertInventory(clean.stdout);
  const node = nodeSubject('review-node-final', review);
  assertCounts(node, 5);
  assertInventory(node.stdout, reviewNames);
  const py = pytest('review-py-final');
  assertCounts(py, 6);
  assertPyInventory(py.xml);
});
