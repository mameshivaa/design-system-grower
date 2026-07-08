import { hasDistinctiveClassMix } from './class-analysis.js';

export function buildCandidates(clusters, situations = []) {
  const situationIds = new Set(situations.map((situation) => situation.id));
  const clusterCandidates = clusters
    .filter((cluster) => cluster.commonClasses.length > 0 && hasDistinctiveClassMix(cluster.commonClasses))
    .map((cluster, index) => buildClusterCandidate(cluster, index, situationIds));
  const observeOnlyCandidates = buildObserveOnlyCandidates(situations, clusterCandidates.length);

  return [...clusterCandidates, ...observeOnlyCandidates];
}

function buildClusterCandidate(cluster, index, situationIds) {
  const actionType = inferActionType(cluster, situationIds);
  const safetyLevel = inferSafetyLevel(actionType);

  return {
    id: `candidate-${String(index + 1).padStart(3, '0')}`,
    clusterId: cluster.id,
    title: candidateTitle(cluster, actionType),
    assetNameSuggestion: suggestAssetName(cluster, actionType),
    actionType,
    safetyLevel,
    status: 'needs-decision',
    recommendedAction: actionType,
    rationale: rationaleFor(actionType),
    source: {
      occurrences: cluster.occurrences,
      files: cluster.files,
      examples: cluster.examples,
    },
    commonClasses: cluster.commonClasses,
    variantClasses: cluster.variantClasses,
    categories: cluster.categories,
    score: cluster.score,
  };
}

function buildObserveOnlyCandidates(situations, offset) {
  return situations
    .filter((situation) => isObserveOnlySituation(situation))
    .map((situation, index) => ({
      id: `candidate-${String(offset + index + 1).padStart(3, '0')}`,
      situationId: situation.id,
      title: `${situation.title}: unsupported`,
      assetNameSuggestion: suggestSituationAssetName(situation),
      actionType: 'unsupported',
      safetyLevel: 'safe',
      status: 'observe-only',
      recommendedAction: 'unsupported',
      rationale: rationaleFor('unsupported'),
      source: {
        occurrences: situation.evidence.length,
        files: 0,
        examples: situation.evidence.map((item) => ({
          file: item,
          line: 0,
          column: 0,
          element: situation.id,
          className: situation.primaryResponse,
          sourceType: 'situation',
        })),
      },
      commonClasses: [],
      variantClasses: [],
      categories: [],
      score: 0,
    }));
}

function inferActionType(cluster, situationIds) {
  if (cluster.examples.some((example) => /^[A-Z]/.test(example.element) && !isGenericComponentName(example.element))) {
    return 'extract-block';
  }

  if (isRepeatedComponentOverride(cluster)) {
    return 'wrap';
  }

  if (cluster.variantClasses.length > 0) {
    return 'promote-variant';
  }

  if (situationIds.has('repeated-ui-patterns') || situationIds.has('shadcn-classname-overrides')) {
    return 'reuse';
  }

  if (cluster.type === 'similar') {
    return 'document-rule';
  }

  return 'reuse';
}

function inferSafetyLevel(actionType) {
  if (actionType === 'reuse' || actionType === 'document-rule' || actionType === 'ignore' || actionType === 'unsupported') {
    return 'safe';
  }

  return 'review-required';
}

function candidateTitle(cluster, actionType) {
  const elements = [...new Set(cluster.examples.map((example) => example.element))].sort();
  const subject = elements.length === 1 ? elements[0] : `${elements.slice(0, 3).join(' / ')} pattern`;
  return `${subject}: ${actionType}`;
}

function suggestAssetName(cluster, actionType) {
  const elements = [...new Set(cluster.examples.map((example) => example.element))].sort();
  const subject = inferSubject(elements);
  const suffix = suffixForAction(actionType);
  return `${subject}${suffix}`;
}

function suggestSituationAssetName(situation) {
  return pascalCase(situation.id);
}

function inferSubject(elements) {
  const normalized = elements.map((element) => element.toLowerCase());

  if (normalized.includes('button') || normalized.includes('a')) {
    return 'Action';
  }

  if (normalized.some((element) => ['input', 'select', 'textarea'].includes(element))) {
    return 'Field';
  }

  if (normalized.some((element) => ['article', 'section', 'card'].includes(element))) {
    return 'Surface';
  }

  return pascalCase(elements[0] || 'Ui');
}

function suffixForAction(actionType) {
  switch (actionType) {
    case 'promote-variant':
      return 'Variant';
    case 'wrap':
      return 'Wrapper';
    case 'extract-block':
      return 'Block';
    case 'document-rule':
      return 'Rule';
    case 'unsupported':
      return 'Signal';
    case 'reuse':
    default:
      return 'Pattern';
  }
}

function pascalCase(value) {
  return String(value)
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join('') || 'UiAsset';
}

function rationaleFor(actionType) {
  switch (actionType) {
    case 'promote-variant':
      return 'Repeated override classes may be better represented as an explicit component variant.';
    case 'wrap':
      return 'Repeated component overrides may be better represented as a small wrapper component after review.';
    case 'extract-block':
      return 'Repeated domain-shaped UI should be reviewed as a block or domain component before generic extraction.';
    case 'document-rule':
      return 'Similar code exists, but the safest first step is to document a usage rule instead of changing code.';
    case 'unsupported':
      return 'This signal is intentionally observe-only in the MVP and should not trigger code changes.';
    case 'reuse':
    default:
      return 'Repeated structure can likely reuse an existing component or variant after human review.';
  }
}

function isRepeatedComponentOverride(cluster) {
  const elements = [...new Set(cluster.examples.map((example) => example.element))];
  return (
    elements.length === 1
    && /^[A-Z]/.test(elements[0])
    && isGenericComponentName(elements[0])
    && cluster.variantClasses.length === 0
    && cluster.commonClasses.length > 0
  );
}

function isGenericComponentName(element) {
  return /^(Button|Card|Badge|Input|Select|Textarea|Label|Dialog|DropdownMenu|Popover|Sheet|Table)$/.test(element);
}

function isObserveOnlySituation(situation) {
  return (
    situation.primaryResponse.includes('observe-only')
    || situation.primaryResponse.includes('unsupported')
  );
}
