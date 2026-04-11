import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const HOST = process.env.HOST ?? '127.0.0.1';
const PORT = Number(process.env.PORT ?? '4173');
const ROOT = resolve(process.cwd(), 'out/renderer');

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function getMimeType(filePath) {
  return MIME_TYPES[extname(filePath)] ?? 'application/octet-stream';
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://${HOST}:${String(PORT)}`);
    const pathname = url.pathname === '/' ? '/shell.html' : url.pathname;
    const targetPath = normalize(join(ROOT, pathname));

    if (!targetPath.startsWith(ROOT)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    const content = await readFile(targetPath);
    res.writeHead(200, {
      'Content-Type': getMimeType(targetPath),
      'Cache-Control': 'no-store',
    });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end('Not Found');
  }
});

server.listen(PORT, HOST, () => {
  console.log(`E2E static server listening on http://${HOST}:${String(PORT)}`);
});
