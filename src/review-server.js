import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { saveDecision } from './decision-actions.js';

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
  if (!isLocalHost(host)) {
    throw new Error('Review server must bind to localhost only');
  }
  const port = options.port ?? 4173;
  const server = http.createServer((request, response) => {
    serveReviewRequest(artifactsDir, request, response);
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

async function serveReviewRequest(artifactsDir, request, response) {
  try {
    if (request.url?.startsWith('/api/snippet')) {
      await serveSnippet(artifactsDir, request, response);
      return;
    }

    if (request.url === '/api/decide') {
      await serveDecide(artifactsDir, request, response);
      return;
    }

    await serveArtifactRequest(artifactsDir, request, response);
  } catch (error) {
    sendJson(response, error.statusCode ?? 500, { error: error.message });
  }
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

async function serveSnippet(artifactsDir, request, response) {
  if (request.method !== 'GET') {
    sendJson(response, 405, { error: 'Method not allowed' });
    return;
  }

  const url = new URL(request.url, 'http://localhost');
  const catalog = await readCatalog(artifactsDir);
  const location = snippetLocationFromRequest(catalog, url.searchParams);
  const repoRoot = path.resolve(catalog.target);
  const sourcePath = resolveSourcePath(repoRoot, location.file);
  const line = Number(location.line);

  if (!Number.isInteger(line) || line < 1) {
    sendJson(response, 400, { error: 'line must be a positive integer' });
    return;
  }

  const context = clampInteger(Number(url.searchParams.get('context') ?? 2), 0, 8);
  const source = await fs.readFile(sourcePath, 'utf8');
  const sourceLines = source.split(/\r?\n/);
  const startLine = Math.max(1, line - context);
  const endLine = Math.min(sourceLines.length, line + context);
  const lines = [];

  for (let currentLine = startLine; currentLine <= endLine; currentLine += 1) {
    lines.push({
      line: currentLine,
      text: sourceLines[currentLine - 1] ?? '',
      highlight: currentLine === line,
    });
  }

  sendJson(response, 200, {
    file: location.file,
    line,
    startLine,
    endLine,
    lines,
  });
}

async function serveDecide(artifactsDir, request, response) {
  if (request.method !== 'POST') {
    sendJson(response, 405, { error: 'Method not allowed' });
    return;
  }

  const body = await readJsonBody(request);
  if (!body.candidateId || !body.decision) {
    sendJson(response, 400, { error: 'candidateId and decision are required' });
    return;
  }

  const decision = await saveDecision(artifactsDir, {
    candidateId: String(body.candidateId),
    decision: String(body.decision),
    assetName: body.assetName ? String(body.assetName) : undefined,
  });
  sendJson(response, 200, { decision });
}

function fileNameForPath(pathname) {
  if (pathname === '/' || pathname === '/review.html') {
    return 'review.html';
  }

  const normalized = pathname.replace(/^\/artifacts\//, '/');
  const fileName = path.basename(normalized);
  return fileName === normalized.slice(1) ? fileName : null;
}

async function readCatalog(artifactsDir) {
  return JSON.parse(await fs.readFile(path.join(artifactsDir, 'catalog.json'), 'utf8'));
}

function snippetLocationFromRequest(catalog, searchParams) {
  const candidateId = searchParams.get('candidateId');
  if (candidateId) {
    const candidate = catalog.candidates.find((item) => item.id === candidateId);
    if (!candidate) {
      const error = new Error(`Unknown candidate: ${candidateId}`);
      error.statusCode = 404;
      throw error;
    }

    const exampleIndex = clampInteger(Number(searchParams.get('example') ?? 0), 0, Number.MAX_SAFE_INTEGER);
    const example = candidate.source?.examples?.[exampleIndex];
    if (!example) {
      const error = new Error(`No source example for candidate: ${candidateId}`);
      error.statusCode = 404;
      throw error;
    }
    return example;
  }

  return {
    file: searchParams.get('file'),
    line: Number(searchParams.get('line')),
  };
}

function resolveSourcePath(repoRoot, sourceFile) {
  if (!sourceFile) {
    const error = new Error('file is required');
    error.statusCode = 400;
    throw error;
  }

  const resolved = path.resolve(repoRoot, sourceFile);
  const relative = path.relative(repoRoot, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    const error = new Error('Source path must stay inside the scanned repo');
    error.statusCode = 403;
    throw error;
  }
  return resolved;
}

function clampInteger(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 64 * 1024) {
        reject(Object.assign(new Error('Request body too large'), { statusCode: 413 }));
        request.destroy();
      }
    });
    request.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(Object.assign(new Error('Invalid JSON body'), { statusCode: 400 }));
      }
    });
    request.on('error', reject);
  });
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

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(`${JSON.stringify(payload, null, 2)}\n`);
}

function isLocalHost(host) {
  return host === '127.0.0.1' || host === 'localhost' || host === '::1';
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
