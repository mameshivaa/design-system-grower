import { classCategories, stripVariant } from './class-analysis.js';

const DEFAULT_MIN_JACCARD = 0.3;
const DEFAULT_MAX_JACCARD = 0.75;

const COLOR_FAMILIES = new Set([
  'slate',
  'gray',
  'zinc',
  'neutral',
  'stone',
  'red',
  'orange',
  'amber',
  'yellow',
  'lime',
  'green',
  'emerald',
  'teal',
  'cyan',
  'sky',
  'blue',
  'indigo',
  'violet',
  'purple',
  'fuchsia',
  'pink',
  'rose',
]);

export function detectCompetingFamilies(matches, options = {}) {
  const minJaccard = options.minJaccard ?? DEFAULT_MIN_JACCARD;
  const maxJaccard = options.maxJaccard ?? DEFAULT_MAX_JACCARD;
  const groups = buildSignatureGroups(matches)
    .filter((group) => group.matches.length > 0 && group.classes.length > 0);
  const families = [];

  for (let leftIndex = 0; leftIndex < groups.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < groups.length; rightIndex += 1) {
      const left = groups[leftIndex];
      const right = groups[rightIndex];

      if (left.elementKey !== right.elementKey || left.categoryKey !== right.categoryKey) {
        continue;
      }

      const similarity = jaccardSimilarity(new Set(left.classes), new Set(right.classes));
      if (similarity < minJaccard || similarity > maxJaccard) {
        continue;
      }

      const colorDrift = colorFamilyDrift(left.classes, right.classes);
      if (colorDrift.length === 0) {
        continue;
      }

      families.push(buildFamily(left, right, similarity, colorDrift));
    }
  }

  return families
    .sort((a, b) => (
      b.score - a.score
      || b.occurrences - a.occurrences
      || a.key.localeCompare(b.key)
    ))
    .map((family, index) => ({
      id: `drift-${String(index + 1).padStart(3, '0')}`,
      ...family,
    }));
}

function buildSignatureGroups(matches) {
  const groups = new Map();

  for (const match of matches) {
    const classes = uniqueSorted(match.classes);
    if (classes.length === 0) {
      continue;
    }

    const categoryKey = classCategorySignature(classes);
    const classKey = classes.join(' ');
    const key = `${categoryKey}::${classKey}`;

    if (!groups.has(key)) {
      groups.set(key, {
        key,
        categoryKey,
        classes,
        elementTags: new Set(),
        matches: [],
      });
    }
    const group = groups.get(key);
    group.elementTags.add(match.element || 'unknown');
    group.matches.push(match);
  }

  return [...groups.values()].map((group) => ({
    ...group,
    elementTags: [...group.elementTags].sort(),
    elementKey: [...group.elementTags].sort().join('|'),
  }));
}

function buildFamily(left, right, similarity, colorDrift) {
  const sides = [buildSide(1, left), buildSide(2, right)]
    .sort((a, b) => b.occurrences - a.occurrences || a.side - b.side)
    .map((side, index) => ({ ...side, side: index + 1 }));
  const recommendedSide = sides[0].side;
  const occurrences = sides.reduce((sum, side) => sum + side.occurrences, 0);
  const files = new Set(sides.flatMap((side) => side.examples.map((example) => example.file))).size;
  const commonClasses = intersection(sides[0].classes, sides[1].classes);
  const variantClasses = uniqueSorted(sides.flatMap((side) => side.classes).filter((className) => !commonClasses.includes(className)));

  return {
    key: `${left.elementKey}::${left.categoryKey}::${left.classes.join(' ')} <> ${right.classes.join(' ')}`,
    elementTags: left.elementTags,
    categorySignature: left.categoryKey,
    jaccard: Number(similarity.toFixed(3)),
    colorDrift,
    score: Math.round(occurrences * 12 + colorDrift.length * 8 + commonClasses.length * 3),
    occurrences,
    files,
    recommendedSide,
    sides,
    commonClasses,
    variantClasses,
    categories: summarizeCategorySignature(left.categoryKey),
    examples: sides.flatMap((side) => side.examples),
  };
}

function buildSide(side, group) {
  const files = new Set(group.matches.map((match) => match.file));

  return {
    side,
    occurrences: group.matches.length,
    files: files.size,
    classes: group.classes,
    className: group.classes.join(' '),
    representativeSource: sourceLocation(group.matches[0]),
    examples: group.matches.map(sourceLocation),
  };
}

function sourceLocation(match) {
  return {
    file: match.file,
    line: match.line,
    column: match.column,
    element: match.element,
    className: match.className,
    sourceType: match.sourceType ?? 'className',
  };
}

function classCategorySignature(classes) {
  const counts = new Map();
  for (const className of classes) {
    for (const category of classCategories(className)) {
      counts.set(category, (counts.get(category) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([category, count]) => `${category}:${count}`)
    .join('|');
}

function summarizeCategorySignature(signature) {
  return signature
    .split('|')
    .filter(Boolean)
    .map((entry) => {
      const [name, count] = entry.split(':');
      return { name, count: Number(count) };
    });
}

function colorFamilyDrift(leftClasses, rightClasses) {
  const left = colorFamiliesFor(leftClasses);
  const right = colorFamiliesFor(rightClasses);
  const drift = [];

  for (const family of left) {
    if (!right.has(family)) {
      drift.push(family);
    }
  }
  for (const family of right) {
    if (!left.has(family)) {
      drift.push(family);
    }
  }

  return uniqueSorted(drift);
}

function colorFamiliesFor(classes) {
  const families = new Set();

  for (const className of classes) {
    const family = colorFamilyFor(className);
    if (family) {
      families.add(family);
    }
  }

  return families;
}

function colorFamilyFor(className) {
  const normalized = stripVariant(className);
  const match = /^(?:bg|text|border|ring|outline|divide|decoration|accent|caret|fill|stroke)-([a-z]+)(?:-|\/|$)/.exec(normalized);
  if (!match) {
    return null;
  }

  return COLOR_FAMILIES.has(match[1]) ? match[1] : null;
}

function jaccardSimilarity(left, right) {
  const union = new Set([...left, ...right]);
  if (union.size === 0) {
    return 0;
  }

  let intersectionCount = 0;
  for (const item of left) {
    if (right.has(item)) {
      intersectionCount += 1;
    }
  }

  return intersectionCount / union.size;
}

function intersection(left, right) {
  const rightSet = new Set(right);
  return left.filter((item) => rightSet.has(item)).sort();
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort();
}
