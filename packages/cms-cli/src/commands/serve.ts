import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { logger } from '../utils/logger.js';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

export async function serveCommand(args: { port?: number; dir?: string }) {
  const dir = args.dir ?? 'dist';
  const port = args.port ?? 5000;

  if (!existsSync(dir)) {
    logger.error(`Directory "${dir}" not found — run "cms build" first`);
    process.exit(1);
  }

  const server = createServer((req, res) => {
    let urlPath = req.url ?? '/';
    // Strip query string
    urlPath = urlPath.split('?')[0] ?? '/';

    // Map / → /index.html, /posts/ → /posts/index.html
    let filePath = join(dir, urlPath);
    if (!extname(filePath)) {
      filePath = join(filePath, 'index.html');
    }

    if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
      filePath = join(dir, '404.html');
      if (!existsSync(filePath)) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
        return;
      }
    }

    const ext = extname(filePath);
    const mime = MIME[ext] ?? 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    createReadStream(filePath).pipe(res);
  });

  server.listen(port, () => {
    logger.success(`Serving ${dir}/ at http://localhost:${port}`);
    logger.log('');
    logger.log('  Press Ctrl+C to stop');
  });
}
