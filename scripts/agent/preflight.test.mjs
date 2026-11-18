import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const preflight = fileURLToPath(new URL('./preflight.mjs', import.meta.url));
const context = fileURLToPath(new URL('./context.mjs', import.meta.url));

function setup(t) {
  const cwd = mkdtempSync(join(tmpdir(), 'smtf-preflight-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
  const put = (path, contents) => {
    mkdirSync(dirname(join(cwd, path)), { recursive: true });
    writeFileSync(join(cwd, path), contents, 'utf8');
  };
  git('init', '-q', '-b', 'codex/public-demo-ui');
  git('config', 'user.name', 'SMTF Test');
  git('config', 'user.email', 'test@example.invalid');
  git('config', 'core.autocrlf', 'false');
  put('.gitignore', 'work/smtf-agent/\n');
  put('AGENTS.md', '# Quy tắc\n');
  put('docs/agent/HANDOFF.md', '# Bàn giao\n');
  put('docs/agent/RULES.md', '# Quy tắc bàn giao\n');
  put('docs/agent/CONTRACT-PUBLIC-DEMO.md', '# Hợp đồng\n');
  put('docs/agent/PUBLIC-DEMO-SPEC.md', '# Đặc tả\n\n## UI-01\nCó thể điều khiển bằng bàn phím.\n\n## UI-02\nGóc nhìn.\n');
  put('ui/index.html', '<main></main>');
  git('add', '--', '.gitignore', 'AGENTS.md', 'docs', 'ui');
  git('commit', '-qm', 'base');
  const baseSha = git('rev-parse', 'HEAD');
  const brief = {
    task: 'UI-01', role: 'code', branch: 'codex/public-demo-ui', worktree: cwd,
    baseSha, specVersion: 'public-demo-v1', requirements: ['UI-01'],
    writablePaths: ['ui/'], round: 0,
  };
  const putBrief = () => put('work/smtf-agent/briefs/UI-01.json', JSON.stringify(brief));
  putBrief();
  const run = (...args) => spawnSync(process.execPath, [preflight, '--task', 'UI-01', '--role', 'code', ...args], { cwd, encoding: 'utf8' });
  const receiptPath = 'work/smtf-agent/receipts/UI-01.code.json';
  const resultPath = 'work/smtf-agent/results/UI-01.code.json';
  return { cwd, git, put, brief, putBrief, run, receiptPath, resultPath };
}

test('chuẩn bị đúng nhánh, trích tiêu chí đã giao, lưu hash và xác minh bàn giao', t => {
  const { cwd, git, put, brief, run, receiptPath, resultPath } = setup(t);
  const prepared = run();
  assert.equal(prepared.status, 0, prepared.stderr);
  assert.match(prepared.stdout, /bàn phím/);
  const receipt = JSON.parse(readFileSync(join(cwd, receiptPath), 'utf8'));
  assert.equal(receipt.baseSha, brief.baseSha);
  assert.ok(receipt.reads.every(doc => /^[a-f\d]{64}$/.test(doc.sha256)));
  put('ui/index.html', '<main><button>Quay lại</button></main>');
  git('add', '--', 'ui/index.html');
  git('commit', '-qm', 'ui');
  put(resultPath, JSON.stringify({
    task: brief.task, role: brief.role, baseSha: brief.baseSha, commit: git('rev-parse', 'HEAD'),
    receiptSha256: receipt.digest, status: 'ready',
    ready: { requirements: ['UI-01'], edgeCase: 'Chuyển bằng Tab', firstCheck: 'node --test' },
    checks: [{ command: 'node --test', exitCode: 0 }], summary: 'Đã nối nút bàn phím.',
    remaining: [], next: 'Review test.',
  }));
  const verified = run('--verify', '--result', resultPath);
  assert.equal(verified.status, 0, verified.stderr);
  // Sửa ngoài phạm vi phải bị chặn, kể cả trước khi stash hoặc commit.
  put('docs/agent/HANDOFF.md', 'thay đổi ngoài phạm vi');
  assert.notEqual(run('--verify', '--result', resultPath).status, 0);
});

test('từ chối worktree, SHA, nhánh và vai trò sai', t => {
  const { brief, putBrief, run } = setup(t);
  const defaults = { ...brief };
  for (const patch of [
    { worktree: tmpdir() }, { branch: 'main' }, { baseSha: '0'.repeat(defaults.baseSha.length) }, { role: 'hardtest' },
  ]) {
    Object.assign(brief, defaults, patch);
    putBrief();
    assert.notEqual(run().status, 0);
  }
});

test('từ chối commit có tệp nằm ngoài phần được giao và bàn giao thiếu READY', t => {
  const { cwd, git, put, brief, run, receiptPath, resultPath } = setup(t);
  assert.equal(run().status, 0);
  const receipt = JSON.parse(readFileSync(join(cwd, receiptPath), 'utf8'));
  put('loi.txt', 'ngoài phạm vi');
  git('add', '--', 'loi.txt');
  git('commit', '-qm', 'ngoai pham vi');
  const report = {
    task: brief.task, role: brief.role, baseSha: brief.baseSha, commit: git('rev-parse', 'HEAD'),
    receiptSha256: receipt.digest, status: 'ready',
    checks: [{ command: 'node --test', exitCode: 0 }], summary: 'Đã sửa.', remaining: [], next: 'Review.',
  };
  put(resultPath, JSON.stringify(report));
  assert.match(run('--verify', '--result', resultPath).stderr, /Thiếu READY/);
  report.ready = { requirements: ['UI-01'], edgeCase: 'Không có chuột', firstCheck: 'node --test' };
  put(resultPath, JSON.stringify(report));
  assert.match(run('--verify', '--result', resultPath).stderr, /Ngoài phạm vi brief: loi\.txt/);
});

test('resume giữ SHA bắt đầu và cảnh báo lại ở mỗi hook', t => {
  const { cwd, git, put, run, receiptPath } = setup(t);
  assert.equal(run().status, 0);
  const original = readFileSync(join(cwd, receiptPath), 'utf8');
  put('ui/index.html', '<main>Khôi phục</main>');
  git('add', '--', 'ui/index.html');
  git('commit', '-qm', 'resume');
  assert.equal(run().status, 0);
  assert.equal(readFileSync(join(cwd, receiptPath), 'utf8'), original);
  for (const [hook_event_name, source] of [['SessionStart', 'startup'], ['SessionStart', 'resume'], ['SessionStart', 'compact'], ['SubagentStart']]) {
    const hook = spawnSync(process.execPath, [context], { cwd, input: JSON.stringify({ cwd, hook_event_name, source }), encoding: 'utf8' });
    assert.equal(hook.status, 0, hook.stderr);
    const output = JSON.parse(hook.stdout).hookSpecificOutput;
    assert.equal(output.hookEventName, hook_event_name);
    assert.match(output.additionalContext, /preflight\.mjs/);
    assert.match(output.additionalContext, /HANDOFF\.md/);
  }
});
