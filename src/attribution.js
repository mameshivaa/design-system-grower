import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const blameCache = new Map();

export async function attributeLine(filePath, lineNumber, options = {}) {
  const repoDir = path.resolve(options.repoDir ?? process.cwd());
  const relativeFile = normalizePath(path.isAbsolute(filePath) ? path.relative(repoDir, filePath) : filePath);
  const line = Number(lineNumber);

  if (!relativeFile || !Number.isInteger(line) || line < 1) {
    return null;
  }

  const blame = await blameFile(repoDir, relativeFile);
  const entry = blame.get(line);
  if (!entry) {
    return null;
  }

  const commitMessage = await commitMessageFor(repoDir, entry.commit);
  const inventor = classifyInventor([
    entry.author,
    entry.authorMail,
    entry.committer,
    entry.committerMail,
    extractCoAuthors(commitMessage),
  ]);

  return {
    inventor,
    author: entry.author,
    authorMail: entry.authorMail,
    committedAt: new Date(entry.authorTime * 1000).toISOString(),
    relativeTime: relativeTime(entry.authorTime * 1000, options.now ?? Date.now()),
    commit: entry.commit,
  };
}

export function classifyInventor(values) {
  const text = values.filter(Boolean).join('\n').toLowerCase();

  if (text.includes('claude')) {
    return 'claude';
  }
  if (text.includes('cursor')) {
    return 'cursor';
  }
  if (text.includes('codex') || text.includes('openai')) {
    return 'codex';
  }
  if (text.includes('github-actions') || text.includes('[bot]') || /\bbot\b/.test(text)) {
    return 'bot';
  }
  return 'human';
}

async function blameFile(repoDir, relativeFile) {
  const cacheKey = `${repoDir}\0${relativeFile}`;
  if (!blameCache.has(cacheKey)) {
    blameCache.set(cacheKey, loadBlameFile(repoDir, relativeFile));
  }
  return blameCache.get(cacheKey);
}

async function loadBlameFile(repoDir, relativeFile) {
  try {
    const { stdout } = await execFileAsync('git', ['-C', repoDir, 'blame', '--porcelain', '--', relativeFile], {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    });
    return parseBlame(stdout);
  } catch {
    return new Map();
  }
}

async function commitMessageFor(repoDir, commit) {
  if (!commit || commit === '0000000000000000000000000000000000000000') {
    return '';
  }

  const cacheKey = `${repoDir}\0${commit}\0message`;
  if (!blameCache.has(cacheKey)) {
    blameCache.set(cacheKey, loadCommitMessage(repoDir, commit));
  }
  return blameCache.get(cacheKey);
}

async function loadCommitMessage(repoDir, commit) {
  try {
    const { stdout } = await execFileAsync('git', ['-C', repoDir, 'show', '-s', '--format=%B', commit], {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
    });
    return stdout;
  } catch {
    return '';
  }
}

function parseBlame(output) {
  const lines = output.split('\n');
  const entries = new Map();
  const commitInfo = new Map();
  let current = null;

  for (const line of lines) {
    const header = line.match(/^([0-9a-f]{40}) \d+ (\d+)(?: \d+)?$/);
    if (header) {
      const commit = header[1];
      current = {
        commit,
        finalLine: Number(header[2]),
        ...(commitInfo.get(commit) ?? {}),
      };
      continue;
    }

    if (!current) {
      continue;
    }

    if (line.startsWith('\t')) {
      entries.set(current.finalLine, { ...current });
      commitInfo.set(current.commit, {
        author: current.author,
        authorMail: current.authorMail,
        authorTime: current.authorTime,
        committer: current.committer,
        committerMail: current.committerMail,
      });
      current = null;
      continue;
    }

    const separator = line.indexOf(' ');
    const key = separator === -1 ? line : line.slice(0, separator);
    const value = separator === -1 ? '' : line.slice(separator + 1);

    if (key === 'author') {
      current.author = value;
    } else if (key === 'author-mail') {
      current.authorMail = stripMailBrackets(value);
    } else if (key === 'author-time') {
      current.authorTime = Number(value);
    } else if (key === 'committer') {
      current.committer = value;
    } else if (key === 'committer-mail') {
      current.committerMail = stripMailBrackets(value);
    }
  }

  return entries;
}

function extractCoAuthors(message) {
  return message
    .split('\n')
    .filter((line) => /^Co-Authored-By:/i.test(line))
    .join('\n');
}

function relativeTime(timestampMs, nowMs) {
  const seconds = Math.max(0, Math.round((nowMs - timestampMs) / 1000));
  const units = [
    ['year', 365 * 24 * 60 * 60],
    ['month', 30 * 24 * 60 * 60],
    ['day', 24 * 60 * 60],
    ['hour', 60 * 60],
    ['minute', 60],
  ];

  for (const [unit, size] of units) {
    const count = Math.floor(seconds / size);
    if (count >= 1) {
      return `${count} ${unit}${count === 1 ? '' : 's'} ago`;
    }
  }

  return 'just now';
}

function stripMailBrackets(value) {
  return value.replace(/^<|>$/g, '');
}

function normalizePath(filePath) {
  return filePath.split(path.sep).join('/');
}
