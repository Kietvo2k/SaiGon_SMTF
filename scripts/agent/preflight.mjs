import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const specPath = 'docs/agent/PUBLIC-DEMO-SPEC.md';
const requiredReads = ['AGENTS.md', 'docs/agent/RULES.md', 'docs/agent/HANDOFF.md', 'docs/agent/CONTRACT-PUBLIC-DEMO.md', specPath];
const stateDir = 'work/smtf-agent';
const statusList = ['ready', 'blocked', 'failed'];
const roleList = ['coordinator', 'planner', 'code', 'hardtest', 'meta', 'cross', 'review', 'browser-qa'];
const sha256 = value => createHash('sha256').update(value).digest('hex');
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const notEmpty = value => typeof value === 'string' && value.trim().length > 0;
const stringList = value => Array.isArray(value) && value.every(notEmpty);
const hash = value => typeof value === 'string' && /^[\da-f]{40}(?:[\da-f]{24})?$/.test(value);
const id = value => typeof value === 'string' && /^[A-Z\d][A-Z\d-]{0,63}$/.test(value);

function ensure(condition, message) {
  if (!condition) throw new Error(message);
}

function repoPath(root, name) {
  ensure(typeof name === 'string' && /^[\w./-]+$/.test(name) && !isAbsolute(name)
    && !name.split('/').some(part => part === '.' || part === '..' || part === '.git'), 'Đường dẫn project không hợp lệ.');
  const path = resolve(root, name);
  // Kiểm junction/symlink của cả tệp đã có và thư mục cha của tệp sắp tạo.
  let anchor = path;
  while (!existsSync(anchor)) anchor = dirname(anchor);
  const reach = relative(root, realpathSync(anchor));
  ensure(!isAbsolute(reach) && !/^\.\.(?:[\\/]|$)/.test(reach), 'Đường dẫn trỏ ra ngoài worktree.');
  return path;
}

function requirementText(spec, code) {
  const headings = [...spec.matchAll(/^(#{2,5})\s+([^\r\n]+)$/gm)];
  const position = headings.findIndex(heading => new RegExp(`^\\[?${code}(?:\\]|[\\s:–—.]|$)`).test(heading[2]));
  ensure(position !== -1, `Đặc tả thiếu mục ${code}.`);
  const start = headings[position];
  const end = headings.slice(position + 1).find(heading => heading[1].length <= start[1].length);
  return spec.slice(start.index, end?.index).trimEnd();
}

function verifyReport(root, reportPath, receipt, brief, head) {
  ensure(reportPath.startsWith(`${stateDir}/results/`), 'Đặt JSON bàn giao trong work/smtf-agent/results/.');
  const report = JSON.parse(readFileSync(repoPath(root, reportPath), 'utf8'));
  for (const key of ['task', 'role', 'baseSha']) {
    ensure(report[key] === brief[key], `Bàn giao sai ${key}.`);
  }
  ensure(report.commit === head && report.receiptSha256 === receipt.digest, 'Bàn giao phải gắn HEAD và biên nhận hiện hành.');
  ensure(statusList.includes(report.status) && notEmpty(report.summary) && notEmpty(report.next)
    && stringList(report.remaining), 'Bàn giao thiếu trạng thái, nội dung, việc còn lại hoặc bước tiếp.');
  const ready = report.ready;
  ensure(stringList(ready?.requirements) && ready.requirements.length === brief.requirements.length
    && brief.requirements.every(code => ready.requirements.includes(code))
    && notEmpty(ready.edgeCase) && notEmpty(ready.firstCheck), 'Thiếu READY đúng các mã yêu cầu, ca biên và lệnh kiểm.');
  ensure(Array.isArray(report.checks) && report.checks.every(check => notEmpty(check?.command)
    && (Number.isInteger(check.exitCode) || check.exitCode === null)), 'Bàn giao thiếu kết quả lệnh kiểm.');
  if (report.status === 'ready') {
    ensure(report.checks.length && report.checks.every(check => check.exitCode === 0),
      'Trạng thái ready yêu cầu có lệnh kiểm và tất cả đều thành công.');
  }
  const trackedChanges = git('status', '--porcelain=v1', '--untracked-files=no').trim();
  ensure(!trackedChanges, 'Bàn giao yêu cầu commit hết các tệp tracked đã sửa.');
  const changed = git('diff', '--name-only', '--no-renames', '-z', receipt.startSha, head, '--').split('\0').filter(Boolean);
  const untracked = git('ls-files', '--others', '--exclude-standard', '-z').split('\0').filter(Boolean);
  const outside = changed.filter(file => !brief.writablePaths.some(allowed =>
    allowed.endsWith('/') ? file.startsWith(allowed) : file === allowed));
  ensure(!outside.length, `Ngoài phạm vi brief: ${outside.join(', ')}.`);
  const added = untracked.filter(file => !receipt.untracked.includes(file));
  ensure(!added.length, `Tệp mới chưa bàn giao: ${added.join(', ')}.`);
  console.log(`Đã đối chiếu ${brief.task}/${brief.role} tại ${head.slice(0, 12)}. Trạng thái: ${report.status}.`);
  if (report.status !== 'ready') process.exitCode = 1;
}

function main() {
  const { values } = parseArgs({
    options: { task: { type: 'string' }, role: { type: 'string' }, verify: { type: 'boolean' }, result: { type: 'string' } },
  });
  const { task, role, verify, result } = values;
  ensure(id(task) && roleList.includes(role) && Boolean(verify) === Boolean(result),
    'Cách dùng: preflight.mjs --task <ID> --role <vai-trò> [--verify --result <JSON>].');
  const root = realpathSync(git('rev-parse', '--show-toplevel').trim());
  const head = git('rev-parse', 'HEAD').trim();
  const branch = git('branch', '--show-current').trim();
  const briefBytes = readFileSync(repoPath(root, `${stateDir}/briefs/${task}.json`));
  const brief = JSON.parse(briefBytes);
  ensure(brief.task === task && brief.role === role, 'ID hoặc vai trò không khớp brief.');
  ensure(branch && brief.branch === branch && notEmpty(brief.worktree) && relative(root, realpathSync(brief.worktree)) === '',
    'Sai nhánh hoặc worktree của brief.');
  ensure(hash(brief.baseSha) && spawnSync('git', ['merge-base', '--is-ancestor', brief.baseSha, head], { cwd: root }).status === 0,
    'SHA nền phải là tổ tiên của HEAD.');
  ensure(brief.specVersion === 'public-demo-v1' && Number.isInteger(brief.round) && brief.round >= 0 && brief.round <= 2
    && stringList(brief.requirements) && brief.requirements.length > 0 && brief.requirements.every(id)
    && new Set(brief.requirements).size === brief.requirements.length
    && stringList(brief.writablePaths) && stringList(brief.requiredReads ?? []), 'Brief thiếu phiên bản, yêu cầu, vòng sửa hoặc phạm vi.');
  if (['planner', 'review', 'browser-qa'].includes(role)) ensure(brief.writablePaths.length === 0, 'Vai trò chỉ đọc phải có phạm vi ghi trống.');
  for (const name of brief.writablePaths) repoPath(root, name);

  const docs = [...new Set([...requiredReads, ...(brief.requiredReads ?? [])])].map(path => {
    const bytes = readFileSync(repoPath(root, path));
    return { path, sha256: sha256(bytes), text: bytes.toString('utf8') };
  });
  const invariant = {
    task, role, branch, worktree: root, baseSha: brief.baseSha, briefSha256: sha256(briefBytes),
    reads: docs.map(({ path, sha256 }) => ({ path, sha256 })),
  };
  const receiptPath = repoPath(root, `${stateDir}/receipts/${task}.${role}.json`);
  let receipt;
  if (existsSync(receiptPath)) {
    receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
    const { digest, ...claimed } = receipt;
    ensure(sha256(JSON.stringify(claimed)) === digest, 'Biên nhận không hợp lệ.');
    for (const [key, value] of Object.entries(invariant)) {
      ensure(JSON.stringify(receipt[key]) === JSON.stringify(value), `Biên nhận cũ hoặc khác brief (${key}).`);
    }
    ensure(hash(receipt.startSha) && spawnSync('git', ['merge-base', '--is-ancestor', receipt.startSha, head], { cwd: root }).status === 0,
      'HEAD không tiếp nối SHA bắt đầu.');
  } else {
    ensure(!verify, 'Thiếu biên nhận. Chạy preflight trước khi sửa.');
    ensure(!git('status', '--porcelain=v1', '--untracked-files=no').trim(), 'Bắt đầu từ worktree không có thay đổi tracked.');
    const unsigned = { ...invariant, startSha: head, untracked: git('ls-files', '--others', '--exclude-standard', '-z').split('\0').filter(Boolean) };
    receipt = { ...unsigned, digest: sha256(JSON.stringify(unsigned)) };
  }
  if (verify) return verifyReport(root, result, receipt, brief, head);

  // Xác minh tất cả mục trước khi ghi biên nhận cho lần đọc này.
  const sections = brief.requirements.map(code => requirementText(docs.find(doc => doc.path === specPath).text, code));
  mkdirSync(dirname(receiptPath), { recursive: true });
  if (!existsSync(receiptPath)) writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  for (const doc of docs) {
    console.log(`\n--- ${doc.path} · ${doc.sha256} ---\n${doc.path === specPath ? sections.join('\n\n') : doc.text}`);
  }
  console.log(`\nVòng ${brief.round}/2 · ${task}/${role} · Phạm vi: ${brief.writablePaths.join(', ') || 'chỉ đọc'}\nBiên nhận: ${receipt.digest}`);
}

try {
  main();
} catch (error) {
  console.error(`Preflight: ${error.message}`);
  process.exitCode = 1;
}
