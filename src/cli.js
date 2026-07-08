import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCatalog, writeCatalog, writeDesignSystemArtifacts } from './catalog.js';
import { runDesignSystemCheck } from './check.js';
import { saveDecision, VALID_ACTIONS, writeAssetArtifacts } from './decision-actions.js';
import { buildAgentRulesMarkdown } from './decisions.js';
import { buildDiagnosis, regenerateDiagnosis } from './diagnosis.js';
import { runExtract } from './extract.js';
import { installClaudeHooks, runHookCheck } from './hooks.js';
import { runInit } from './init.js';
import { writeRegistry } from './registry.js';
import { startMcpServer } from './mcp-server.js';
import { openReviewUrl, startReviewServer } from './review-server.js';
import { roleSummaryLines } from './roles.js';

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
    await saveDecision(artifactsDir, {
      candidateId: options.candidateId,
      decision: options.userDecision,
      assetName: options.assetName,
      side: options.side,
    });
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

  if (options.command === 'check') {
    const result = await runDesignSystemCheck({
      repoPath: options.target,
      designSystem: options.designSystem,
      files: options.files,
      base: options.base,
      strict: options.strict,
      report: options.report,
      blame: options.blame,
      stderr: streams.stderr,
    });
    streams.stdout.write(result.text);
    return result.exitCode;
  }

  if (options.command === 'hook-check') {
    return runHookCheck({
      designSystem: options.designSystem,
    }, streams);
  }

  if (options.command === 'install-hooks') {
    return installClaudeHooks({
      designSystem: options.designSystem,
      settings: options.settings,
      force: options.force,
    }, streams);
  }

  if (options.command === 'init') {
    return runInit(options, streams);
  }

  if (options.command === 'diagnose') {
    const artifactsDir = path.resolve(options.target ?? path.join(process.cwd(), 'design-system'));
    const diagnosis = await regenerateDiagnosis(artifactsDir);
    streams.stdout.write(`${diagnosis.text}Wrote diagnosis to ${diagnosis.outputPath}\n`);
    return 0;
  }

  if (options.command === 'extract') {
    const result = await runExtract({
      designSystemDir: options.target,
      assetId: options.assetId,
      outDir: options.output,
      force: options.force,
    });
    streams.stdout.write(`Extracted ${result.assetId} to ${result.outputPath}\n`);
    return 0;
  }

  if (options.command === 'mcp') {
    await startMcpServer({
      designSystem: options.designSystem,
    }, streams);
    return 0;
  }

  if (options.command === 'registry') {
    const designSystemDir = path.resolve(options.target);
    const result = await writeRegistry({
      designSystemDir,
      componentsDir: options.components,
      outDir: options.output,
      name: options.registryName,
      homepage: options.homepage,
    });
    streams.stdout.write(`Wrote ${result.itemCount} registry items to ${result.registryPath}\n`);
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

  const roleLines = roleSummaryLines(catalog.summary.roles);
  streams.stdout.write([
    `Wrote ${catalog.summary.duplicateClusters} clusters, ${catalog.summary.situations} situations, and ${catalog.summary.candidates} candidates from ${catalog.summary.filesScanned} files to ${writtenPath}`,
    ...roleLines,
    `Artifacts: ${artifactsDir}`,
    '',
    buildDiagnosis(catalog).text.trimEnd(),
    '',
  ].join('\n'));
  return 0;
}

export function parseArgs(argv) {
  const options = {};
  const knownCommands = new Set(['scan', 'init', 'diagnose', 'extract', 'instruct', 'decide', 'review', 'install-instructions', 'check', 'hook-check', 'install-hooks', 'mcp', 'registry']);
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

    if (arg === '--design-system') {
      options.designSystem = requireValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg === '--files') {
      options.files = requireValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg === '--base') {
      options.base = requireValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg === '--strict') {
      options.strict = true;
      continue;
    }

    if (arg === '--blame') {
      options.blame = true;
      continue;
    }

    if (arg === '--report') {
      options.report = requireValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg === '--settings') {
      options.settings = requireValue(args, index, arg);
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
      if (command === 'registry') {
        options.registryName = requireValue(args, index, arg);
      } else {
        options.assetName = requireValue(args, index, arg);
      }
      index += 1;
      continue;
    }

    if (arg === '--components') {
      options.components = requireValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg === '--homepage') {
      options.homepage = requireValue(args, index, arg);
      index += 1;
      continue;
    }

    if (arg === '--side') {
      const value = Number(requireValue(args, index, arg));
      if (!Number.isInteger(value) || value < 1) {
        throw new Error('--side must be a positive integer');
      }
      options.side = value;
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

    if (command === 'extract') {
      if (!options.target) {
        options.target = arg;
        continue;
      }
      if (!options.assetId) {
        options.assetId = arg;
        continue;
      }
      throw new Error(`Unexpected argument: ${arg}`);
    }

    if (command === 'install-instructions' || command === 'review' || command === 'check' || command === 'init' || command === 'diagnose' || command === 'registry') {
      if (!options.target) {
        options.target = arg;
        continue;
      }
      throw new Error(`Unexpected argument: ${arg}`);
    }

    if (command === 'mcp' || command === 'hook-check' || command === 'install-hooks') {
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

  if (command === 'check') {
    if (!options.target) {
      throw new Error('check requires: <repo-path> --design-system <artifacts-dir>');
    }
    if (!options.designSystem) {
      throw new Error('check requires --design-system <artifacts-dir>');
    }
  }

  if (command === 'extract') {
    if (!options.target || !options.assetId) {
      throw new Error('extract requires: <design-system-dir> <asset-id>');
    }
  }

  if (command === 'hook-check' && !options.designSystem) {
    throw new Error('hook-check requires --design-system <artifacts-dir>');
  }

  if (command === 'mcp' && !options.designSystem) {
    throw new Error('mcp requires --design-system <artifacts-dir>');
  }

  if (command === 'registry' && !options.target) {
    throw new Error('registry requires: <design-system-dir>');
  }

  return options;
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
    '  design-system-grower init [target-dir] [--design-system <dir>] [--port 4173] [--no-open]',
    '  design-system-grower scan [target-dir] --out catalog.json',
    '  design-system-grower diagnose [design-system-dir]',
    '  design-system-grower extract <design-system-dir> <asset-id> [--out components/ui] [--force]',
    '  design-system-grower instruct [design-system-dir]',
    '  design-system-grower decide [design-system-dir] <candidate-id> <action> [--name AssetName] [--side 1]',
    '  design-system-grower check <repo-path> --design-system <artifacts-dir> [--files <glob,glob>] [--base <git-ref>] [--strict] [--blame] [--report out.md]',
    '  design-system-grower hook-check --design-system <artifacts-dir>',
    '  design-system-grower install-hooks [--design-system <artifacts-dir>] [--settings .claude/settings.json] [--force]',
    '  design-system-grower mcp --design-system <artifacts-dir>',
    '  design-system-grower registry <design-system-dir> [--components <dir>] [--out <dir>] [--name <registry-name>] [--homepage <url>]',
    '  design-system-grower review [design-system-dir] [--port 4173] [--no-open]',
    '  design-system-grower install-instructions [design-system-dir] [--agents-out AGENTS.md] [--claude-out CLAUDE.md]',
    '  node src/cli.mjs init [target-dir] [--design-system <dir>] [--no-open]',
    '  node src/cli.mjs scan [target-dir] --out catalog.json',
    '  node src/cli.mjs diagnose [design-system-dir]',
    '  node src/cli.mjs extract <design-system-dir> <asset-id> [--out components/ui] [--force]',
    '  node src/cli.mjs instruct [design-system-dir]',
    '  node src/cli.mjs decide [design-system-dir] <candidate-id> <action> [--name AssetName] [--side 1]',
    '  node src/cli.mjs check <repo-path> --design-system <artifacts-dir>',
    '  node src/cli.mjs hook-check --design-system <artifacts-dir>',
    '  node src/cli.mjs install-hooks [--design-system <artifacts-dir>] [--settings .claude/settings.json] [--force]',
    '  node src/cli.mjs mcp --design-system <artifacts-dir>',
    '  node src/cli.mjs registry <design-system-dir> [--components <dir>] [--out <dir>] [--name <registry-name>] [--homepage <url>]',
    '  node src/cli.mjs review [design-system-dir] [--no-open]',
    '  node src/cli.mjs install-instructions [design-system-dir] [--force]',
    '',
    'Options:',
    '  -o, --out <path>           Write JSON catalog to path, or extract component output directory',
    '  --artifacts-dir <path>     Write inventory, situations, candidates, decisions, assets, agent rules, and review HTML',
    '  --design-system <path>     Read approved design-system artifacts for check',
    '  --files <glob,glob>        Limit check to comma-separated files or simple globs',
    '  --base <git-ref>           Limit check to files changed since git ref plus uncommitted changes',
    '  --strict                   Exit 1 from check when drift is found',
    '  --blame                    Annotate check findings with git blame attribution',
    '  --report <path>            Write a markdown check report',
    '  --settings <path>          Claude Code settings path (install-hooks)',
    '  --name <AssetName>         Name the approved asset when using decide; registry name when using registry',
    '  --components <dir>         Directory containing extracted components for registry',
    '  --homepage <url>           Public homepage URL for registry metadata',
    '  --side <n>                 Canonical side number when approving a canonicalize decision',
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
