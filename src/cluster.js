const CATEGORY_PATTERNS = [
  ['layout', /^(container|flex|grid|block|inline|hidden|contents|flow-|columns-|col-|row-|place-|items-|justify-|content-|self-|order-|basis-|grow|shrink)/],
  ['spacing', /^(-?m[trblxy]?|-?p[trblxy]?|space-[xy]|gap[xy]?)-/],
  ['sizing', /^(w|h|min-w|min-h|max-w|max-h|size)-/],
  ['typography', /^(font|text|tracking|leading|list|placeholder|underline|no-underline|uppercase|lowercase|capitalize|normal-case|truncate|line-clamp)/],
  ['color', /^(bg|text|border|ring|outline|divide|decoration|accent|caret|fill|stroke)-/],
  ['border', /^(border|rounded|divide|ring|outline)-/],
  ['effects', /^(shadow|opacity|mix-blend|blur|brightness|contrast|drop-shadow|grayscale|hue-rotate|invert|saturate|sepia|backdrop)-/],
  ['position', /^(static|fixed|absolute|relative|sticky|inset|top|right|bottom|left|z)-/],
  ['interaction', /^(cursor|select|pointer-events|resize|scroll|snap|touch|will-change|appearance)/],
  ['animation', /^(animate|transition|duration|ease|delay|transform|translate|rotate|scale|skew|origin)-/],
  ['accessibility', /^(sr-only|not-sr-only)/],
];

export function clusterClassNameMatches(matches, options = {}) {
  const minimumOccurrences = options.minimumOccurrences ?? 2;
  const exactGroups = groupBySignature(matches);
  const exactClusters = [];
  const similarBuckets = new Map();

  for (const group of exactGroups.values()) {
    if (group.length >= minimumOccurrences) {
      exactClusters.push(buildCluster('exact', group[0].signature, group));
      continue;
    }

    const bucketKey = buildBucketKey(group[0].classes);
    if (!similarBuckets.has(bucketKey)) {
      similarBuckets.set(bucketKey, []);
    }
    similarBuckets.get(bucketKey).push(...group);
  }

  const similarClusters = [];
  for (const [bucketKey, group] of similarBuckets) {
    if (group.length >= minimumOccurrences && hasMeaningfulOverlap(group)) {
      similarClusters.push(buildCluster('similar', bucketKey, group));
    }
  }

  return [...exactClusters, ...similarClusters]
    .sort((a, b) => b.score - a.score || b.occurrences - a.occurrences || a.key.localeCompare(b.key))
    .map((cluster, index) => ({ id: `cluster-${String(index + 1).padStart(3, '0')}`, ...cluster }));
}

function groupBySignature(matches) {
  const groups = new Map();
  for (const match of matches) {
    if (!groups.has(match.signature)) {
      groups.set(match.signature, []);
    }
    groups.get(match.signature).push(match);
  }
  return groups;
}

function buildCluster(type, key, matches) {
  const uniqueFiles = new Set(matches.map((match) => match.file));
  const commonClasses = findCommonClasses(matches);
  const categories = summarizeCategories(matches);
  const classTokenCount = matches.reduce((sum, match) => sum + match.classes.length, 0);
  const score = Math.round(
    matches.length * 8
    + uniqueFiles.size * 6
    + commonClasses.length * 3
    + Math.min(classTokenCount, 40)
  );

  return {
    type,
    key,
    score,
    occurrences: matches.length,
    files: uniqueFiles.size,
    commonClasses,
    variantClasses: findVariantClasses(matches, commonClasses),
    categories,
    examples: matches.map((match) => ({
      file: match.file,
      line: match.line,
      column: match.column,
      element: match.element,
      className: match.className,
      sourceType: match.sourceType ?? 'className',
    })),
  };
}

function buildBucketKey(classes) {
  const categories = [...new Set(classes.map(classCategory))].sort();
  const normalizedPrefixes = [...new Set(classes.map(classPrefix))].sort();
  return `${categories.join('+')}::${normalizedPrefixes.slice(0, 8).join('+')}`;
}

function hasMeaningfulOverlap(matches) {
  return findCommonClasses(matches).length > 0 || sharedPrefixCount(matches) >= 2;
}

function sharedPrefixCount(matches) {
  const prefixCounts = new Map();
  for (const match of matches) {
    for (const prefix of new Set(match.classes.map(classPrefix))) {
      prefixCounts.set(prefix, (prefixCounts.get(prefix) ?? 0) + 1);
    }
  }
  return [...prefixCounts.values()].filter((count) => count >= matches.length).length;
}

function findCommonClasses(matches) {
  if (matches.length === 0) {
    return [];
  }

  const common = new Set(matches[0].classes);
  for (const match of matches.slice(1)) {
    const classSet = new Set(match.classes);
    for (const className of [...common]) {
      if (!classSet.has(className)) {
        common.delete(className);
      }
    }
  }

  return [...common].sort();
}

function findVariantClasses(matches, commonClasses) {
  const common = new Set(commonClasses);
  return [...new Set(matches.flatMap((match) => match.classes))]
    .filter((className) => !common.has(className))
    .sort();
}

function summarizeCategories(matches) {
  const counts = new Map();
  for (const match of matches) {
    for (const className of match.classes) {
      const category = classCategory(className);
      counts.set(category, (counts.get(category) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name, count]) => ({ name, count }));
}

export function classCategory(className) {
  const normalized = stripVariant(className);
  for (const [category, pattern] of CATEGORY_PATTERNS) {
    if (pattern.test(normalized)) {
      return category;
    }
  }
  return 'other';
}

function classPrefix(className) {
  const normalized = stripVariant(className);
  const bracketIndex = normalized.indexOf('[');
  const safe = bracketIndex === -1 ? normalized : normalized.slice(0, bracketIndex);
  return safe.split('-')[0] || safe;
}

function stripVariant(className) {
  const parts = className.split(':');
  return parts[parts.length - 1];
}
