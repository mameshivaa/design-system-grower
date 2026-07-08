import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { buildApprovedAssets } from './assets.js';
import { analyzeSource } from './extractor.js';
import { findJsxFiles } from './scanner.js';

const SIMILARITY_THRESHOLD = 0.6;
const NEW_VARIANT_MIN_SIMILARITY = 0.5;
const NEW_VARIANT_MAX_SIMILARITY = 0.95;
const execFileAsync = promisify(execFile);

export async function runDesignSystemCheck(options) {
  const repoDir = path.resolve(options.repoPath);
  const artifactsDir = path.resolve(options.designSystem);
  const approvedAssets = await loadApprovedAssets(artifactsDir);
  const candidates = await loadCatalogCandidates(artifactsDir);
  const baseFiles = options.base ? await resolveBaseChangedFiles(repoDir, options.base, options.stderr) : null;
  const usages = await scanUsages(repoDir, options.files, baseFiles);
  const violations = findViolations(usages, approvedAssets, candidates);
  const text = formatTextReport(violations);

  if (options.report) {
    const reportPath = path.resolve(options.report);
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, formatMarkdownReport(violations), 'utf8');
  }

  return {
    violations,
    text,
    exitCode: violations.length > 0 && options.strict ? 1 : 0,
  };
}

export function findViolations(usages, assets, candidates = []) {
  const approved = assets
    .map((asset) => ({
      asset,
      signature: normalizedClassSet(asset.commonClasses),
      deprecatedSignatures: deprecatedClassSets(asset.deprecatedClasses),
    }))
    .filter((entry) => entry.signature.size > 0 || entry.deprecatedSignatures.length > 0);
  const candidateEntries = candidates
    .map((candidate) => ({
      candidate,
      role: candidateRole(candidate),
      signature: normalizedClassSet(candidate.commonClasses),
    }))
    .filter((entry) => entry.signature.size > 0);
  const roleCounts = countCandidatesByRole(candidateEntries);
  const violations = [];

  for (const usage of usages) {
    const usageSet = normalizedClassSet(usage.classes);
    let deprecatedMatch = null;
    let nearMissMatch = null;
    let hasExactApprovedMatch = false;

    for (const entry of approved) {
      for (const deprecatedSignature of entry.deprecatedSignatures) {
        const similarity = jaccard(usageSet, deprecatedSignature);
        if (similarity >= SIMILARITY_THRESHOLD) {
          const violation = buildViolation('deprecated', usage, entry.asset, deprecatedSignature, similarity);
          if (!deprecatedMatch || similarity > deprecatedMatch.similarity) {
            deprecatedMatch = violation;
          }
        }
      }

      if (entry.signature.size === 0) {
        continue;
      }

      const similarity = jaccard(usageSet, entry.signature);
      if (similarity === 1) {
        hasExactApprovedMatch = true;
        continue;
      }
      if (similarity >= SIMILARITY_THRESHOLD && similarity < 1) {
        const violation = buildViolation('near-miss', usage, entry.asset, entry.signature, similarity);
        if (!nearMissMatch || similarity > nearMissMatch.similarity) {
          nearMissMatch = violation;
        }
      }
    }

    const existingMatch = bestExistingViolation(deprecatedMatch, nearMissMatch);
    if (existingMatch) {
      violations.push(existingMatch);
      continue;
    }

    if (hasExactApprovedMatch) {
      continue;
    }

    const newVariantMatch = findNewVariantMatch(usage, usageSet, candidateEntries, roleCounts);
    if (newVariantMatch) {
      violations.push(newVariantMatch);
    }
  }

  return violations;
}

export function formatTextReport(violations) {
  if (violations.length === 0) {
    return 'dsg check: no design-system drift found.\n';
  }

  const lines = [
    `dsg check: found ${violations.length} design-system drift warning${violations.length === 1 ? '' : 's'}.`,
    '',
  ];

  for (const violation of violations) {
    lines.push(`${violation.file}:${violation.line}:${violation.column} ${violation.type} ${violation.assetName}`);
    lines.push(`  ${messageFor(violation)}`);
    lines.push(`  similarity: ${violation.similarity.toFixed(2)}`);
    lines.push(`  missing: ${formatClasses(violation.missingClasses)}`);
    lines.push(`  extra: ${formatClasses(violation.extraClasses)}`);
    lines.push('');
  }

  return lines.join('\n');
}

export function formatMarkdownReport(violations) {
  const lines = ['## dsg check', ''];

  if (violations.length === 0) {
    lines.push('No design-system drift found.', '');
    return lines.join('\n');
  }

  lines.push(`Found ${violations.length} design-system drift warning${violations.length === 1 ? '' : 's'}.`, '');
  lines.push('### Summary', '');
  lines.push('| Type | Count |');
  lines.push('| --- | ---: |');
  for (const [type, count] of violationCounts(violations)) {
    lines.push(`| ${escapeMarkdown(type)} | ${count} |`);
  }
  lines.push('');
  lines.push('| Location | Type | Asset | Diff |');
  lines.push('| --- | --- | --- | --- |');

  for (const violation of violations) {
    const diff = [
      `missing: ${inlineClasses(violation.missingClasses)}`,
      `extra: ${inlineClasses(violation.extraClasses)}`,
    ].join('<br>');
    lines.push(`| ${escapeMarkdown(`${violation.file}:${violation.line}`)} | ${escapeMarkdown(violation.type)} | ${escapeMarkdown(violation.assetName)} | ${diff} |`);
  }

  lines.push('', '<!-- Generated by dsg check. -->', '');
  return lines.join('\n');
}

export async function loadApprovedAssets(artifactsDir) {
  const assets = await readJson(path.join(artifactsDir, 'assets.json'), []);
  if (Array.isArray(assets) && assets.length > 0) {
    return assets;
  }

  const catalog = await readJson(path.join(artifactsDir, 'catalog.json'), null);
  const decisions = await readJson(path.join(artifactsDir, 'decisions.json'), []);
  if (catalog && Array.isArray(decisions)) {
    return buildApprovedAssets(catalog, decisions);
  }

  return Array.isArray(assets) ? assets : [];
}

export async function loadCatalogCandidates(artifactsDir) {
  const catalog = await readJson(path.join(artifactsDir, 'catalog.json'), null);
  return Array.isArray(catalog?.candidates) ? catalog.candidates : [];
}

export function checkClassesAgainstAssets(classes, assets) {
  const usageClasses = Array.isArray(classes)
    ? classes
    : String(classes ?? '').split(/\s+/).filter(Boolean);
  const usage = {
    file: '(input)',
    line: 1,
    column: 1,
    element: 'classes',
    classes: usageClasses,
  };
  const usageSet = normalizedClassSet(usageClasses);
  let bestMatch = null;

  for (const asset of assets) {
    const signature = normalizedClassSet(asset.commonClasses);
    const deprecatedSignatures = deprecatedClassSets(asset.deprecatedClasses);

    for (const deprecatedSignature of deprecatedSignatures) {
      const similarity = jaccard(usageSet, deprecatedSignature);
      if (similarity >= SIMILARITY_THRESHOLD && (!bestMatch || bestMatch.verdict !== 'deprecated' || similarity > bestMatch.similarity)) {
        bestMatch = buildClassCheckResult('deprecated', usage, asset, deprecatedSignature, similarity);
      }
    }

    if (signature.size === 0) {
      continue;
    }

    const similarity = jaccard(usageSet, signature);
    if (similarity === 1) {
      const result = buildClassCheckResult('ok', usage, asset, signature, similarity);
      if (!bestMatch || bestMatch.verdict !== 'deprecated') {
        bestMatch = result;
      }
      continue;
    }

    if (similarity >= SIMILARITY_THRESHOLD && (!bestMatch || bestMatch.verdict !== 'deprecated' && similarity > bestMatch.similarity)) {
      bestMatch = buildClassCheckResult('near-miss', usage, asset, signature, similarity);
    }
  }

  if (bestMatch) {
    return bestMatch;
  }

  return {
    verdict: 'near-miss',
    assetName: null,
    assetId: null,
    similarity: 0,
    missingClasses: [],
    extraClasses: [...usageSet].sort(),
  };
}

function buildClassCheckResult(verdict, usage, asset, referenceSet, similarity) {
  const violation = buildViolation(verdict === 'ok' ? 'near-miss' : verdict, usage, asset, referenceSet, similarity);
  return {
    verdict,
    assetName: violation.assetName,
    assetId: violation.assetId,
    similarity,
    missingClasses: violation.missingClasses,
    extraClasses: violation.extraClasses,
  };
}

async function scanUsages(repoDir, filesOption, baseFiles = null) {
  const relativeFiles = filesOption
    ? await resolveRequestedFiles(repoDir, filesOption, baseFiles)
    : baseFiles ?? await findJsxFiles(repoDir);
  const usages = [];

  for (const relativeFile of relativeFiles) {
    const absoluteFile = path.join(repoDir, relativeFile);
    const source = await fs.readFile(absoluteFile, 'utf8');
    const analysis = analyzeSource(source, relativeFile);
    usages.push(
      ...analysis.classNameMatches.map((match) => ({ ...match, sourceType: 'className' })),
      ...analysis.cnCalls.map((call) => ({
        file: call.file,
        line: call.line,
        column: call.column,
        element: call.element === 'unknown' ? 'cn()' : call.element,
        classes: call.classes,
        signature: call.signature,
        sourceType: 'cn',
      })),
    );
  }

  return usages;
}

async function resolveRequestedFiles(repoDir, filesOption, availableFiles = null) {
  const patterns = filesOption
    .split(',')
    .map((pattern) => pattern.trim())
    .filter(Boolean);
  const allFiles = availableFiles ?? await findJsxFiles(repoDir);
  const selected = new Set();

  for (const pattern of patterns) {
    const normalized = normalizePath(pattern);
    if (hasGlobSyntax(normalized)) {
      const regex = globToRegExp(normalized);
      for (const file of allFiles) {
        if (regex.test(file)) {
          selected.add(file);
        }
      }
      continue;
    }

    selected.add(normalized);
  }

  return [...selected].sort();
}

async function resolveBaseChangedFiles(repoDir, baseRef, stderr = process.stderr) {
  try {
    await git(repoDir, ['rev-parse', '--is-inside-work-tree']);
    const outputs = await Promise.all([
      git(repoDir, ['diff', '--name-only', `${baseRef}...HEAD`]),
      git(repoDir, ['diff', '--name-only']),
      git(repoDir, ['diff', '--name-only', '--cached']),
      git(repoDir, ['ls-files', '--others', '--exclude-standard']),
    ]);
    const changed = uniqueSorted(outputs.flatMap(parseGitFiles).map(normalizePath));
    const jsxFiles = new Set(await findJsxFiles(repoDir));
    return changed.filter((file) => jsxFiles.has(file));
  } catch (error) {
    stderr?.write?.(`dsg check: could not resolve --base ${baseRef}: ${error.message}. Falling back to full scan.\n`);
    return null;
  }
}

async function git(repoDir, args) {
  const { stdout } = await execFileAsync('git', ['-C', repoDir, ...args], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  });
  return stdout;
}

function parseGitFiles(output) {
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function findNewVariantMatch(usage, usageSet, candidateEntries, roleCounts) {
  let bestMatch = null;
  let hasExactCandidateMatch = false;

  for (const entry of candidateEntries) {
    const similarity = jaccard(usageSet, entry.signature);
    if (similarity === 1) {
      hasExactCandidateMatch = true;
      continue;
    }
    if (
      similarity >= NEW_VARIANT_MIN_SIMILARITY
      && similarity <= NEW_VARIANT_MAX_SIMILARITY
      && (!bestMatch || similarity > bestMatch.similarity)
    ) {
      bestMatch = { ...entry, similarity };
    }
  }

  if (hasExactCandidateMatch || !bestMatch) {
    return null;
  }

  const existingVariants = roleCounts.get(bestMatch.role) ?? 0;
  return buildNewVariantViolation(usage, bestMatch.candidate, bestMatch.signature, bestMatch.similarity, bestMatch.role, existingVariants + 1);
}

function bestExistingViolation(deprecatedMatch, nearMissMatch) {
  if (!deprecatedMatch) {
    return nearMissMatch;
  }

  if (!nearMissMatch) {
    return deprecatedMatch;
  }

  return nearMissMatch.similarity >= deprecatedMatch.similarity ? nearMissMatch : deprecatedMatch;
}

function buildViolation(type, usage, asset, referenceSet, similarity) {
  const usageSet = normalizedClassSet(usage.classes);
  return {
    type,
    file: usage.file,
    line: usage.line,
    column: usage.column,
    element: usage.element,
    assetName: asset.name || asset.id || 'approved asset',
    assetId: asset.id,
    similarity,
    missingClasses: difference(referenceSet, usageSet),
    extraClasses: difference(usageSet, referenceSet),
  };
}

function buildNewVariantViolation(usage, candidate, referenceSet, similarity, role, nextVariantNumber) {
  const usageSet = normalizedClassSet(usage.classes);
  return {
    type: 'new-variant',
    file: usage.file,
    line: usage.line,
    column: usage.column,
    element: usage.element,
    assetName: role,
    assetId: candidate.id,
    similarity,
    missingClasses: difference(referenceSet, usageSet),
    extraClasses: difference(usageSet, referenceSet),
    role,
    nextVariantNumber,
  };
}

function candidateRole(candidate) {
  if (typeof candidate.role === 'string' && candidate.role.trim()) {
    return candidate.role.trim();
  }

  const example = candidate.source?.examples?.find((item) => typeof item.element === 'string' && item.element.trim());
  if (example) {
    return example.element.trim();
  }

  const elementTag = candidate.elementTags?.find((item) => typeof item === 'string' && item.trim());
  return elementTag?.trim() || 'UI pattern';
}

function countCandidatesByRole(candidateEntries) {
  const counts = new Map();
  for (const entry of candidateEntries) {
    counts.set(entry.role, (counts.get(entry.role) ?? 0) + 1);
  }
  return counts;
}

function violationCounts(violations) {
  const counts = new Map();
  for (const violation of violations) {
    counts.set(violation.type, (counts.get(violation.type) ?? 0) + 1);
  }
  return [...counts.entries()].sort(([left], [right]) => left.localeCompare(right));
}

function deprecatedClassSets(value) {
  if (!value) {
    return [];
  }

  if (typeof value === 'string') {
    return [normalizedClassSet(value.split(/\s+/))].filter((set) => set.size > 0);
  }

  if (Array.isArray(value)) {
    if (value.every((item) => typeof item === 'string')) {
      return [normalizedClassSet(value)].filter((set) => set.size > 0);
    }
    return value.flatMap((item) => deprecatedClassSets(item));
  }

  if (typeof value === 'object') {
    return Object.values(value).flatMap((item) => deprecatedClassSets(item));
  }

  return [];
}

function normalizedClassSet(classes) {
  return new Set((classes ?? []).map((className) => String(className).trim()).filter(Boolean));
}

function jaccard(left, right) {
  if (left.size === 0 && right.size === 0) {
    return 1;
  }

  const intersectionSize = [...left].filter((className) => right.has(className)).length;
  const unionSize = new Set([...left, ...right]).size;
  return unionSize === 0 ? 0 : intersectionSize / unionSize;
}

function difference(left, right) {
  return [...left].filter((className) => !right.has(className)).sort();
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') {
      return fallback;
    }
    throw error;
  }
}

function formatClasses(classes) {
  return classes.length > 0 ? classes.join(' ') : '(none)';
}

function inlineClasses(classes) {
  return classes.length > 0 ? classes.map((className) => `<code>${escapeHtml(className)}</code>`).join(' ') : 'none';
}

function messageFor(violation) {
  if (violation.type === 'deprecated') {
    return `${violation.assetName} の deprecated class に近い使用です。承認済み asset に合わせてください。`;
  }

  if (violation.type === 'new-variant') {
    return `既存パターンの新しい変種を発明しています。これは ${violation.role} の ${violation.nextVariantNumber} つ目の変種になります。`;
  }

  return `${violation.assetName} にほぼ一致。合わせるか、意図的な差分なら decisions に記録せよ。`;
}

function hasGlobSyntax(value) {
  return /[*?[\]]/.test(value);
}

function globToRegExp(pattern) {
  let source = '^';

  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    const next = pattern[index + 1];
    const afterNext = pattern[index + 2];

    if (char === '*' && next === '*') {
      if (afterNext === '/') {
        source += '(?:.*/)?';
        index += 2;
        continue;
      }
      source += '.*';
      index += 1;
      continue;
    }

    if (char === '*') {
      source += '[^/]*';
      continue;
    }

    if (char === '?') {
      source += '[^/]';
      continue;
    }

    source += escapeRegExp(char);
  }

  source += '$';
  return new RegExp(source);
}

function normalizePath(filePath) {
  return filePath.split(path.sep).join('/');
}

function uniqueSorted(values) {
  return [...new Set(values)].sort();
}

function escapeRegExp(value) {
  return value.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&');
}

function escapeMarkdown(value) {
  return value.replace(/\|/g, '\\|');
}

function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
