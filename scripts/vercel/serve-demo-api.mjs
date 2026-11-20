// serve-demo-api.mjs — server dev cho nghiệm thu bản nộp demo-v2 trên máy:
// phục tĩnh dist/public-demo/vercel + điều /api/demo/** vào handler serverless api/demo/[route].mjs.
// Cách chạy: node --env-file=.env.local scripts/vercel/serve-demo-api.mjs [port]
// Chỉ dùng trên máy dev; production dùng Vercel Functions (cùng handler, cùng env).
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const dist = join(root, 'dist', 'public-demo', 'vercel');
const port = Number(process.argv[2] || 8890);

const { default: api } = await import(pathToFileURL(join(root, 'api', 'demo', '[route].mjs')).href);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.png': 'image/png', '.hdr': 'application/octet-stream', '.wasm': 'application/wasm' };

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${port}`);
    if (url.pathname === '/api/demo' || url.pathname.startsWith('/api/demo/')) {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = chunks.length ? Buffer.concat(chunks) : undefined;
      const request = new Request(url, {
        method: req.method,
        headers: Object.entries(req.headers).filter(([, v]) => v != null).map(([k, v]) => [k, Array.isArray(v) ? v.join(', ') : String(v)]),
        ...(body ? { body, duplex: 'half' } : {})
      });
      const response = await api.fetch(request);
      res.writeHead(response.status, [...response.headers.entries()].filter(([k]) => k !== 'content-encoding' && k !== 'transfer-encoding'));
      const bytes = Buffer.from(await response.arrayBuffer());
      res.end(bytes);
      return;
    }
    let path = decodeURIComponent(url.pathname);
    if (path.endsWith('/')) path += 'index.html';
    const file = normalize(join(dist, path));
    if (!file.startsWith(dist + sep) || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Không tìm thấy trang trong bản build.');
      return;
    }
    const bytes = statSync(file);
    res.writeHead(200, {
      'Content-Type': types[extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': bytes.size,
      'Cache-Control': extname(file) === '.html' ? 'no-store' : 'public, max-age=60'
    });
    if (req.method === 'HEAD') { res.end(); return; }
    createReadStream(file).pipe(res);
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { code: 'SERVER_ERROR', message: String(error && error.message || error) } }));
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Bản nộp demo-v2: http://127.0.0.1:${port}/ (static + /api/demo cùng handler production)`);
});
