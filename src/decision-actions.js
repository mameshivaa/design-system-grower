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

function approveDecision(catalog, decisions, candidateId, userDecision, assetName) {
  if (!VALID_ACTIONS.has(userDecision)) {
    throw new Error(`Unknown decision action: ${userDecision}`);
  }

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
