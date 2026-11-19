import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { runCheck } from '../checks.mjs';
import { verifyReleaseInputs } from '../evidence.mjs';

// Oracle độc lập: danh mục 18 ca đã được giao, không đọc expected từ helper sản phẩm.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const suite = 'scripts/hardtest/data/data-t1.test.mjs';
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
const startSha = git('rev-parse', 'HEAD');
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
const records = [];
const originals = new Map();
const sourcePaths = ['outputs/shared/public-demo/station-bridge.js', 'outputs/shared/public-demo/public-routes.js', 'outputs/shared/public-demo/public-store.js', suite];
const initialBytes = new Map(sourcePaths.map(path => [path, readFileSync(join(root, path))]));
let cleanTap;

function directory(label) {
  const path = join(outputRoot, label);
  mkdirSync(path, { recursive: true });
  return path;
}

function check(label, options) {
  const outputDir = directory(label);
  const command = { id: label, command: process.execPath, cwd: root, timeoutMs: 90000, ...options };
  const result = runCheck(command, { outputDir });
  const record = {
    label, candidate: startSha, command: command.command, args: command.args,
    result, stdoutSha256: existsSync(join(outputDir, `${label}.stdout.log`)) ? digest(readFileSync(join(outputDir, `${label}.stdout.log`))) : null,
    stderrSha256: existsSync(join(outputDir, `${label}.stderr.log`)) ? digest(readFileSync(join(outputDir, `${label}.stderr.log`))) : null,
  };
  records.push(record);
  writeFileSync(join(outputDir, 'result.json'), JSON.stringify(record, null, 2) + '\n', 'utf8');
  return { result, outputDir, stdout: existsSync(join(outputDir, `${label}.stdout.log`)) ? readFileSync(join(outputDir, `${label}.stdout.log`), 'utf8') : '' };
}

function primary(label, pattern) {
  return check(label, {
    args: ['--test', '--test-reporter=tap', ...(pattern ? ['--test-name-pattern', pattern] : []), suite],
    reporter: 'tap', requiredCases: pattern ? [] : requiredCases,
    env: { DATA_T1_ROOT: root },
  });
}

function assertInventory(tap, names = expectedNames) {
  const actual = [...tap.matchAll(/^ok \d+ - (.+)\r?$/gm)].map(match => match[1].replace(/\r$/, ''));
  assert.deepEqual(actual, names, 'DATA-T1 inventory phải đủ từng ca đúng một lần');
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

async function mutation(label, path, mutate, pattern, count, assertion) {
  assert.ok(cleanTap, 'Phải có baseline sạch trước khi chạy mutant');
  const absolute = join(root, path);
  const bytes = readFileSync(absolute);
  git('diff', '--exit-code', '--', path);
  assert.equal(digest(bytes), digest(initialBytes.get(path)), 'Chỉ đột biến byte sạch đã chụp đầu lượt');
  const backup = directory(label);
  writeFileSync(join(backup, 'original.bin'), bytes);
  originals.set(absolute, bytes);
  let red;
  try {
    const source = bytes.toString('utf8');
    const mutant = mutate(source).replace(/\r?\n/g, source.includes('\r\n') ? '\r\n' : '\n');
    assert.notEqual(mutant, bytes.toString('utf8'));
    writeFileSync(absolute, mutant, 'utf8');
    writeFileSync(join(backup, 'mutant.bin'), readFileSync(absolute));
    writeFileSync(join(backup, 'mutant.diff'), git('diff', '--', path) + '\n', 'utf8');
    red = primary(`${label}-red`, pattern);
  } finally {
    writeFileSync(absolute, bytes);
    assert.equal(digest(readFileSync(absolute)), digest(bytes), 'Phải khôi phục nguyên byte');
    originals.delete(absolute);
  }
  const clean = primary(`${label}-restored`, pattern);
  expectReason(clean, 'PASS', 'tests-passed');
  assert.equal(clean.result.details.total, count, 'Ca sạch đúng inventory con, không skip');
  writeFileSync(join(backup, 'restoration.json'), JSON.stringify({
    candidate: startSha, path, beforeSha256: digest(bytes), afterSha256: digest(readFileSync(absolute)),
    red: red.result, restored: clean.result,
  }, null, 2) + '\n', 'utf8');
  expectReason(red, 'FAIL', 'exit-code');
  assert.match(red.result.message, /mã 1\./, 'Assertion đỏ phải trả exit 1');
  assert.match(red.stdout, /ERR_ASSERTION/, 'Mutant phải chết ở assertion, không do thiếu entry/timeout');
  assert.match(red.stdout, assertion, 'Mutant phải chết đúng invariant đã giao');
  assert.doesNotMatch(red.stdout, /thiếu entry adapter|TimeoutError|testTimeoutFailure/);
}

process.once('exit', () => { for (const [path, bytes] of originals) writeFileSync(path, bytes); });
after(() => {
  assert.equal(originals.size, 0, 'Không để mutant trong worktree');
  writeFileSync(join(outputRoot, 'summary.json'), JSON.stringify({ candidate: startSha, requirements: ['DATA-01', 'USER-01', 'DOCKER-01'], records }, null, 2) + '\n', 'utf8');
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

test('DATA-T1-META-09 mutant ACK trước callback bị DATA-T1-ACK bắt', async () => {
  await mutation('MUT-ACK-EARLY', 'outputs/shared/public-demo/station-bridge.js', source => replaceOnce(source,
    'result = await applyCommand(command);',
    "await send('POST', 'commands/' + encodeURIComponent(command.command_id) + '/ack', { status: 'applied', applied_t_sim: 0 }, held.capability);\n      result = await applyCommand(command);"),
  'DATA-T1-ACK bridge giữ pending', 1, /Gửi thành công không phải ACK/);
});

test('DATA-T1-META-10 mutant bỏ guard ACK trước dequeue bị DATA-T1-ACK bắt', async () => {
  await mutation('MUT-ACK-NO-DEQUEUE', 'outputs/shared/public-demo/public-routes.js', source => replaceOnce(source,
    "if (!command.delivered) fail(409, 'CONFLICT', 'Trạm chưa nhận lệnh');", '// MUT-ACK-NO-DEQUEUE'),
  'DATA-T1-ACK chưa dequeue', 1, /ACK giả trước dequeue không được applied/);
});

test('DATA-T1-META-11 mutant dequeue replay bị DATA-T1-ACK bắt', async () => {
  await mutation('MUT-DEQUEUE-REPLAY', 'outputs/shared/public-demo/public-routes.js', source => replaceOnce(source,
    "command.status !== 'pending' || command.delivered || command.generation", "command.status !== 'pending' || command.generation"),
  'DATA-T1-ACK chưa dequeue', 1, /Dequeue không phát cùng command hai lần/);
});

test('DATA-T1-META-12 mutant BroadcastChannel trước complete bị DATA-T1-TRANSACTION bắt', async () => {
  await mutation('MUT-TX-EVENT-EARLY', 'outputs/shared/public-demo/public-store.js', source => replaceOnce(source,
    "await tx.put('meta', meta); await tx.put('events', entry); events.push(entry);",
    "await tx.put('meta', meta); await tx.put('events', entry); events.push(entry);\n          const early = new BroadcastChannel('smtf-public-demo-v1'); early.postMessage({ id: entry.id }); early.close();"),
  'DATA-T1-TRANSACTION writer', 1, /Broadcast chỉ sau transaction.complete/);
});

test('DATA-T1-META-13 mutant resolve trước complete phải bị DATA-T1-TRANSACTION bắt', async () => {
  await mutation('MUT-TX-RESOLVE-EARLY', 'outputs/shared/public-demo/public-store.js', source => replaceOnce(source,
    'result = await operation(tx);', 'result = await operation(tx);\n        resolve(result); // MUT-TX-RESOLVE-EARLY'),
  'DATA-T1-TRANSACTION', 3, /transaction.complete|STORAGE_UNAVAILABLE|Thao tác phải bị từ chối/);
});

test('DATA-T1-META-14 mutant bỏ epoch guard renew cũ bị hai thứ tự stop/start bắt', async () => {
  await mutation('MUT-RENEW-EPOCH', 'outputs/shared/public-demo/station-bridge.js', source => replaceOnce(source,
    'if (stopped || epoch !== version || lease?.capability !== held.capability) return;', '// MUT-RENEW-EPOCH: nhận response lifecycle cũ'),
  'DATA-T1-ACK bridge stop/start', 2, /Start mới phải claim lại|restart-capability-1|Lifecycle cũ không được tiếp tục/);
});

test('DATA-T1-META-15 khôi phục cuối và chạy lại đủ 18 ca sạch', () => {
  for (const path of sourcePaths) {
    git('diff', '--exit-code', '--', path);
    assert.equal(digest(readFileSync(join(root, path))), digest(initialBytes.get(path)), path);
  }
  const clean = primary('primary-final');
  expectReason(clean, 'PASS', 'tests-passed');
  assert.deepEqual(clean.result.details, { total: 18, passed: 18, incomplete: 0 });
  assertInventory(clean.stdout);
});
