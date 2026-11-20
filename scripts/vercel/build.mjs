import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = realpathSync(fileURLToPath(new URL('../../', import.meta.url)));
const city = 'outputs/hcmc-poc';
const north = `${city}/data/public-north`;
const northSeed = 'outputs/smart-traffic/backend/app/seed/public-north';
const web = 'outputs/smart-traffic/web';
const manifestName = 'artifact-manifest.json';
const outRoot = join(root, 'dist', 'public-demo');
mkdirSync(outRoot, { recursive: true });
if (realpathSync(outRoot) !== outRoot) throw new Error('Thư mục build phải nằm trực tiếp trong worktree.');

const out = join(outRoot, 'vercel');
const stage = mkdtempSync(join(outRoot, '.vercel-stage-'));
const sourceFiles = new Map();
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const read = path => {
  const bytes = readFileSync(join(root, path));
  sourceFiles.set(path, { path, bytes: bytes.length, sha256: sha256(bytes) });
  return bytes;
};
const write = (path, bytes) => {
  const dest = join(stage, path);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, bytes);
};
const copy = (path, target) => write(target, read(path));
const slash = path => path.split(sep).join('/');
const list = (base, top = base) => readdirSync(base, { withFileTypes: true })
  .sort((a, b) => a.name.localeCompare(b.name, 'en'))
  .flatMap(entry => {
    const path = join(base, entry.name);
    if (entry.isDirectory()) return list(path, top);
    if (!entry.isFile()) throw new Error(`Mục không hợp lệ trong artifact: ${entry.name}`);
    return [slash(relative(top, path))];
  });

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Lệnh build thất bại (exit ${result.status}).`);
  return result.stdout?.trim();
}

try {
  const commit = process.env.VERCEL_GIT_COMMIT_SHA || process.env.SMTF_BUILD_SHA || run('git', ['rev-parse', 'HEAD']);
  if (!/^[0-9a-f]{40}$/u.test(commit)) throw new Error('Cần SHA đầy đủ của commit để tạo manifest.');

  // Vite ghép landing của UI khi có, còn mốc xem sớm dùng trang chọn sẵn của Docker.
  run(process.execPath, [join(root, web, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--outDir', stage, '--emptyOutDir'], {
    cwd: join(root, web),
    env: { ...process.env, SMTF_VERCEL_SUBMIT: '1', VITE_SMTF_SUBMIT: '1' },
    stdio: 'inherit'
  });
  const landing = existsSync(join(stage, 'index.html')) ? 'vite' : 'docker';
  if (landing === 'docker') copy('docker/index.html', 'index.html');
  for (const file of ['index.html', 'index-officer.html', 'index-citizen.html']) {
    const page = readFileSync(join(stage, file), 'utf8');
    if (!/<link\s+[^>]*\brel=['"]icon['"]/i.test(page)) {
      write(file, page.replace(/<meta\s+charset=[^>]*>/i, '$&\n  <link rel="icon" href="data:,">'));
    }
  }

  const northManifest = JSON.parse(read(`${north}/manifest.json`));
  const pinnedRuntime = [
    ...['road-graph.json', 'scene.json', 'runtime-sidecars.json', 'heat-history-32.json'].map(file => [`${north}/${file}`, `hcmc-poc/data/public-north/${file}`]),
    ...['node_map.json', 'cameras.json'].map(file => [`${northSeed}/${file}`, `smart-traffic/backend/app/seed/public-north/${file}`])
  ];
  if (northManifest.region !== 'bac' || northManifest.stats.junctions !== 10) throw new Error('Manifest Bắc không có đúng 10 giao lộ.');
  for (const [source, target] of pinnedRuntime) {
    const bytes = read(source);
    const pin = northManifest.files.find(file => file.path === source);
    if (pin?.sha256 !== sha256(bytes) || pin.bytes !== bytes.length) throw new Error(`Tệp Bắc sai SHA-256: ${source}.`);
    write(target, bytes);
  }

  const cityFiles = readdirSync(join(root, city)).filter(file =>
    file.endsWith('.js') && !['flood-ui-25.js', 'webgpu-entry-24.js', 'webgpu-materials-24.js', 'submit-hud.js'].includes(file)
  );
  for (const file of [...cityFiles, 'webgpu-materials-24.css', 'data/sentinel-2016-lite.jpg', 'data/sentinel-2016.jpg',
    'data/imagery-source.json', 'data/venice_sunset_1k.hdr', 'public-submit/entry.mjs']) {
    copy(`${city}/${file}`, `hcmc-poc/${file}`);
  }
  // demo-v2: giữ NGUYÊN VẸN vỏ trạm smart (installStation32 + HUD + heat + forecast + scenarios + inspector).
  // Trạm ở chế độ transport=public dùng kho IndexedDB same-origin (không cần backend);
  // đẩy khung sống theo hợp đồng do submit-frame-32.js đảm nhiệm (POST /api/demo/frame, 1 khung/3 s).
  const runtimeFile = 'webgpu-materials-24.js';
  const runtime = read(`${city}/${runtimeFile}`).toString('utf8');
  const stationCall = 'smartMod.installStation32(smartApp,{cameras,nodeMap:smartPrep.nodeMap});';
  if (!runtime.includes(stationCall)) throw new Error('Không tìm thấy điểm khởi tạo trạm trong runtime.');
  write(`hcmc-poc/${runtimeFile}`, runtime);

  const submitHud = ['submit-hud.css', 'submit-hud.js'].every(file => existsSync(join(root, city, file)));
  if (submitHud) {
    for (const file of ['submit-hud.css', 'submit-hud.js']) copy(`${city}/${file}`, `hcmc-poc/${file}`);
  }
  for (const [source, target] of [[`${city}/vendor`, 'hcmc-poc/vendor'], ['outputs/shared/public-demo', 'shared/public-demo']]) {
    for (const file of list(join(root, source)).filter(file => !file.endsWith('.d.ts'))) {
      copy(`${source}/${file}`, `${target}/${file}`);
    }
  }

  const html = read(`${city}/webgpu-materials-24.html`).toString('utf8');
  const scriptsAt = html.indexOf('<script src="vendor/earcut.min.js">');
  if (scriptsAt < 0) throw new Error('Không tìm thấy điểm nạp mô phỏng khu Bắc.');
  const publicHtml = html.slice(0, scriptsAt)
    .replace('</head>', submitHud ? '  <link rel="stylesheet" href="submit-hud.css">\n</head>' : '</head>')
    .replace(/<aside id="floodLab"[\s\S]*?<\/aside>/u, '')
    .replace(/<div id="iocAlertBar"[\s\S]*?<\/div>\s*<\/div>/u, '')
    .replace(/<canvas id="rainFx"[^>]*><\/canvas>/u, '')
    .replace(/<button\b[^>]*data-open-flood[^>]*>[\s\S]*?<\/button>/gu, '');
  write('hcmc-poc/index.html', `${publicHtml}<script src="vendor/earcut.min.js"></script>
  <script>window.SMtfBuildId = '${commit}';</script>
  <script type="module" src="public-submit/entry.mjs"${submitHud ? ' data-submit-hud' : ''}></script>
</body>
</html>
`);

  const routes = ['/', '/hcmc-poc/', '/index-officer.html', '/index-citizen.html'];
  for (const file of ['index.html', 'hcmc-poc/index.html', 'index-officer.html', 'index-citizen.html']) {
    if (!existsSync(join(stage, file))) throw new Error(`Thiếu trang bắt buộc: ${file}.`);
  }
  const files = list(stage).map(path => {
    const bytes = readFileSync(join(stage, path));
    return { path, bytes: bytes.length, sha256: sha256(bytes) };
  });
  const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0);
  const manifest = {
    schemaVersion: 1,
    scope: 'vercel-demo-2026-11-20',
    commit,
    region: northManifest.region,
    attribution: northManifest.attribution,
    northStats: northManifest.stats,
    landing,
    submitHud,
    routes,
    totalBytes,
    files,
    sourceFiles: [...sourceFiles.values()].sort((a, b) => a.path.localeCompare(b.path, 'en'))
  };
  write(manifestName, JSON.stringify(manifest, null, 2) + '\n');

  if (existsSync(out)) {
    if (!lstatSync(out).isDirectory() || realpathSync(out) !== out || !existsSync(join(out, manifestName))) {
      throw new Error(`Thư mục đích có dữ liệu ngoài build: ${out}.`);
    }
    rmSync(out, { recursive: true });
  }
  renameSync(stage, out);
  console.log(JSON.stringify({ commit, region: manifest.region, landing, routes, files: files.length, totalBytes, manifest: relative(root, join(out, manifestName)) }));
} finally {
  if (existsSync(stage) && realpathSync(stage) === stage) rmSync(stage, { recursive: true });
}
