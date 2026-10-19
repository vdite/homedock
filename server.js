import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DashboardStore } from './store.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT, 'public');
const PORT = Number.parseInt(process.env.PORT || '8080', 10);
const HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const CONFIG_FILE = process.env.CONFIG_FILE || path.join(DATA_DIR, 'dashboard.json');
const MAX_BODY_SIZE = 2 * 1024 * 1024;
const store = new DashboardStore(CONFIG_FILE);

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
};

function sendJson(response, status, body) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_SIZE) {
      const error = new Error('Anfrage ist zu groß.');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    const error = new Error('Anfrage enthält kein gültiges JSON.');
    error.statusCode = 400;
    throw error;
  }
}

async function serveStatic(requestPath, response) {
  const requested = requestPath === '/' ? 'index.html' : requestPath.slice(1);
  const safePath = path.normalize(requested).replace(/^(\.\.(\/|\\|$))+/, '');
  let filePath = path.join(PUBLIC_DIR, safePath);
  if (!filePath.startsWith(PUBLIC_DIR + path.sep) && filePath !== path.join(PUBLIC_DIR, 'index.html')) {
    sendJson(response, 403, { error: 'Nicht erlaubt.' });
    return;
  }

  try {
    const fileStat = await stat(filePath);
    if (fileStat.isDirectory()) filePath = path.join(filePath, 'index.html');
    const content = await readFile(filePath);
    const extension = path.extname(filePath).toLowerCase();
    response.writeHead(200, {
      'Content-Type': MIME_TYPES[extension] || 'application/octet-stream',
      'Cache-Control': extension === '.html' ? 'no-cache' : 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Content-Security-Policy': "default-src 'self'; img-src 'self' data: https: http:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    });
    response.end(content);
  } catch (error) {
    if (error.code === 'ENOENT') {
      sendJson(response, 404, { error: 'Nicht gefunden.' });
      return;
    }
    throw error;
  }
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');

    if (url.pathname === '/healthz') {
      sendJson(response, 200, { status: 'ok' });
      return;
    }

    if (url.pathname === '/api/dashboard') {
      if (request.method === 'GET') {
        sendJson(response, 200, await store.read());
        return;
      }
      if (request.method === 'PUT') {
        sendJson(response, 200, await store.save(await readJson(request)));
        return;
      }
      response.setHeader('Allow', 'GET, PUT');
      sendJson(response, 405, { error: 'Methode nicht erlaubt.' });
      return;
    }

    if (!['GET', 'HEAD'].includes(request.method)) {
      sendJson(response, 405, { error: 'Methode nicht erlaubt.' });
      return;
    }

    await serveStatic(url.pathname, response);
  } catch (error) {
    const status = error.statusCode || 500;
    if (status === 500) console.error(error);
    sendJson(response, status, { error: status === 500 ? 'Interner Serverfehler.' : error.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`HomeDock läuft auf http://${HOST}:${PORT}`);
  console.log(`Konfiguration: ${CONFIG_FILE}`);
});

function shutdown(signal) {
  console.log(`${signal} empfangen, HomeDock wird beendet …`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
