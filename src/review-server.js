import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';

const SERVED_ARTIFACTS = new Set([
  'review.html',
  'catalog.json',
  'inventory.json',
  'situations.json',
  'candidates.json',
  'decisions.json',
  'assets.json',
  'assets.md',
  'decisions.md',
  'agent-rules.md',
]);

export async function startReviewServer(options = {}) {
  const artifactsDir = path.resolve(options.artifactsDir ?? path.join(process.cwd(), 'design-system'));
  await assertReviewArtifacts(artifactsDir);

  const host = options.host ?? '127.0.0.1';
  const port = options.port ?? 4173;
  const server = http.createServer((request, response) => {
    serveArtifactRequest(artifactsDir, request, response);
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });

  const address = server.address();
  const resolvedPort = typeof address === 'object' && address ? address.port : port;

  return {
    server,
    url: `http://${host}:${resolvedPort}/`,
    artifactsDir,
  };
}

export async function openReviewUrl(url) {
  const command = openCommand();
  const child = spawn(command.command, [...command.args, url], {
    stdio: 'ignore',
    detached: true,
  });
  child.unref();
}

async function assertReviewArtifacts(artifactsDir) {
  await fs.access(path.join(artifactsDir, 'review.html'));
  await fs.access(path.join(artifactsDir, 'catalog.json'));
}

async function serveArtifactRequest(artifactsDir, request, response) {
  if (!request.url) {
    sendText(response, 400, 'Bad request');
    return;
  }

  const url = new URL(request.url, 'http://localhost');
  const fileName = fileNameForPath(url.pathname);

  if (!fileName || !SERVED_ARTIFACTS.has(fileName)) {
    sendText(response, 404, 'Not found');
    return;
  }

  try {
    const contents = await fs.readFile(path.join(artifactsDir, fileName));
    response.writeHead(200, {
      'Content-Type': contentTypeFor(fileName),
      'Cache-Control': 'no-store',
    });
    response.end(contents);
  } catch {
    sendText(response, 404, 'Not found');
  }
}

function fileNameForPath(pathname) {
  if (pathname === '/' || pathname === '/review.html') {
    return 'review.html';
  }

  const normalized = pathname.replace(/^\/artifacts\//, '/');
  const fileName = path.basename(normalized);
  return fileName === normalized.slice(1) ? fileName : null;
}

function contentTypeFor(fileName) {
  if (fileName.endsWith('.html')) {
    return 'text/html; charset=utf-8';
  }
  if (fileName.endsWith('.json')) {
    return 'application/json; charset=utf-8';
  }
  if (fileName.endsWith('.md')) {
    return 'text/markdown; charset=utf-8';
  }
  return 'text/plain; charset=utf-8';
}

function sendText(response, statusCode, message) {
  response.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(message);
}

function openCommand() {
  if (process.platform === 'darwin') {
    return { command: 'open', args: [] };
  }
  if (process.platform === 'win32') {
    return { command: 'cmd', args: ['/c', 'start', ''] };
  }
  return { command: 'xdg-open', args: [] };
}
