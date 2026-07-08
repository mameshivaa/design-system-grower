import path from 'node:path';
import { buildCatalog, writeCatalog, writeDesignSystemArtifacts } from './catalog.js';
import { openReviewUrl, startReviewServer } from './review-server.js';

export async function runInit(options = {}, streams = process) {
  const targetDir = path.resolve(options.target ?? process.cwd());
  const artifactsDir = path.resolve(options.designSystem ?? path.join(targetDir, 'design-system'));
  const catalog = await buildCatalog(targetDir, {
    minimumOccurrences: options.minimumOccurrences,
  });

  await writeCatalog(catalog, path.join(artifactsDir, 'catalog.json'));
  await writeDesignSystemArtifacts(catalog, artifactsDir, {
    preserveDecisions: true,
  });

  streams.stdout.write(buildInitSummary(catalog, artifactsDir));

  const review = await startReviewServer({
    artifactsDir,
    host: options.host,
    port: options.port,
  });
  streams.stdout.write(`Review URL: ${review.url}\n`);
  streams.stdout.write('Press Ctrl+C to stop.\n');

  if (!options.noOpen) {
    try {
      await openReviewUrl(review.url);
    } catch (error) {
      streams.stderr?.write(`Could not open browser automatically: ${error.message}\n`);
    }
  }

  const waitForShutdown = options.waitForShutdown ?? waitForServerShutdown;
  await waitForShutdown(review.server);
  streams.stdout.write(buildNextSteps(catalog, artifactsDir));
  return 0;
}

export function buildInitSummary(catalog, artifactsDir) {
  const lines = [
    'dsg init completed scan.\n',
    `Artifacts: ${artifactsDir}`,
    `Files scanned: ${catalog.summary.filesScanned}`,
    `Candidates: ${catalog.summary.candidates}`,
    `Drift candidates: ${driftCandidates(catalog).length}`,
    'Top candidates:',
  ];
  const topCandidates = catalog.candidates.slice(0, 3);

  if (topCandidates.length === 0) {
    lines.push('- No reusable UI candidates found yet.');
  } else {
    for (const candidate of topCandidates) {
      lines.push(`- ${candidate.id}: ${candidate.assetNameSuggestion} (${candidate.commonClasses.join(' ')})`);
    }
  }

  lines.push('');
  return `${lines.join('\n')}\n`;
}

export function buildNextSteps(catalog, artifactsDir) {
  const candidate = catalog.candidates.find((item) => item.id === 'candidate-001') ?? catalog.candidates[0];
  const decideExample = candidate
    ? decideCommandFor(artifactsDir, candidate)
    : `dsg decide ${shellPath(artifactsDir)} candidate-001 reuse --name YourAssetName`;
  return [
    '',
    'Next steps:',
    `1. Approve the first reviewed candidate: ${decideExample}`,
    `2. Install agent instructions: dsg install-instructions ${shellPath(artifactsDir)}`,
    `3. Add a CI check: dsg check . --design-system ${shellPath(artifactsDir)} --strict`,
    '',
  ].join('\n');
}

function driftCandidates(catalog) {
  return catalog.candidates.filter((candidate) => (
    candidate.actionType === 'canonicalize' || candidate.driftId
  ));
}

function decideCommandFor(artifactsDir, candidate) {
  const parts = [
    'dsg',
    'decide',
    shellPath(artifactsDir),
    candidate.id,
    candidate.recommendedAction,
  ];

  if (candidate.assetNameSuggestion) {
    parts.push('--name', candidate.assetNameSuggestion);
  }
  if (candidate.actionType === 'canonicalize' && candidate.recommendedSide) {
    parts.push('--side', String(candidate.recommendedSide));
  }

  return parts.join(' ');
}

function shellPath(filePath) {
  return /\s/.test(filePath) ? JSON.stringify(filePath) : filePath;
}

function waitForServerShutdown(server) {
  return new Promise((resolve) => {
    let settled = false;
    const shutdown = () => {
      if (settled) {
        return;
      }
      settled = true;
      process.off('SIGINT', shutdown);
      process.off('SIGTERM', shutdown);
      server.close(() => {
        resolve();
      });
    };

    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  });
}
