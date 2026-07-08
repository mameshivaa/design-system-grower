import {
  classCategory,
  classPrefix,
  hasDistinctiveClassMix,
  isIconElement,
  isSizingOnlyClasses,
  summarizeClassCategories,
} from './class-analysis.js';

export function clusterClassNameMatches(matches, options = {}) {
  const minimumOccurrences = options.minimumOccurrences ?? 2;
  const classWeights = buildClassWeights(matches);
  const exactGroups = groupBySignature(matches);
  const exactClusters = [];
  const similarBuckets = new Map();

  for (const group of exactGroups.values()) {
    if (group.length >= minimumOccurrences) {
      const cluster = buildCluster('exact', group[0].signature, group, classWeights);
      if (passesClusterQualityGate(cluster)) {
        exactClusters.push(cluster);
      }
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
      const cluster = buildCluster('similar', bucketKey, group, classWeights);
      if (passesClusterQualityGate(cluster)) {
        similarClusters.push(cluster);
      }
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

function buildCluster(type, key, matches, classWeights) {
  const uniqueFiles = new Set(matches.map((match) => match.file));
  const commonClasses = findCommonClasses(matches);
  const categories = summarizeCategories(matches);
  const commonCategorySummary = summarizeClassCategories(commonClasses);
  const classTokenCount = matches.reduce((sum, match) => sum + match.classes.length, 0);
  const commonWeight = commonClasses.reduce((sum, className) => sum + (classWeights.get(className) ?? 1), 0);
  const variantClasses = findVariantClasses(matches, commonClasses);
  const variantWeight = variantClasses.reduce((sum, className) => sum + (classWeights.get(className) ?? 1), 0);
  const score = Math.round(
    matches.length * 6
    + uniqueFiles.size * 5
    + commonWeight * 12
    + Math.min(variantWeight * 2, 12)
    + Math.min(classTokenCount, 24)
  );

  return {
    type,
    key,
    score,
    occurrences: matches.length,
    files: uniqueFiles.size,
    commonClasses,
    variantClasses,
    categories,
    quality: {
      commonCategories: commonCategorySummary,
      commonCategoryCount: commonCategorySummary.length,
      weightedCommonClassScore: Number(commonWeight.toFixed(3)),
    },
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
  return findCommonClasses(matches).length > 0 && sharedPrefixCount(matches) >= 2;
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
      for (const { name } of summarizeClassCategories([className])) {
        counts.set(name, (counts.get(name) ?? 0) + 1);
      }
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name, count]) => ({ name, count }));
}

function passesClusterQualityGate(cluster) {
  if (cluster.commonClasses.length === 0) {
    return false;
  }

  if (!hasDistinctiveClassMix(cluster.commonClasses)) {
    return false;
  }

  if (
    cluster.examples.length > 0
    && cluster.examples.every((example) => isIconElement(example.element))
    && isSizingOnlyClasses(cluster.commonClasses)
  ) {
    return false;
  }

  return true;
}

function buildClassWeights(matches) {
  const total = Math.max(matches.length, 1);
  const documentFrequency = new Map();

  for (const match of matches) {
    for (const className of new Set(match.classes)) {
      documentFrequency.set(className, (documentFrequency.get(className) ?? 0) + 1);
    }
  }

  return new Map([...documentFrequency.entries()].map(([className, count]) => {
    const idf = Math.log((1 + total) / (1 + count)) + 1;
    return [className, idf];
  }));
}

export { classCategory } from './class-analysis.js';
