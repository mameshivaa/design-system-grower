import { buildApprovedAssets } from './assets.js';

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
      if (candidate.actionType === 'canonicalize' && candidate.sides?.length) {
        lines.push(`  - Recommended canonical side: ${candidate.recommendedSide}`);
        for (const side of candidate.sides) {
          lines.push(`  - Side ${side.side}: ${side.occurrences} uses, \`${side.classes.join(' ')}\``);
        }
      }
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
    ...(candidate.driftId ? { driftId: candidate.driftId } : {}),
    ...(candidate.recommendedSide ? { recommendedSide: candidate.recommendedSide } : {}),
  }));
}

export function buildAgentRulesMarkdown(catalog, decisions = buildInitialDecisions(catalog)) {
  const approved = approvedDecisionPairs(catalog, decisions);
  const approvedAssets = buildApprovedAssets(catalog, decisions);
  const assetsByCandidate = new Map(approvedAssets.map((asset) => [asset.candidateId, asset]));
  const pending = pendingCandidates(catalog, decisions);
  const lines = [
    '# UI Agent Rules',
    '',
    'These rules are generated from the local design-system inventory. Prefer existing UI assets and documented decisions before creating new one-off JSX.',
    '',
    'Machine-readable data: `assets.json` (approved UI assets) and `catalog.json` (full scan result) in this directory.',
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
      const asset = assetsByCandidate.get(candidate.id);
      lines.push(`### ${decision.assetName || candidate.id}`, '');
      lines.push(`- Rule: ${agentRuleFor(candidate, decision)}`);
      lines.push(`- Action: \`${decision.userDecision}\``);
      if (asset?.elementTags?.length) {
        lines.push(`- Elements: ${asset.elementTags.map((element) => `\`${element}\``).join(', ')}`);
      }
      if (candidate.commonClasses.length > 0) {
        lines.push(`- Common classes: \`${candidate.commonClasses.join(' ')}\``);
      }
      if (decision.canonicalClasses?.length) {
        lines.push(`- Canonical classes: \`${decision.canonicalClasses.join(' ')}\``);
      }
      if (decision.deprecatedClasses?.length) {
        lines.push(`- Deprecated classes: \`${decision.deprecatedClasses.join(' ')}\``);
      }
      if (candidate.variantClasses.length > 0) {
        lines.push(`- Variant classes: \`${candidate.variantClasses.join(' ')}\``);
      }
      const locations = candidate.source.examples
        .slice(0, 3)
        .map((example) => `${example.file}:${example.line}`)
        .join(', ');
      if (locations) {
        lines.push(`- Reference locations: ${locations}`);
      }
      if (asset?.usageExample?.snippet) {
        lines.push('- Representative usage:', '', '```jsx', asset.usageExample.snippet, '```');
      }
      lines.push('');
    }
  }

  lines.push('', '## Pending Decisions', '');

  if (pending.length === 0) {
    lines.push('- No reusable UI candidates are pending.');
  } else {
    lines.push(
      `- ${pending.length} candidate${pending.length === 1 ? ' is' : 's are'} pending review. Run \`dsg review <design-system-dir>\` to decide them; see \`decisions.md\` for the full checklist.`,
    );
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

  switch (action) {
    case 'reuse':
      return `Reuse ${assetName} before creating similar JSX.`;
    case 'promote-variant':
      return `Use or introduce ${assetName} as an explicit variant instead of repeating ad-hoc classes.`;
    case 'wrap':
      return `Prefer ${assetName} as a wrapper component when this repeated override appears again.`;
    case 'extract-block':
      return `Treat ${assetName} as a domain/product block candidate and avoid recreating it inline.`;
    case 'document-rule':
      return `Follow ${assetName} as the documented local UI rule; do not make a code change unless the user asks.`;
    case 'canonicalize':
      return canonicalizeRuleFor(assetName, candidate, decision);
    case 'unsupported':
      return `Observe ${assetName} only. Do not migrate or rewrite this unsupported styling/library signal without explicit user approval.`;
    default:
      return `Follow approved decision \`${action}\` for ${candidate.id}.`;
  }
}

function canonicalizeRuleFor(assetName, candidate, decision) {
  const canonicalClasses = decision.canonicalClasses ?? canonicalSideFor(candidate, decision)?.classes ?? [];
  const deprecatedClasses = decision.deprecatedClasses ?? deprecatedSidesFor(candidate, decision).flatMap((side) => side.classes);
  return `Use ${assetName} (${canonicalClasses.join(' ')}). The ${deprecatedClasses.join(' ')} family is deprecated — do not use it in new code.`;
}

function canonicalSideFor(candidate, decision) {
  const sideNumber = decision.canonicalSide?.side ?? decision.canonicalSide ?? candidate.recommendedSide;
  return candidate.sides?.find((side) => side.side === sideNumber);
}

function deprecatedSidesFor(candidate, decision) {
  const canonical = canonicalSideFor(candidate, decision);
  return candidate.sides?.filter((side) => side.side !== canonical?.side) ?? [];
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
  const sortedCandidates = sortedReviewCandidates(catalog.candidates);
  const initialCandidates = sortedCandidates.slice(0, 20);
  const candidates = renderCandidateGroups(initialCandidates, catalog.candidates);

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
    button, input, select { font: inherit; }
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
    .card.drift-card { border-color: #f59e0b; background: #fffbeb; }
    .side-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
    .side-panel { padding: 10px; border: 1px solid #fde68a; border-radius: 6px; background: #fff; }
    .side-panel.recommended { border-color: #18181b; }
    .candidate-group { display: grid; gap: 10px; }
    .group-heading { display: flex; align-items: center; gap: 8px; margin: 10px 0 0; font-size: 13px; color: #27272a; }
    .badge { display: inline-flex; align-items: center; border: 1px solid #d4d4d8; border-radius: 999px; padding: 1px 8px; color: #52525b; font-size: 12px; background: #fff; }
    .meta { color: #71717a; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; }
    .score { color: #27272a; font-weight: 600; }
    .decision-options { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0 0; padding: 0; list-style: none; }
    .decision-options li { margin: 0; padding: 4px 8px; border: 1px solid #d4d4d8; border-radius: 999px; background: #fafafa; color: #3f3f46; font-size: 12px; }
    .decision-options .recommended { border-color: #18181b; color: #18181b; font-weight: 600; }
    .artifact-links { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 14px; }
    .artifact-links a { font-size: 12px; color: #3f3f46; }
    .location { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; color: #27272a; }
    .toolbar { display: flex; align-items: center; gap: 10px; margin: 0 0 4px; }
    .toolbar p { margin: 0; }
    .button { border: 1px solid #d4d4d8; border-radius: 6px; background: #fff; color: #18181b; padding: 6px 10px; cursor: pointer; }
    .button.primary { border-color: #18181b; background: #18181b; color: #fff; }
    .button:disabled { cursor: default; opacity: .6; }
    .command-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; align-items: start; }
    .decide-form { display: grid; grid-template-columns: minmax(120px, 180px) minmax(140px, 1fr) minmax(72px, 90px) auto; gap: 8px; margin-top: 8px; }
    .decide-form input, .decide-form select { min-width: 0; border: 1px solid #d4d4d8; border-radius: 6px; padding: 6px 8px; background: #fff; }
    .snippet { overflow: auto; max-height: 180px; border: 1px solid #e4e4e7; border-radius: 6px; background: #fafafa; }
    .snippet code { display: grid; gap: 0; padding: 8px 0; background: transparent; }
    .snippet-line { display: grid; grid-template-columns: 48px minmax(0, 1fr); gap: 8px; padding: 0 10px; white-space: pre; }
    .snippet-line mark { background: #fef3c7; color: inherit; }
    .snippet-line-number { color: #71717a; text-align: right; user-select: none; }
    .status-message { min-height: 18px; color: #52525b; font-size: 12px; }
    @media (max-width: 860px) {
      main { grid-template-columns: 1fr; padding: 18px; }
      header { padding: 22px 18px; }
      .decide-form { grid-template-columns: 1fr; }
      .command-row { grid-template-columns: 1fr; }
    }
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
      <div class="toolbar">
        <p id="candidate-summary">${initialCandidates.length} of ${catalog.candidates.length} candidates shown.</p>
        ${catalog.candidates.length > initialCandidates.length ? '<button class="button" id="show-all" type="button">Show all</button>' : ''}
      </div>
      <div id="candidate-list">
      ${candidates || '<p>No candidates detected.</p>'}
      </div>
    </section>
  </main>
  <script>
${reviewClientScript()}
  </script>
</body>
</html>
`;
}

function renderCandidateGroups(candidates, allCandidates = candidates) {
  return groupCandidates(candidates, allCandidates)
    .map((group) => `
      <section class="candidate-group" data-review-group="${escapeHtml(group.key)}">
        <h3 class="group-heading">${escapeHtml(group.label)} <span class="badge">${group.items.length}${allCandidates.length === candidates.length ? '' : ` of ${group.total}`} candidates</span></h3>
        ${group.items.map(renderCandidateCard).join('')}
      </section>
    `)
    .join('');
}

function renderCandidateCard(candidate) {
  if (candidate.actionType === 'canonicalize') {
    return renderDriftCandidateCard(candidate);
  }

  const command = decideCommandFor(candidate);
  return `
    <article class="card candidate-card" data-candidate-id="${escapeHtml(candidate.id)}" data-example-index="0">
      <div class="meta">${escapeHtml(candidate.id)} / ${escapeHtml(candidate.actionType)} / ${escapeHtml(categoryFor(candidate))} / ${escapeHtml(candidate.safetyLevel)} / <span class="score">score ${scoreFor(candidate)}</span></div>
      <h2>${escapeHtml(candidate.title)}</h2>
      <p>${escapeHtml(candidate.rationale)}</p>
      <p><strong>${candidate.source.occurrences}</strong> occurrences across <strong>${candidate.source.files}</strong> files</p>
      <h3>Recommended decision</h3>
      <p>Approve as <strong>${escapeHtml(candidate.recommendedAction)}</strong> and name the asset <strong>${escapeHtml(assetNameForReview(candidate))}</strong>.</p>
      <div class="command-row">
        <code>${escapeHtml(command)}</code>
        <button class="button copy-command" type="button" data-command="${escapeHtml(command)}">Copy</button>
      </div>
      <form class="decide-form">
        <select name="decision" aria-label="Decision">
          ${DECISION_ACTIONS.map((action) => `<option value="${escapeHtml(action)}"${action === candidate.recommendedAction ? ' selected' : ''}>${escapeHtml(action)}</option>`).join('')}
        </select>
        <input name="assetName" aria-label="Asset name" value="${escapeHtml(assetNameForReview(candidate))}">
        <input name="side" aria-label="Canonical side" value="" hidden>
        <button class="button primary" type="submit">Approve</button>
      </form>
      <p class="status-message" role="status"></p>
      <h3>Decision options</h3>
      ${renderDecisionOptions(candidate)}
      <h3>Source snippet</h3>
      <div class="snippet" data-snippet><code>Loading snippet...</code></div>
      <h3>Common classes</h3>
      <code>${escapeHtml(candidate.commonClasses.join(' ') || 'none')}</code>
      <h3>Variant classes</h3>
      <code>${escapeHtml(candidate.variantClasses.join(' ') || 'none')}</code>
      <h3>Source locations</h3>
      ${renderExamples(candidate.source.examples)}
    </article>
  `;
}

function renderDriftCandidateCard(candidate) {
  const command = decideCommandFor(candidate);
  return `
    <article class="card candidate-card drift-card" data-candidate-id="${escapeHtml(candidate.id)}" data-example-index="0">
      <div class="meta">${escapeHtml(candidate.id)} / canonicalize / drift / ${escapeHtml(candidate.safetyLevel)} / <span class="score">score ${scoreFor(candidate)}</span></div>
      <h2>${escapeHtml(candidate.title)}</h2>
      <p>${escapeHtml(candidate.rationale)}</p>
      <p><strong>${candidate.source.occurrences}</strong> occurrences across <strong>${candidate.source.files}</strong> files. Recommended side: <strong>${escapeHtml(candidate.recommendedSide)}</strong>.</p>
      <div class="side-grid">
        ${candidate.sides.map((side) => `
          <section class="side-panel${side.side === candidate.recommendedSide ? ' recommended' : ''}">
            <h3>Side ${side.side}${side.side === candidate.recommendedSide ? ' (recommended)' : ''}</h3>
            <p><strong>${side.occurrences}</strong> uses across <strong>${side.files}</strong> files</p>
            <code>${escapeHtml(side.classes.join(' '))}</code>
            <p class="location">${escapeHtml(side.representativeSource.file)}:${side.representativeSource.line}:${side.representativeSource.column}</p>
          </section>
        `).join('')}
      </div>
      <h3>Approve canonical side</h3>
      <div class="command-row">
        <code>${escapeHtml(command)}</code>
        <button class="button copy-command" type="button" data-command="${escapeHtml(command)}">Copy</button>
      </div>
      <form class="decide-form">
        <select name="decision" aria-label="Decision">
          ${DECISION_ACTIONS.map((action) => `<option value="${escapeHtml(action)}"${action === candidate.recommendedAction ? ' selected' : ''}>${escapeHtml(action)}</option>`).join('')}
        </select>
        <input name="assetName" aria-label="Asset name" value="${escapeHtml(assetNameForReview(candidate))}">
        <input name="side" aria-label="Canonical side" value="${escapeHtml(candidate.recommendedSide)}">
        <button class="button primary" type="submit">Approve</button>
      </form>
      <p class="status-message" role="status"></p>
      <h3>Source snippet</h3>
      <div class="snippet" data-snippet><code>Loading snippet...</code></div>
      <h3>Source locations</h3>
      ${renderExamples(candidate.source.examples)}
    </article>
  `;
}

function sortedReviewCandidates(candidates) {
  return candidates
    .slice()
    .sort((a, b) => scoreFor(b) - scoreFor(a) || (b.source?.occurrences ?? 0) - (a.source?.occurrences ?? 0) || a.id.localeCompare(b.id));
}

function groupCandidates(candidates, allCandidates = candidates) {
  const fullCounts = new Map();
  for (const candidate of allCandidates) {
    const key = groupKeyFor(candidate);
    fullCounts.set(key, (fullCounts.get(key) ?? 0) + 1);
  }

  const groups = new Map();
  for (const candidate of sortedReviewCandidates(candidates)) {
    const key = groupKeyFor(candidate);
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        label: groupLabelFor(candidate),
        total: fullCounts.get(key) ?? 0,
        items: [],
      });
    }
    groups.get(key).items.push(candidate);
  }
  return [...groups.values()];
}

function groupKeyFor(candidate) {
  return `${candidate.actionType || 'unknown'}:${categoryFor(candidate)}`;
}

function groupLabelFor(candidate) {
  return `${candidate.actionType || 'unknown'} / ${categoryFor(candidate)}`;
}

function categoryFor(candidate) {
  return candidate.categories?.[0]?.category ?? candidate.categories?.[0]?.name ?? candidate.categories?.[0] ?? 'uncategorized';
}

function scoreFor(candidate) {
  return Number(candidate.score ?? 0);
}

function reviewClientScript() {
  return `
const decisionActions = ${JSON.stringify(DECISION_ACTIONS)};
const initialLimit = 20;
const candidateList = document.getElementById('candidate-list');
const candidateSummary = document.getElementById('candidate-summary');
const showAllButton = document.getElementById('show-all');
let snippetObserver;

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function scoreFor(candidate) {
  return Number(candidate.score ?? 0);
}

function categoryFor(candidate) {
  const first = candidate.categories && candidate.categories[0];
  if (!first) return 'uncategorized';
  if (typeof first === 'string') return first;
  return first.category || first.name || 'uncategorized';
}

function assetNameFor(candidate) {
  return candidate.assetNameSuggestion || candidate.id;
}

function decideCommandFor(candidate) {
  const side = candidate.actionType === 'canonicalize' ? ' --side ' + candidate.recommendedSide : '';
  return 'dsg decide design-system ' + candidate.id + ' ' + candidate.recommendedAction + ' --name ' + assetNameFor(candidate) + side;
}

function sortedReviewCandidates(candidates) {
  return candidates.slice().sort((a, b) => scoreFor(b) - scoreFor(a) || ((b.source && b.source.occurrences) || 0) - ((a.source && a.source.occurrences) || 0) || a.id.localeCompare(b.id));
}

function groupKeyFor(candidate) {
  return (candidate.actionType || 'unknown') + ':' + categoryFor(candidate);
}

function groupLabelFor(candidate) {
  return (candidate.actionType || 'unknown') + ' / ' + categoryFor(candidate);
}

function groupCandidates(candidates, allCandidates) {
  const counts = new Map();
  for (const candidate of allCandidates) {
    const key = groupKeyFor(candidate);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const groups = new Map();
  for (const candidate of sortedReviewCandidates(candidates)) {
    const key = groupKeyFor(candidate);
    if (!groups.has(key)) {
      groups.set(key, { key, label: groupLabelFor(candidate), total: counts.get(key) || 0, items: [] });
    }
    groups.get(key).items.push(candidate);
  }
  return Array.from(groups.values());
}

function renderDecisionOptions(candidate) {
  return '<ul class="decision-options">' + decisionActions.map((action) => {
    const className = action === candidate.recommendedAction ? ' class="recommended"' : '';
    return '<li' + className + '>' + escapeHtml(action) + '</li>';
  }).join('') + '</ul>';
}

function renderExamples(examples) {
  if (!examples || examples.length === 0) {
    return '<p>No source locations.</p>';
  }
  return '<ul>' + examples.map((example) => (
    '<li><span class="location">' + escapeHtml(example.file) + ':' + escapeHtml(example.line) + ':' + escapeHtml(example.column) + '</span> ' +
    escapeHtml(example.element) + ' / ' + escapeHtml(example.sourceType) + '</li>'
  )).join('') + '</ul>';
}

function renderCandidateCard(candidate) {
  if (candidate.actionType === 'canonicalize') {
    return renderDriftCandidateCard(candidate);
  }

  const command = decideCommandFor(candidate);
  const options = decisionActions.map((action) => '<option value="' + escapeHtml(action) + '"' + (action === candidate.recommendedAction ? ' selected' : '') + '>' + escapeHtml(action) + '</option>').join('');
  return '<article class="card candidate-card" data-candidate-id="' + escapeHtml(candidate.id) + '" data-example-index="0">' +
    '<div class="meta">' + escapeHtml(candidate.id) + ' / ' + escapeHtml(candidate.actionType) + ' / ' + escapeHtml(categoryFor(candidate)) + ' / ' + escapeHtml(candidate.safetyLevel) + ' / <span class="score">score ' + scoreFor(candidate) + '</span></div>' +
    '<h2>' + escapeHtml(candidate.title) + '</h2>' +
    '<p>' + escapeHtml(candidate.rationale) + '</p>' +
    '<p><strong>' + escapeHtml(candidate.source && candidate.source.occurrences) + '</strong> occurrences across <strong>' + escapeHtml(candidate.source && candidate.source.files) + '</strong> files</p>' +
    '<h3>Recommended decision</h3>' +
    '<p>Approve as <strong>' + escapeHtml(candidate.recommendedAction) + '</strong> and name the asset <strong>' + escapeHtml(assetNameFor(candidate)) + '</strong>.</p>' +
    '<div class="command-row"><code>' + escapeHtml(command) + '</code><button class="button copy-command" type="button" data-command="' + escapeHtml(command) + '">Copy</button></div>' +
    '<form class="decide-form"><select name="decision" aria-label="Decision">' + options + '</select><input name="assetName" aria-label="Asset name" value="' + escapeHtml(assetNameFor(candidate)) + '"><input name="side" aria-label="Canonical side" value="" hidden><button class="button primary" type="submit">Approve</button></form>' +
    '<p class="status-message" role="status"></p>' +
    '<h3>Decision options</h3>' + renderDecisionOptions(candidate) +
    '<h3>Source snippet</h3><div class="snippet" data-snippet><code>Loading snippet...</code></div>' +
    '<h3>Common classes</h3><code>' + escapeHtml(((candidate.commonClasses || []).join(' ')) || 'none') + '</code>' +
    '<h3>Variant classes</h3><code>' + escapeHtml(((candidate.variantClasses || []).join(' ')) || 'none') + '</code>' +
    '<h3>Source locations</h3>' + renderExamples(candidate.source && candidate.source.examples) +
    '</article>';
}

function renderDriftCandidateCard(candidate) {
  const command = decideCommandFor(candidate);
  const options = decisionActions.map((action) => '<option value="' + escapeHtml(action) + '"' + (action === candidate.recommendedAction ? ' selected' : '') + '>' + escapeHtml(action) + '</option>').join('');
  const sides = (candidate.sides || []).map((side) => (
    '<section class="side-panel' + (side.side === candidate.recommendedSide ? ' recommended' : '') + '">' +
    '<h3>Side ' + escapeHtml(side.side) + (side.side === candidate.recommendedSide ? ' (recommended)' : '') + '</h3>' +
    '<p><strong>' + escapeHtml(side.occurrences) + '</strong> uses across <strong>' + escapeHtml(side.files) + '</strong> files</p>' +
    '<code>' + escapeHtml((side.classes || []).join(' ')) + '</code>' +
    '<p class="location">' + escapeHtml(side.representativeSource && side.representativeSource.file) + ':' + escapeHtml(side.representativeSource && side.representativeSource.line) + ':' + escapeHtml(side.representativeSource && side.representativeSource.column) + '</p>' +
    '</section>'
  )).join('');
  return '<article class="card candidate-card drift-card" data-candidate-id="' + escapeHtml(candidate.id) + '" data-example-index="0">' +
    '<div class="meta">' + escapeHtml(candidate.id) + ' / canonicalize / drift / ' + escapeHtml(candidate.safetyLevel) + ' / <span class="score">score ' + scoreFor(candidate) + '</span></div>' +
    '<h2>' + escapeHtml(candidate.title) + '</h2>' +
    '<p>' + escapeHtml(candidate.rationale) + '</p>' +
    '<p><strong>' + escapeHtml(candidate.source && candidate.source.occurrences) + '</strong> occurrences across <strong>' + escapeHtml(candidate.source && candidate.source.files) + '</strong> files. Recommended side: <strong>' + escapeHtml(candidate.recommendedSide) + '</strong>.</p>' +
    '<div class="side-grid">' + sides + '</div>' +
    '<h3>Approve canonical side</h3>' +
    '<div class="command-row"><code>' + escapeHtml(command) + '</code><button class="button copy-command" type="button" data-command="' + escapeHtml(command) + '">Copy</button></div>' +
    '<form class="decide-form"><select name="decision" aria-label="Decision">' + options + '</select><input name="assetName" aria-label="Asset name" value="' + escapeHtml(assetNameFor(candidate)) + '"><input name="side" aria-label="Canonical side" value="' + escapeHtml(candidate.recommendedSide) + '"><button class="button primary" type="submit">Approve</button></form>' +
    '<p class="status-message" role="status"></p>' +
    '<h3>Source snippet</h3><div class="snippet" data-snippet><code>Loading snippet...</code></div>' +
    '<h3>Source locations</h3>' + renderExamples(candidate.source && candidate.source.examples) +
    '</article>';
}

function renderGroups(candidates, allCandidates) {
  return groupCandidates(candidates, allCandidates).map((group) => (
    '<section class="candidate-group" data-review-group="' + escapeHtml(group.key) + '">' +
    '<h3 class="group-heading">' + escapeHtml(group.label) + ' <span class="badge">' + group.items.length + (allCandidates.length === candidates.length ? '' : ' of ' + group.total) + ' candidates</span></h3>' +
    group.items.map(renderCandidateCard).join('') +
    '</section>'
  )).join('');
}

async function loadSnippet(card) {
  if (card.dataset.snippetLoaded) return;
  card.dataset.snippetLoaded = 'true';
  const snippet = card.querySelector('[data-snippet]');
  try {
    const url = new URL('/api/snippet', window.location.href);
    url.searchParams.set('candidateId', card.dataset.candidateId);
    url.searchParams.set('example', card.dataset.exampleIndex || '0');
    const response = await fetch(url);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Snippet unavailable');
    snippet.innerHTML = '<code>' + payload.lines.map((line) => {
      const text = escapeHtml(line.text);
      return '<span class="snippet-line"><span class="snippet-line-number">' + line.line + '</span><span>' + (line.highlight ? '<mark>' + text + '</mark>' : text) + '</span></span>';
    }).join('') + '</code>';
  } catch (error) {
    snippet.innerHTML = '<code>' + escapeHtml(error.message) + '</code>';
  }
}

function observeSnippets() {
  if (snippetObserver) snippetObserver.disconnect();
  const cards = document.querySelectorAll('.candidate-card');
  if ('IntersectionObserver' in window) {
    snippetObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          loadSnippet(entry.target);
          snippetObserver.unobserve(entry.target);
        }
      }
    }, { rootMargin: '240px' });
    cards.forEach((card) => snippetObserver.observe(card));
  } else {
    Array.from(cards).slice(0, initialLimit).forEach(loadSnippet);
  }
}

document.addEventListener('click', async (event) => {
  const button = event.target.closest('.copy-command');
  if (!button) return;
  await navigator.clipboard.writeText(button.dataset.command);
  button.textContent = 'Copied';
  setTimeout(() => { button.textContent = 'Copy'; }, 1200);
});

document.addEventListener('submit', async (event) => {
  const form = event.target.closest('.decide-form');
  if (!form) return;
  event.preventDefault();
  const card = form.closest('.candidate-card');
  const status = card.querySelector('.status-message');
  const button = form.querySelector('button[type="submit"]');
  const payload = {
    candidateId: card.dataset.candidateId,
    decision: form.elements.decision.value,
    assetName: form.elements.assetName.value.trim(),
    side: form.elements.side && form.elements.side.value ? Number(form.elements.side.value) : undefined,
  };
  button.disabled = true;
  status.textContent = 'Saving...';
  try {
    const response = await fetch('/api/decide', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not save decision');
    status.textContent = 'Saved to decisions.json and regenerated assets.';
  } catch (error) {
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

if (showAllButton) {
  showAllButton.addEventListener('click', async () => {
    showAllButton.disabled = true;
    showAllButton.textContent = 'Loading...';
    const response = await fetch('/candidates.json');
    const candidates = await response.json();
    const sorted = sortedReviewCandidates(candidates);
    candidateList.innerHTML = renderGroups(sorted, candidates);
    candidateSummary.textContent = sorted.length + ' of ' + candidates.length + ' candidates shown.';
    showAllButton.remove();
    observeSnippets();
  });
}

observeSnippets();
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
  'canonicalize',
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
  const side = candidate.actionType === 'canonicalize' ? ` --side ${candidate.recommendedSide}` : '';
  return `dsg decide design-system ${candidate.id} ${candidate.recommendedAction} --name ${assetNameForReview(candidate)}${side}`;
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
