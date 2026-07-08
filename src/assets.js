export function buildApprovedAssets(catalog, decisions = []) {
  const candidates = new Map(catalog.candidates.map((candidate) => [candidate.id, candidate]));

  return decisions
    .filter((decision) => decision.status === 'approved' && decision.userDecision)
    .map((decision) => {
      const candidate = candidates.get(decision.candidateId);
      if (!candidate) {
        return null;
      }

      const name = decision.assetName || defaultAssetName(candidate);
      return {
        id: `asset-${candidate.id.replace(/^candidate-/, '')}`,
        name,
        candidateId: candidate.id,
        actionType: decision.userDecision,
        safetyLevel: candidate.safetyLevel,
        status: 'approved',
        usageGuidance: usageGuidanceFor(name, candidate, decision.userDecision),
        commonClasses: candidate.commonClasses,
        variantClasses: candidate.variantClasses,
        source: candidate.source,
      };
    })
    .filter(Boolean);
}

export function buildAssetsMarkdown(assets) {
  const lines = ['# UI Assets', ''];

  if (assets.length === 0) {
    lines.push('No UI assets have been approved yet.', '');
    return lines.join('\n');
  }

  for (const asset of assets) {
    lines.push(`## ${asset.name}`);
    lines.push('');
    lines.push(`- Asset ID: ${asset.id}`);
    lines.push(`- Candidate: ${asset.candidateId}`);
    lines.push(`- Action: ${asset.actionType}`);
    lines.push(`- Safety: ${asset.safetyLevel}`);
    lines.push(`- Guidance: ${asset.usageGuidance}`);
    if (asset.commonClasses.length > 0) {
      lines.push(`- Common classes: \`${asset.commonClasses.join(' ')}\``);
    }
    if (asset.variantClasses.length > 0) {
      lines.push(`- Variant classes: \`${asset.variantClasses.join(' ')}\``);
    }
    lines.push('- Sources:');
    for (const example of asset.source.examples.slice(0, 5)) {
      lines.push(`  - ${example.file}:${example.line}:${example.column} (${example.element})`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function defaultAssetName(candidate) {
  if (candidate.assetNameSuggestion) {
    return candidate.assetNameSuggestion;
  }

  const primaryElement = candidate.source.examples[0]?.element ?? candidate.id;
  const normalized = primaryElement
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join('');

  return normalized || candidate.id;
}

function usageGuidanceFor(name, candidate, actionType) {
  switch (actionType) {
    case 'promote-variant':
      return `Use ${name} as the named variant/pattern for this repeated class structure instead of recreating ad-hoc classes.`;
    case 'wrap':
      return `Use ${name} as the wrapper component concept for this repeated override.`;
    case 'extract-block':
      return `Use ${name} as the domain/product block concept before recreating this UI inline.`;
    case 'reuse':
      return `Reuse ${name} before adding similar JSX.`;
    case 'document-rule':
      return `Follow ${name} as a documented UI rule.`;
    case 'unsupported':
      return `Keep ${name} observe-only until explicit migration work is approved.`;
    default:
      return `Follow approved UI asset ${name} for ${candidate.id}.`;
  }
}
