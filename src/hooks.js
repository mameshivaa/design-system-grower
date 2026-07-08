import fs from 'node:fs/promises';
import path from 'node:path';
import { formatTextReport, loadApprovedAssets, runDesignSystemCheck } from './check.js';

const TARGET_FILE_PATTERN = /\.(tsx|jsx|ts|js)$/;
const DEFAULT_MATCHER = 'Write|Edit';

export async function runHookCheck(options, streams = process) {
  const input = await readStdin(streams.stdin);
  let event;

  try {
    event = JSON.parse(input);
  } catch {
    return 0;
  }

  const filePath = event?.tool_input?.file_path;
  if (typeof filePath !== 'string' || !TARGET_FILE_PATTERN.test(filePath)) {
    return 0;
  }

  const absoluteFile = path.resolve(filePath);
  const repoDir = path.dirname(absoluteFile);
  const relativeFile = path.basename(absoluteFile);
  const artifactsDir = path.resolve(options.designSystem ?? path.join(process.cwd(), 'design-system'));

  let result;
  let assets;
  try {
    [result, assets] = await Promise.all([
      runDesignSystemCheck({
        repoPath: repoDir,
        designSystem: artifactsDir,
        files: relativeFile,
        strict: false,
      }),
      loadApprovedAssets(artifactsDir),
    ]);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return 0;
    }
    throw error;
  }

  if (result.violations.length === 0) {
    return 0;
  }

  streams.stderr.write(formatHookFeedback(result.violations, assets));
  return 2;
}

export async function installClaudeHooks(options, streams = process) {
  const artifactsDir = path.resolve(options.designSystem ?? path.join(process.cwd(), 'design-system'));
  const settingsPath = path.resolve(options.settings ?? path.join(process.cwd(), '.claude', 'settings.json'));
  const command = `npx -y design-system-grower hook-check --design-system ${shellArg(artifactsDir)}`;
  const hookEntry = {
    matcher: DEFAULT_MATCHER,
    hooks: [
      {
        type: 'command',
        command,
      },
    ],
  };
  const settings = await readSettings(settingsPath, options.force);
  settings.hooks = isPlainObject(settings.hooks) ? settings.hooks : {};
  settings.hooks.PostToolUse = Array.isArray(settings.hooks.PostToolUse) ? settings.hooks.PostToolUse : [];

  if (!hasHook(settings.hooks.PostToolUse, hookEntry)) {
    settings.hooks.PostToolUse.push(hookEntry);
  }

  const nextJson = `${JSON.stringify(settings, null, 2)}\n`;
  streams.stdout.write(`Writing Claude Code hook settings to ${settingsPath}:\n${nextJson}`);
  await fs.mkdir(path.dirname(settingsPath), { recursive: true });
  await fs.writeFile(settingsPath, nextJson, 'utf8');
  return 0;
}

function formatHookFeedback(violations, assets) {
  const assetByName = new Map(assets.map((asset) => [asset.name || asset.id || 'approved asset', asset]));
  const lines = [
    'design-system-grower: design-system drift detected in the edited file.',
    'Fix the file before continuing. Use the approved asset classes below, or record an intentional design-system decision first.',
    '',
    formatTextReport(violations).trim(),
    '',
    'Fix instructions:',
  ];

  for (const violation of violations) {
    const asset = assetByName.get(violation.assetName);
    const canonicalClasses = Array.isArray(asset?.commonClasses) ? asset.commonClasses : [];
    lines.push(`- ${violation.file}:${violation.line}:${violation.column} ${violation.type} ${violation.assetName}`);
    lines.push(`  target asset: ${violation.assetName}`);
    lines.push(`  canonical classes: ${formatClasses(canonicalClasses)}`);
    lines.push(`  diff: missing ${formatClasses(violation.missingClasses)}; extra ${formatClasses(violation.extraClasses)}`);
  }

  lines.push('');
  return lines.join('\n');
}

async function readSettings(settingsPath, force) {
  let raw;
  try {
    raw = await fs.readFile(settingsPath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {};
    }
    throw error;
  }

  try {
    const parsed = JSON.parse(raw);
    return isPlainObject(parsed) ? parsed : {};
  } catch (error) {
    if (force) {
      return {};
    }
    throw new Error(`${settingsPath} is not valid JSON. Re-run with --force to replace it.`);
  }
}

function hasHook(postToolUseHooks, hookEntry) {
  return postToolUseHooks.some((entry) => (
    entry?.matcher === hookEntry.matcher
      && Array.isArray(entry.hooks)
      && entry.hooks.some((hook) => hook?.type === 'command' && hook.command === hookEntry.hooks[0].command)
  ));
}

function formatClasses(classes) {
  return classes.length > 0 ? classes.join(' ') : '(none)';
}

function shellArg(value) {
  if (/^[A-Za-z0-9_/:=.,@%+-]+$/.test(value)) {
    return value;
  }
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readStdin(stdin) {
  if (!stdin || typeof stdin.on !== 'function') {
    return '';
  }

  stdin.setEncoding?.('utf8');
  return new Promise((resolve, reject) => {
    let input = '';
    stdin.on('data', (chunk) => {
      input += chunk;
    });
    stdin.on('end', () => resolve(input));
    stdin.on('error', reject);
  });
}
