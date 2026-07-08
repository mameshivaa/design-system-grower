import fs from 'node:fs/promises';
import path from 'node:path';
import { buildApprovedAssets, buildAssetsMarkdown } from './assets.js';
import { buildAgentRulesMarkdown } from './decisions.js';

export const VALID_ACTIONS = new Set([
  'reuse',
  'promote-variant',
  'wrap',
  'extract-block',
  'document-rule',
  'canonicalize',
  'ignore',
  'unsupported',
]);

export async function saveDecision(artifactsDir, input) {
  const resolvedArtifactsDir = path.resolve(artifactsDir);
  const catalog = JSON.parse(await fs.readFile(path.join(resolvedArtifactsDir, 'catalog.json'), 'utf8'));
  const decisionsPath = path.join(resolvedArtifactsDir, 'decisions.json');
  const decisions = JSON.parse(await fs.readFile(decisionsPath, 'utf8'));
  const updatedDecisions = approveDecision(
    catalog,
    decisions,
    input.candidateId,
    input.decision,
    input.assetName,
    input.side,
  );
  await fs.writeFile(decisionsPath, `${JSON.stringify(updatedDecisions, null, 2)}\n`, 'utf8');
  await writeAssetArtifacts(resolvedArtifactsDir, catalog, updatedDecisions);
  const rules = buildAgentRulesMarkdown(catalog, updatedDecisions);
  await fs.writeFile(path.join(resolvedArtifactsDir, 'agent-rules.md'), rules, 'utf8');
  return updatedDecisions.find((decision) => decision.candidateId === input.candidateId);
}

export async function writeAssetArtifacts(artifactsDir, catalog, decisions) {
  const assets = buildApprovedAssets(catalog, decisions);
  await fs.writeFile(path.join(artifactsDir, 'assets.json'), `${JSON.stringify(assets, null, 2)}\n`, 'utf8');
  await fs.writeFile(path.join(artifactsDir, 'assets.md'), buildAssetsMarkdown(assets), 'utf8');
}

function approveDecision(catalog, decisions, candidateId, userDecision, assetName, side) {
  if (!VALID_ACTIONS.has(userDecision)) {
    throw new Error(`Unknown decision action: ${userDecision}`);
  }

  const candidate = catalog.candidates.find((item) => item.id === candidateId);
  if (!candidate) {
    throw new Error(`Unknown candidate: ${candidateId}`);
  }

  const decisionIndex = decisions.findIndex((decision) => decision.candidateId === candidateId);
  if (decisionIndex === -1) {
    throw new Error(`No decision row found for candidate: ${candidateId}`);
  }

  const updated = decisions.slice();
  const canonicalizeDecision = userDecision === 'canonicalize'
    ? buildCanonicalizeDecision(candidate, side)
    : {};

  updated[decisionIndex] = {
    ...updated[decisionIndex],
    userDecision,
    status: 'approved',
    ...(assetName ? { assetName } : {}),
    ...canonicalizeDecision,
  };
  return updated;
}

function buildCanonicalizeDecision(candidate, side) {
  if (!Array.isArray(candidate.sides) || candidate.sides.length < 2) {
    throw new Error(`Candidate ${candidate.id} does not include competing sides`);
  }

  const canonicalSideNumber = side === undefined || side === null
    ? candidate.recommendedSide
    : Number(side);
  if (!Number.isInteger(canonicalSideNumber)) {
    throw new Error('--side must be an integer side number for canonicalize decisions');
  }

  const canonical = candidate.sides.find((candidateSide) => candidateSide.side === canonicalSideNumber);
  if (!canonical) {
    throw new Error(`Unknown side ${canonicalSideNumber} for ${candidate.id}`);
  }

  const deprecated = candidate.sides.filter((candidateSide) => candidateSide.side !== canonicalSideNumber);

  return {
    canonicalSide: {
      side: canonical.side,
      occurrences: canonical.occurrences,
      classes: canonical.classes,
      representativeSource: canonical.representativeSource,
    },
    deprecatedSides: deprecated.map((deprecatedSide) => ({
      side: deprecatedSide.side,
      occurrences: deprecatedSide.occurrences,
      classes: deprecatedSide.classes,
      representativeSource: deprecatedSide.representativeSource,
    })),
    canonicalClasses: canonical.classes,
    deprecatedClasses: deprecated.flatMap((deprecatedSide) => deprecatedSide.classes),
  };
}
