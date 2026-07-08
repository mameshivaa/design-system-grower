import fs from 'node:fs/promises';
import path from 'node:path';
import { buildApprovedAssets, buildAssetsMarkdown } from './assets.js';
import { buildCandidates } from './candidates.js';
import { clusterClassNameMatches } from './cluster.js';
import { detectCompetingFamilies } from './drift.js';
import {
  buildAgentRulesMarkdown,
  buildDecisionsMarkdown,
  buildInitialDecisions,
  buildReviewHtml,
} from './decisions.js';
import { analyzeSource } from './extractor.js';
import { buildInventory, isExistingDesignSystemSource } from './inventory.js';
import { summarizeRoles } from './roles.js';
import { findJsxFiles } from './scanner.js';
import { diagnoseSituations } from './situations.js';

export async function buildCatalog(targetDir, options = {}) {
  const rootDir = path.resolve(targetDir);
  const files = await findJsxFiles(rootDir, options);
  const analyses = [];

  for (const relativeFile of files) {
    const absoluteFile = path.join(rootDir, relativeFile);
    const source = await fs.readFile(absoluteFile, 'utf8');
    analyses.push(analyzeSource(source, relativeFile));
  }

  const candidateAnalyses = analyses.filter((analysis) => !isExistingDesignSystemSource(analysis));
  const elements = candidateAnalyses.flatMap((analysis) => [
    ...analysis.classNameMatches.map((match) => ({ ...match, sourceType: 'className' })),
    ...analysis.cnCalls.map((call) => ({
      file: call.file,
      line: call.line,
      column: call.column,
      element: call.element === 'unknown' ? 'cn()' : call.element,
      className: call.source,
      classes: call.classes,
      signature: call.signature,
      sourceType: 'cn',
    })),
  ]);
  const clusters = clusterClassNameMatches(elements, {
    minimumOccurrences: options.minimumOccurrences,
  });
  const competingFamilies = detectCompetingFamilies(elements);
  const inventory = buildInventory(analyses);
  const situations = diagnoseSituations(inventory, clusters);
  const candidates = buildCandidates(clusters, situations, competingFamilies);

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    target: rootDir,
    summary: {
      filesScanned: files.length,
      elementsWithClassName: elements.length,
      duplicateClusters: clusters.length,
      situations: situations.length,
      candidates: candidates.length,
      competingFamilies: competingFamilies.length,
      roles: summarizeRoles(candidates),
    },
    inventory,
    situations,
    candidates,
    clusters,
    competingFamilies,
  };
}

export async function writeCatalog(catalog, outputPath) {
  const resolvedOutput = path.resolve(outputPath);
  await fs.mkdir(path.dirname(resolvedOutput), { recursive: true });
  await fs.writeFile(resolvedOutput, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
  return resolvedOutput;
}

export async function writeDesignSystemArtifacts(catalog, outputDir, options = {}) {
  const resolvedOutputDir = path.resolve(outputDir);
  await fs.mkdir(resolvedOutputDir, { recursive: true });
  const decisions = await decisionsForCatalog(catalog, resolvedOutputDir, options);
  const assets = buildApprovedAssets(catalog, decisions);

  const artifacts = [
    ['inventory.json', catalog.inventory],
    ['situations.json', catalog.situations],
    ['candidates.json', catalog.candidates],
    ['decisions.json', decisions],
    ['assets.json', assets],
    ['assets.md', buildAssetsMarkdown(assets)],
    ['decisions.md', buildDecisionsMarkdown(catalog)],
    ['agent-rules.md', buildAgentRulesMarkdown(catalog, decisions)],
    ['review.html', buildReviewHtml(catalog)],
  ];

  for (const [fileName, contents] of artifacts) {
    const filePath = path.join(resolvedOutputDir, fileName);
    const serialized = typeof contents === 'string' ? contents : `${JSON.stringify(contents, null, 2)}\n`;
    await fs.writeFile(filePath, serialized, 'utf8');
  }

  return resolvedOutputDir;
}

async function decisionsForCatalog(catalog, outputDir, options) {
  const initialDecisions = buildInitialDecisions(catalog);

  if (!options.preserveDecisions) {
    return initialDecisions;
  }

  const existingDecisions = await readExistingDecisions(path.join(outputDir, 'decisions.json'));
  if (!existingDecisions) {
    return initialDecisions;
  }

  const existingByCandidate = new Map(
    existingDecisions
      .filter((decision) => decision?.candidateId)
      .map((decision) => [decision.candidateId, decision]),
  );
  const currentCandidateIds = new Set(initialDecisions.map((decision) => decision.candidateId));
  const merged = initialDecisions.map((decision) => ({
    ...decision,
    ...(existingByCandidate.get(decision.candidateId) ?? {}),
    clusterId: decision.clusterId,
    recommendedAction: decision.recommendedAction,
    safetyLevel: decision.safetyLevel,
  }));
  const carriedForward = existingDecisions.filter((decision) => (
    decision?.candidateId && !currentCandidateIds.has(decision.candidateId)
  ));

  return [...merged, ...carriedForward];
}

async function readExistingDecisions(decisionsPath) {
  try {
    const decisions = JSON.parse(await fs.readFile(decisionsPath, 'utf8'));
    return Array.isArray(decisions) ? decisions : null;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}
