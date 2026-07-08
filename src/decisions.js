export function buildDecisionsMarkdown(catalog) {
  const lines = [
    '# Design System Decisions',
    '',
    `Generated from ${catalog.target}`,
    '',
    '## Situations',
    '',
  ];

  if (catalog.situations.length === 0) {
    lines.push('- No situations detected.');
  } else {
    for (const situation of catalog.situations) {
      lines.push(`- [ ] ${situation.title} (${situation.severity}, ${situation.safetyLevel})`);
      lines.push(`  - Response: ${situation.primaryResponse}`);
    }
  }

  lines.push('', '## Candidate Decisions', '');

  if (catalog.candidates.length === 0) {
    lines.push('- No candidates require a decision.');
  } else {
    for (const candidate of catalog.candidates) {
      lines.push(`- [ ] ${candidate.id}: ${candidate.title}`);
      lines.push(`  - Recommended action: ${candidate.recommendedAction}`);
      lines.push(`  - Suggested asset name: ${assetNameForReview(candidate)}`);
      lines.push(`  - Safety: ${candidate.safetyLevel}`);
      lines.push(`  - Occurrences: ${candidate.source.occurrences} across ${candidate.source.files} files`);
      lines.push(`  - Approve command: \`${decideCommandFor(candidate)}\``);
      lines.push(`  - Decision: undecided`);
    }
  }

  lines.push('');
  return `${lines.join('\n')}\n`;
}

export function buildInitialDecisions(catalog) {
  return catalog.candidates.map((candidate) => ({
    candidateId: candidate.id,
    clusterId: candidate.clusterId,
    recommendedAction: candidate.recommendedAction,
    userDecision: null,
    status: 'needs-decision',
    safetyLevel: candidate.safetyLevel,
  }));
}

export function buildAgentRulesMarkdown(catalog, decisions = buildInitialDecisions(catalog)) {
  const approved = approvedDecisionPairs(catalog, decisions);
  const pending = pendingCandidates(catalog, decisions);
  const lines = [
    '# UI Agent Rules',
    '',
    'These rules are generated from the local design-system inventory. Prefer existing UI assets and documented decisions before creating new one-off JSX.',
    '',
    '## Current Situations',
    '',
  ];

  if (catalog.situations.length === 0) {
    lines.push('- No UI situations detected yet.');
  } else {
    for (const situation of catalog.situations) {
      lines.push(`- ${situation.title}: ${situation.primaryResponse}.`);
    }
  }

  lines.push('', '## Approved UI Decisions', '');

  if (approved.length === 0) {
    lines.push('- No UI decisions have been approved yet. Use the pending decisions below before creating similar UI.');
  } else {
    for (const { candidate, decision } of approved) {
      lines.push(`- ${agentRuleFor(candidate, decision)}`);
    }
  }

  lines.push('', '## Pending Decisions', '');

  if (pending.length === 0) {
    lines.push('- No reusable UI candidates are pending.');
  } else {
    for (const candidate of pending) {
      lines.push(`- Review ${candidate.id} before adding similar UI: recommended action is \`${candidate.recommendedAction}\` (${candidate.safetyLevel}).`);
    }
  }

  lines.push(
    '',
    '## Safety',
    '',
    '- Do not rewrite usages automatically from this inventory alone.',
    '- Treat `unsupported` and legacy styling areas as observe-only unless the user explicitly asks for migration.',
    '- Prefer cataloged components, variants, wrappers, and blocks once decisions are approved.',
    '',
  );

  return `${lines.join('\n')}\n`;
}

function approvedDecisionPairs(catalog, decisions) {
  const candidates = new Map(catalog.candidates.map((candidate) => [candidate.id, candidate]));
  return decisions
    .filter((decision) => decision.status === 'approved' && decision.userDecision)
    .map((decision) => ({ decision, candidate: candidates.get(decision.candidateId) }))
    .filter((pair) => pair.candidate);
}

function pendingCandidates(catalog, decisions) {
  const approvedIds = new Set(
    decisions
      .filter((decision) => decision.status === 'approved' && decision.userDecision)
      .map((decision) => decision.candidateId),
  );
  return catalog.candidates.filter((candidate) => !approvedIds.has(candidate.id));
}

function agentRuleFor(candidate, decision) {
  const action = decision.userDecision;
  const assetName = decision.assetName || candidate.id;
  const classes = [...candidate.commonClasses, ...candidate.variantClasses].join(' ');
  const locations = candidate.source.examples
    .slice(0, 3)
    .map((example) => `${example.file}:${example.line}`)
    .join(', ');

  switch (action) {
    case 'reuse':
      return `Reuse ${assetName} before creating similar JSX. Reference locations: ${locations}.`;
    case 'promote-variant':
      return `Use or introduce ${assetName} as an explicit variant instead of repeating ad-hoc classes: \`${classes}\`.`;
    case 'wrap':
      return `Prefer ${assetName} as a wrapper component when this repeated override appears again. Reference locations: ${locations}.`;
    case 'extract-block':
      return `Treat ${assetName} as a domain/product block candidate and avoid recreating it inline.`;
    case 'document-rule':
      return `Follow ${assetName} as the documented local UI rule; do not make a code change unless the user asks.`;
    case 'unsupported':
      return `Observe ${assetName} only. Do not migrate or rewrite this unsupported styling/library signal without explicit user approval.`;
    default:
      return `Follow approved decision \`${action}\` for ${candidate.id}.`;
  }
}

export function buildReviewHtml(catalog) {
  const situations = catalog.situations
    .map((situation) => `
      <article class="card">
        <div class="meta">${escapeHtml(situation.severity)} / ${escapeHtml(situation.safetyLevel)}</div>
        <h2>${escapeHtml(situation.title)}</h2>
        <p>${escapeHtml(situation.primaryResponse)}</p>
        ${renderList(situation.evidence)}
      </article>
    `)
    .join('');
  const candidates = catalog.candidates
    .map((candidate) => `
      <article class="card">
        <div class="meta">${escapeHtml(candidate.id)} / ${escapeHtml(candidate.actionType)} / ${escapeHtml(candidate.safetyLevel)}</div>
        <h2>${escapeHtml(candidate.title)}</h2>
        <p>${escapeHtml(candidate.rationale)}</p>
        <p><strong>${candidate.source.occurrences}</strong> occurrences across <strong>${candidate.source.files}</strong> files</p>
        <h3>Recommended decision</h3>
        <p>Approve as <strong>${escapeHtml(candidate.recommendedAction)}</strong> and name the asset <strong>${escapeHtml(assetNameForReview(candidate))}</strong>.</p>
        <code>${escapeHtml(decideCommandFor(candidate))}</code>
        <h3>Decision options</h3>
        ${renderDecisionOptions(candidate)}
        <h3>Common classes</h3>
        <code>${escapeHtml(candidate.commonClasses.join(' ') || 'none')}</code>
        <h3>Variant classes</h3>
        <code>${escapeHtml(candidate.variantClasses.join(' ') || 'none')}</code>
        <h3>Source locations</h3>
        ${renderExamples(candidate.source.examples)}
      </article>
    `)
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>design-system-grower review</title>
  <style>
    body { margin: 0; font: 14px/1.5 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #18181b; background: #f4f4f5; }
    header { padding: 28px 32px; background: #fff; border-bottom: 1px solid #e4e4e7; }
    main { display: grid; grid-template-columns: 320px 1fr; gap: 24px; padding: 24px 32px; }
    h1 { margin: 0 0 6px; font-size: 24px; }
    h2 { margin: 4px 0 8px; font-size: 16px; }
    h3 { margin: 14px 0 6px; font-size: 12px; color: #3f3f46; text-transform: uppercase; letter-spacing: .04em; }
    p { margin: 0 0 10px; color: #52525b; }
    ul { margin: 8px 0 0; padding-left: 18px; color: #52525b; }
    li { margin: 4px 0; }
    a { color: #18181b; text-decoration-thickness: 1px; text-underline-offset: 2px; }
    code { display: block; white-space: pre-wrap; padding: 10px; border-radius: 6px; background: #f4f4f5; color: #27272a; }
    strong { color: #18181b; }
    .stack { display: grid; gap: 12px; }
    .card { padding: 16px; border: 1px solid #e4e4e7; border-radius: 8px; background: #fff; }
    .meta { color: #71717a; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; }
    .decision-options { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0 0; padding: 0; list-style: none; }
    .decision-options li { margin: 0; padding: 4px 8px; border: 1px solid #d4d4d8; border-radius: 999px; background: #fafafa; color: #3f3f46; font-size: 12px; }
    .decision-options .recommended { border-color: #18181b; color: #18181b; font-weight: 600; }
    .artifact-links { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 14px; }
    .artifact-links a { font-size: 12px; color: #3f3f46; }
    .location { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; color: #27272a; }
  </style>
</head>
<body>
  <header>
    <h1>design-system-grower review</h1>
    <p>${catalog.summary.filesScanned} files scanned, ${catalog.summary.situations} situations, ${catalog.summary.candidates} candidates.</p>
    ${renderArtifactLinks()}
  </header>
  <main>
    <section class="stack">
      <h2>Situations</h2>
      ${situations || '<p>No situations detected.</p>'}
    </section>
    <section class="stack">
      <h2>Needs Your Decision</h2>
      ${candidates || '<p>No candidates detected.</p>'}
    </section>
  </main>
</body>
</html>
`;
}

function renderList(items = []) {
  if (items.length === 0) {
    return '';
  }

  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
}

function renderExamples(examples = []) {
  if (examples.length === 0) {
    return '<p>No source locations.</p>';
  }

  return `<ul>${examples.map((example) => `
    <li>
      <span class="location">${escapeHtml(example.file)}:${example.line}:${example.column}</span>
      ${escapeHtml(example.element)} / ${escapeHtml(example.sourceType)}
    </li>
  `).join('')}</ul>`;
}

function renderArtifactLinks() {
  const artifacts = [
    'catalog.json',
    'inventory.json',
    'situations.json',
    'candidates.json',
    'decisions.json',
    'assets.json',
    'assets.md',
    'decisions.md',
    'agent-rules.md',
  ];
  return `<nav class="artifact-links" aria-label="Generated artifacts">${artifacts.map((artifact) => `<a href="./${artifact}">${artifact}</a>`).join('')}</nav>`;
}

const DECISION_ACTIONS = [
  'reuse',
  'promote-variant',
  'wrap',
  'extract-block',
  'document-rule',
  'ignore',
  'unsupported',
];

function renderDecisionOptions(candidate) {
  return `<ul class="decision-options">${DECISION_ACTIONS.map((action) => {
    const className = action === candidate.recommendedAction ? ' class="recommended"' : '';
    return `<li${className}>${escapeHtml(action)}</li>`;
  }).join('')}</ul>`;
}

function decideCommandFor(candidate) {
  return `dsg decide design-system ${candidate.id} ${candidate.recommendedAction} --name ${assetNameForReview(candidate)}`;
}

function assetNameForReview(candidate) {
  return candidate.assetNameSuggestion || candidate.id;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
