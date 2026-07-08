import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApprovedAssets, buildAssetsMarkdown } from './assets.js';
import { buildCatalog, writeCatalog, writeDesignSystemArtifacts } from './catalog.js';
import { buildAgentRulesMarkdown } from './decisions.js';
import { openReviewUrl, startReviewServer } from './review-server.js';

export async function main(argv = process.argv.slice(2), streams = process) {
  const options = parseArgs(argv);

  if (options.help) {
    streams.stdout.write(helpText());
    return 0;
  }

  if (options.command === 'instruct') {
    const artifactsDir = path.resolve(options.target ?? path.join(process.cwd(), 'design-system'));
    const catalog = JSON.parse(await fs.readFile(path.join(artifactsDir, 'catalog.json'), 'utf8'));
    const decisions = JSON.parse(await fs.readFile(path.join(artifactsDir, 'decisions.json'), 'utf8'));
    const outputPath = path.resolve(options.output ?? path.join(artifactsDir, 'agent-rules.md'));
    const rules = buildAgentRulesMarkdown(catalog, decisions);
    await writeAssetArtifacts(artifactsDir, catalog, decisions);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, rules, 'utf8');
    streams.stdout.write(`Wrote agent rules from approved decisions to ${outputPath}\n`);
    return 0;
  }

  if (options.command === 'decide') {
    const artifactsDir = path.resolve(options.target ?? path.join(process.cwd(), 'design-system'));
    const catalog = JSON.parse(await fs.readFile(path.join(artifactsDir, 'catalog.json'), 'utf8'));
    const decisionsPath = path.join(artifactsDir, 'decisions.json');
    const decisions = JSON.parse(await fs.readFile(decisionsPath, 'utf8'));
    const updatedDecisions = approveDecision(
      catalog,
      decisions,
      options.candidateId,
      options.userDecision,
      options.assetName,
    );
    await fs.writeFile(decisionsPath, `${JSON.stringify(updatedDecisions, null, 2)}\n`, 'utf8');
    await writeAssetArtifacts(artifactsDir, catalog, updatedDecisions);
    const rules = buildAgentRulesMarkdown(catalog, updatedDecisions);
    await fs.writeFile(path.join(artifactsDir, 'agent-rules.md'), rules, 'utf8');
    streams.stdout.write(`Approved ${options.candidateId} as ${options.userDecision} and regenerated agent rules in ${artifactsDir}\n`);
    return 0;
  }

  if (options.command === 'install-instructions') {
    const artifactsDir = path.resolve(options.target ?? path.join(process.cwd(), 'design-system'));
    const agentRules = await fs.readFile(path.join(artifactsDir, 'agent-rules.md'), 'utf8');
    const agentsOut = path.resolve(options.agentsOut ?? path.join(process.cwd(), 'AGENTS.md'));
    const claudeOut = path.resolve(options.claudeOut ?? path.join(process.cwd(), 'CLAUDE.md'));
    await writeInstructionFile(agentsOut, buildInstructionFile('AGENTS.md', artifactsDir, agentRules), options.force);
    await writeInstructionFile(claudeOut, buildInstructionFile('CLAUDE.md', artifactsDir, agentRules), options.force);
    streams.stdout.write(`Installed UI agent instructions to ${agentsOut} and ${claudeOut}\n`);
    return 0;
  }

  if (options.command === 'review') {
    const artifactsDir = path.resolve(options.target ?? path.join(process.cwd(), 'design-system'));
    const review = await startReviewServer({
      artifactsDir,
      host: options.host,
      port: options.port,
    });
    streams.stdout.write(`Serving design-system review from ${review.artifactsDir}\n`);
    streams.stdout.write(`Review URL: ${review.url}\n`);
    streams.stdout.write('Press Ctrl+C to stop.\n');

    if (!options.noOpen) {
      try {
        await openReviewUrl(review.url);
      } catch (error) {
        streams.stderr.write(`Could not open browser automatically: ${error.message}\n`);
      }
    }

    await waitForShutdown(review.server);
    return 0;
  }

  const targetDir = options.target ?? process.cwd();
  const outputPath = options.output ?? path.join(process.cwd(), 'design-system', 'catalog.json');
  const catalog = await buildCatalog(targetDir, {
    minimumOccurrences: options.minimumOccurrences,
  });
  const writtenPath = await writeCatalog(catalog, outputPath);
  const artifactsDir = await writeDesignSystemArtifacts(catalog, options.artifactsDir ?? path.dirname(writtenPath));

  streams.stdout.write(
    `Wrote ${catalog.summary.duplicateClusters} clusters, ${catalog.summary.situations} situations, and ${catalog.summary.candidates} candidates from ${catalog.summary.filesScanned} files to ${writtenPath}\nArtifacts: ${artifactsDir}\n`,
  );
  return 0;
}

export function parseArgs(argv) {
  const options = {};
  const knownCommands = new Set(['scan', 'instruct', 'decide', 'review', 'install-instructions']);
  const command = knownCommands.has(argv[0]) ? argv[0] : 'scan';
  const args = knownCommands.has(argv[0]) ? argv.slice(1) : argv;
  options.command = command;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }

    if (arg === '--out' || arg === '-o') {
      options.output = requireValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg === '--min-occurrences') {
      const value = Number(requireValue(args, index, arg));
      if (!Number.isInteger(value) || value < 2) {
        throw new Error('--min-occurrences must be an integer greater than or equal to 2');
      }
      options.minimumOccurrences = value;
      index += 1;
      continue;
    }

    if (arg === '--artifacts-dir') {
      options.artifactsDir = requireValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg === '--agents-out') {
      options.agentsOut = requireValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg === '--claude-out') {
      options.claudeOut = requireValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg === '--force') {
      options.force = true;
      continue;
    }

    if (arg === '--no-open') {
      options.noOpen = true;
      continue;
    }

    if (arg === '--host') {
      options.host = requireValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg === '--port') {
      const value = Number(requireValue(args, index, arg));
      if (!Number.isInteger(value) || value < 0 || value > 65535) {
        throw new Error('--port must be an integer from 0 to 65535');
      }
      options.port = value;
      index += 1;
      continue;
    }

    if (arg === '--name') {
      options.assetName = requireValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    }

    if (command === 'decide') {
      if (!options.target) {
        options.target = arg;
        continue;
      }
      if (!options.candidateId) {
        options.candidateId = arg;
        continue;
      }
      if (!options.userDecision) {
        options.userDecision = arg;
        continue;
      }
      throw new Error(`Unexpected argument: ${arg}`);
    }

    if (command === 'install-instructions' || command === 'review') {
      if (!options.target) {
        options.target = arg;
        continue;
      }
      throw new Error(`Unexpected argument: ${arg}`);
    }

    if (options.target) {
      throw new Error(`Unexpected argument: ${arg}`);
    }
    options.target = arg;
  }

  if (command === 'decide') {
    if (!options.candidateId || !options.userDecision) {
      throw new Error('decide requires: <design-system-dir> <candidate-id> <action>');
    }
    if (!VALID_ACTIONS.has(options.userDecision)) {
      throw new Error(`Unknown decision action: ${options.userDecision}`);
    }
  }

  return options;
}

const VALID_ACTIONS = new Set([
  'reuse',
  'promote-variant',
  'wrap',
  'extract-block',
  'document-rule',
  'ignore',
  'unsupported',
]);

function approveDecision(catalog, decisions, candidateId, userDecision, assetName) {
  if (!catalog.candidates.some((candidate) => candidate.id === candidateId)) {
    throw new Error(`Unknown candidate: ${candidateId}`);
  }

  const decisionIndex = decisions.findIndex((decision) => decision.candidateId === candidateId);
  if (decisionIndex === -1) {
    throw new Error(`No decision row found for candidate: ${candidateId}`);
  }

  const updated = decisions.slice();
  updated[decisionIndex] = {
    ...updated[decisionIndex],
    userDecision,
    status: 'approved',
    ...(assetName ? { assetName } : {}),
  };
  return updated;
}

async function writeAssetArtifacts(artifactsDir, catalog, decisions) {
  const assets = buildApprovedAssets(catalog, decisions);
  await fs.writeFile(path.join(artifactsDir, 'assets.json'), `${JSON.stringify(assets, null, 2)}\n`, 'utf8');
  await fs.writeFile(path.join(artifactsDir, 'assets.md'), buildAssetsMarkdown(assets), 'utf8');
}

function waitForShutdown(server) {
  return new Promise((resolve) => {
    const shutdown = () => {
      server.close(() => {
        resolve();
      });
    };

    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  });
}

async function writeInstructionFile(outputPath, contents, force = false) {
  if (!force && await fileExists(outputPath)) {
    throw new Error(`${outputPath} already exists. Re-run with --force to overwrite.`);
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, contents, 'utf8');
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function buildInstructionFile(fileName, artifactsDir, agentRules) {
  return [
    `# ${fileName}`,
    '',
    'This file was generated by design-system-grower from approved local UI decisions.',
    `Source artifacts: ${artifactsDir}`,
    '',
    '## UI Reuse Rules',
    '',
    agentRules.trim(),
    '',
  ].join('\n');
}

function requireValue(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith('-')) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

export function helpText() {
  return [
    'design-system-grower',
    '',
    'Usage:',
    '  design-system-grower scan [target-dir] --out catalog.json',
    '  design-system-grower instruct [design-system-dir]',
    '  design-system-grower decide [design-system-dir] <candidate-id> <action> [--name AssetName]',
    '  design-system-grower review [design-system-dir] [--port 4173] [--no-open]',
    '  design-system-grower install-instructions [design-system-dir] [--agents-out AGENTS.md] [--claude-out CLAUDE.md]',
    '  node src/cli.mjs scan [target-dir] --out catalog.json',
    '  node src/cli.mjs instruct [design-system-dir]',
    '  node src/cli.mjs decide [design-system-dir] <candidate-id> <action> [--name AssetName]',
    '  node src/cli.mjs review [design-system-dir] [--no-open]',
    '  node src/cli.mjs install-instructions [design-system-dir] [--force]',
    '',
    'Options:',
    '  -o, --out <path>           Write JSON catalog to path',
    '  --artifacts-dir <path>     Write inventory, situations, candidates, decisions, assets, agent rules, and review HTML',
    '  --name <AssetName>         Name the approved asset when using decide',
    '  --host <host>              Host for the local review server (default: 127.0.0.1)',
    '  --port <port>              Port for the local review server (default: 4173, 0 for random)',
    '  --no-open                  Do not open a browser for review',
    '  --agents-out <path>        Write Codex instructions to path (install-instructions)',
    '  --claude-out <path>        Write Claude instructions to path (install-instructions)',
    '  --force                    Overwrite existing instruction files',
    '  --min-occurrences <n>     Minimum repeated elements per cluster (default: 2)',
    '  -h, --help                Show help',
    '',
  ].join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
    },
  );
}
