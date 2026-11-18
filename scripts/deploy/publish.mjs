import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { digest, verifyArtifacts } from './artifacts.mjs';

const requiredChecks = [
  'GATE-RELEASE-INPUTS', 'AGENT-PREFLIGHT', 'GATE-META', 'GATE-CROSS', 'SIM-REGRESSION',
  'WEB-TYPECHECK', 'WEB-TEST', 'WEB-BUILD', 'API-REGRESSION', 'PUB-01', 'DATA-01',
  'SIM-01', 'SIM-A1', 'AI-01', 'CAM-01', 'USER-01', 'PERF-01', 'DOCKER-01',
];

function main() {
  const { values } = parseArgs({
    options: {
      manifest: { type: 'string' }, report: { type: 'string' },
      'pages-project': { type: 'string' }, 'wrangler-cli': { type: 'string' },
      'vercel-cli': { type: 'string' }, 'verify-only': { type: 'boolean' },
    },
  });
  if (!values.manifest || !values.report) throw new Error('Cần --manifest và --report của lượt hardtest release.');
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
  const commit = git('rev-parse', 'HEAD');
  const contractDigest = digest(readFileSync(join(git('rev-parse', '--show-toplevel'), 'docs/agent/CONTRACT-PUBLIC-DEMO.md')));
  const manifestPath = resolve(values.manifest);
  const bytes = readFileSync(manifestPath);
  const manifest = JSON.parse(bytes);
  const report = JSON.parse(readFileSync(values.report, 'utf8'));
  if (manifest.schemaVersion !== 1 || manifest.commit !== commit || manifest.contractDigest !== contractDigest
    || report.schemaVersion !== 1 || report.profile !== 'release' || report.ok !== true || report.worktreeDirty !== false
    || report.commit !== commit || report.contractDigest !== contractDigest || report.releaseManifestDigest !== digest(bytes)
    || !Array.isArray(report.checks) || report.checks.some(check => check.status !== 'PASS')
    || new Set(report.checks.map(check => check.id)).size !== report.checks.length
    || requiredChecks.some(id => !report.checks.some(check => check.id === id))) {
    throw new Error('Báo cáo release thiếu bằng chứng hoặc khác commit, hợp đồng hay manifest.');
  }
  const vercel = join(dirname(manifestPath), 'vercel');
  const pages = join(dirname(manifestPath), 'pages');
  verifyArtifacts(manifest, { vercel, pages });
  console.log(`Đã xác minh artifact tại ${commit.slice(0, 12)}.`);
  if (values['verify-only']) return;

  if (git('branch', '--show-current') !== 'codex/public-demo-release'
    || git('status', '--porcelain=v1', '--untracked-files=normal')) {
    throw new Error('Chỉ phát hành từ worktree sạch của nhánh codex/public-demo-release.');
  }
  const project = values['pages-project'];
  const branch = `release-${commit.slice(0, 12)}`;
  if (!project || !/^[a-z\d][a-z\d-]{1,57}$/.test(project) || manifest.pagesOrigin !== `https://${branch}.${project}.pages.dev`) {
    throw new Error('Tên dự án Cloudflare Pages phải khớp origin đã ghim.');
  }
  if (!values['wrangler-cli'] || !values['vercel-cli'] || !process.env.VERCEL_PROJECT_ID || !process.env.VERCEL_ORG_ID) {
    throw new Error('Cần đường dẫn CLI Wrangler/Vercel và cấu hình dự án Vercel trước khi phát hành.');
  }
  const wranglerCli = resolve(values['wrangler-cli']);
  const vercelCli = resolve(values['vercel-cli']);
  readFileSync(wranglerCli);
  readFileSync(vercelCli);
  execFileSync(process.execPath, [wranglerCli, 'pages', 'deploy', pages, '--project-name', project, '--branch', branch,
    '--commit-hash', commit], { stdio: 'inherit' });
  execFileSync(process.execPath, [vercelCli, 'deploy', vercel, '--yes', '--prod'], { stdio: 'inherit', cwd: vercel });
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
