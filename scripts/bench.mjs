#!/usr/bin/env node

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildCatalog } from '../src/index.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error) => {
    console.error(error.message);
    process.exitCode = 1;
  },
);

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const repos = await readJson(path.join(rootDir, 'bench/repos.json'));
  const selected = options.repo ? repos.filter((repo) => repo.id === options.repo) : repos;

  if (selected.length === 0) {
    throw new Error(`Unknown benchmark repo: ${options.repo}`);
  }

  let failures = 0;

  for (const repo of selected) {
    const result = await runRepoBench(repo, options);
    printResult(result);
    if (!result.passed) {
      failures += 1;
    }
  }

  return failures === 0 ? 0 : 1;
}

function parseArgs(args) {
  const options = { repo: null, offline: false };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--offline') {
      options.offline = true;
    } else if (arg === '--repo') {
      options.repo = args[index + 1];
      index += 1;
    } else if (arg.startsWith('--repo=')) {
      options.repo = arg.slice('--repo='.length);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

async function runRepoBench(repo, options) {
  const golden = await readJson(path.join(rootDir, repo.golden));
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), `dsg-bench-${repo.id}-`));
  let targetDir;
  let mode = 'clone';
  let warning = null;

  try {
    if (options.offline) {
      targetDir = resolveOfflinePath(repo);
      mode = 'offline';
    } else {
      try {
        targetDir = path.join(tempDir, repo.id);
        await clonePinnedRepo(repo, targetDir);
      } catch (error) {
        if (process.env.CI) {
          throw error;
        }
        const offlinePath = resolveOfflinePath(repo);
        warning = `clone failed (${error.message}); used offline fixture ${path.relative(rootDir, offlinePath)}`;
        targetDir = offlinePath;
        mode = 'offline-fallback';
      }
    }

    const catalog = await buildCatalog(targetDir);
    const topN = golden.topN ?? 20;
    const topCandidates = catalog.candidates.slice(0, topN);
    const expectedMatches = golden.expectedTop.map((signature) => findSignature(topCandidates, signature));
    const noiseMatches = golden.notExpected.flatMap((signature) => {
      const match = findSignature(topCandidates, signature);
      return match ? [{ signature, match }] : [];
    });
    const precision = expectedMatches.filter(Boolean).length / golden.expectedTop.length;
    const maxNoise = golden.maxNoise ?? 0;
    const minPrecision = golden.minPrecision ?? 1;
    const passed = precision >= minPrecision && noiseMatches.length <= maxNoise;

    return {
      repo,
      mode,
      warning,
      passed,
      precision,
      minPrecision,
      maxNoise,
      noiseCount: noiseMatches.length,
      topN,
      summary: catalog.summary,
      expectedMatches,
      noiseMatches,
    };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function clonePinnedRepo(repo, targetDir) {
  await fs.mkdir(targetDir, { recursive: true });
  await run('git', ['init', targetDir]);
  await run('git', ['-C', targetDir, 'remote', 'add', 'origin', repo.url]);

  const checkoutRef = repo.sha || repo.ref || 'HEAD';
  const fetchAttempts = [
    ['-C', targetDir, 'fetch', '--depth', '1', 'origin', checkoutRef],
    ['-C', targetDir, 'fetch', '--depth', '1', 'origin', repo.ref || 'main'],
    ['-C', targetDir, 'fetch', '--depth', '50', 'origin', repo.ref || 'main'],
  ];

  let lastError;
  for (const args of fetchAttempts) {
    try {
      await run('git', args);
      break;
    } catch (error) {
      lastError = error;
    }
  }

  const headExists = await gitSucceeds(targetDir, ['rev-parse', '--verify', 'FETCH_HEAD']);
  if (!headExists) {
    throw lastError || new Error('git fetch did not produce FETCH_HEAD');
  }

  await run('git', ['-C', targetDir, 'checkout', '--detach', checkoutRef]);
}

function resolveOfflinePath(repo) {
  if (!repo.offlinePath) {
    throw new Error(`No offline fixture configured for ${repo.id}`);
  }
  return path.resolve(rootDir, repo.offlinePath);
}

function findSignature(candidates, signature) {
  const expectedClasses = new Set(signature);
  return candidates.find((candidate) => {
    const classes = new Set(candidate.commonClasses || []);
    return [...expectedClasses].every((className) => classes.has(className));
  });
}

function printResult(result) {
  const status = result.passed ? 'PASS' : 'FAIL';
  console.log(`[${status}] ${result.repo.id} (${result.mode})`);
  if (result.warning) {
    console.log(`warning: ${result.warning}`);
  }
  console.log(
    `precision=${result.precision.toFixed(3)} min=${result.minPrecision.toFixed(3)} noise=${result.noiseCount}/${result.maxNoise} topN=${result.topN}`,
  );
  console.log(
    `scanned files=${result.summary.filesScanned} elements=${result.summary.elementsWithClassName} candidates=${result.summary.candidates}`,
  );

  result.expectedMatches.forEach((candidate, index) => {
    const marker = candidate ? 'hit' : 'miss';
    const id = candidate ? `${candidate.id} score=${candidate.score}` : 'none';
    console.log(`expected[${index + 1}] ${marker}: ${id}`);
  });

  for (const { signature, match } of result.noiseMatches) {
    console.log(`noise: ${signature.join(' ')} matched ${match.id} score=${match.score}`);
  }
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

async function gitSucceeds(cwd, args) {
  try {
    await run('git', ['-C', cwd, ...args]);
    return true;
  } catch {
    return false;
  }
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(stderr.trim() || `${command} ${args.join(' ')} exited ${code}`));
      }
    });
  });
}
