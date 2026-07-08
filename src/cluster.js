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
  const mergeJaccardThreshold = options.mergeJaccardThreshold ?? 0.8;
  const classWeights = buildClassWeights(matches);
  const exactGroups = groupBySignature(matches);
  const clusterGroups = [];
  const similarBuckets = new Map();

  for (const group of exactGroups.values()) {
    if (group.length >= minimumOccurrences) {
      clusterGroups.push({ type: 'exact', key: group[0].signature, matches: group });
      continue;
    }

    const bucketKey = buildBucketKey(group[0].classes);
    if (!similarBuckets.has(bucketKey)) {
      similarBuckets.set(bucketKey, []);
    }
    similarBuckets.get(bucketKey).push(...group);
  }

  for (const [bucketKey, group] of similarBuckets) {
    if (group.length >= minimumOccurrences && hasMeaningfulOverlap(group)) {
      clusterGroups.push({ type: 'similar', key: bucketKey, matches: group });
    }
  }

  return mergeSimilarClusterGroups(clusterGroups, mergeJaccardThreshold)
    .map((group) => buildCluster(group.type, group.key, group.matches, classWeights))
    .filter(passesClusterQualityGate)
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

function mergeSimilarClusterGroups(groups, threshold) {
  const merged = groups.map((group) => ({ ...group, matches: [...group.matches] }));
  let changed = true;

  while (changed) {
    changed = false;

    for (let leftIndex = 0; leftIndex < merged.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < merged.length; rightIndex += 1) {
        if (jaccardSimilarity(groupClassSet(merged[leftIndex]), groupClassSet(merged[rightIndex])) < threshold) {
          continue;
        }

        merged[leftIndex] = combineClusterGroups(merged[leftIndex], merged[rightIndex]);
        merged.splice(rightIndex, 1);
        changed = true;
        break;
      }

      if (changed) {
        break;
      }
    }
  }

  return merged;
}

function combineClusterGroups(left, right) {
  const keys = new Set([
    ...left.key.split(' || ').filter(Boolean),
    ...right.key.split(' || ').filter(Boolean),
  ]);

  return {
    type: 'similar',
    key: [...keys].sort().join(' || '),
    matches: [...left.matches, ...right.matches],
  };
}

function groupClassSet(group) {
  return new Set(group.matches.flatMap((match) => match.classes));
}

function jaccardSimilarity(left, right) {
  const union = new Set([...left, ...right]);
  if (union.size === 0) {
    return 0;
  }

  let intersection = 0;
  for (const className of left) {
    if (right.has(className)) {
      intersection += 1;
    }
  }

  return intersection / union.size;
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
