const STATE_VARIANT_PATTERN = /^(hover|focus|focus-visible|focus-within|active|disabled|visited|checked|group-hover|group-focus|peer-hover|peer-focus|aria-|data-|\[[^\]]+\]):/;

const CATEGORY_PATTERNS = [
  ['layout', /^(container|flex|grid|block|inline|hidden|contents|flow-|columns-|col-|row-|place-|items-|justify-|content-|self-|order-|basis-|grow|shrink)/],
  ['spacing', /^(-?m[trblxy]?|-?p[trblxy]?|space-[xy]|gap[xy]?)-/],
  ['sizing', /^(w|h|min-w|min-h|max-w|max-h|size)-/],
  ['typography', /^(font|tracking|leading|list|placeholder|underline|no-underline|uppercase|lowercase|capitalize|normal-case|truncate|line-clamp|text-(xs|sm|base|lg|xl|[2-9]xl|\[[^\]]+\]))$/],
  ['color', /^(bg|text|border|ring|outline|divide|decoration|accent|caret|fill|stroke)-/],
  ['border', /^(border|rounded|divide|ring|outline)(-|$)/],
  ['effect', /^(shadow|opacity|mix-blend|blur|brightness|contrast|drop-shadow|grayscale|hue-rotate|invert|saturate|sepia|backdrop)(-|$)/],
  ['layout', /^(static|fixed|absolute|relative|sticky|inset|top|right|bottom|left|z)-/],
  ['effect', /^(animate|transition|duration|ease|delay|transform|translate|rotate|scale|skew|origin)-/],
];

const DISTINCTIVE_CATEGORIES = new Set(['color', 'typography', 'border', 'state']);
const SIZE_ONLY_CATEGORIES = new Set(['sizing']);
const ICON_ELEMENT_PATTERN = /(^|\.)(Icon|Icons|.*Icon)$|^(Icon|Icons)\.|icon$/i;

export function analyzeClass(className) {
  const categories = new Set();
  const normalized = stripVariant(className);

  if (hasStateVariant(className)) {
    categories.add('state');
  }

  for (const [category, pattern] of CATEGORY_PATTERNS) {
    if (pattern.test(normalized)) {
      categories.add(category);
    }
  }

  if (categories.size === 0) {
    categories.add('other');
  }

  return {
    className,
    normalized,
    categories: [...categories].sort(),
    prefix: classPrefix(className),
  };
}

export function classCategory(className) {
  const analysis = analyzeClass(className);
  return analysis.categories.find((category) => category !== 'state') ?? analysis.categories[0];
}

export function classCategories(className) {
  return analyzeClass(className).categories;
}

export function summarizeClassCategories(classes) {
  const counts = new Map();

  for (const className of classes) {
    for (const category of classCategories(className)) {
      counts.set(category, (counts.get(category) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name, count]) => ({ name, count }));
}

export function hasDistinctiveClassMix(classes, options = {}) {
  const minimumCategories = options.minimumCategories ?? 3;
  const categories = new Set(classes.flatMap(classCategories));
  const hasDistinctiveCategory = [...categories].some((category) => DISTINCTIVE_CATEGORIES.has(category));

  return categories.size >= minimumCategories && hasDistinctiveCategory;
}

export function isIconElement(element) {
  return ICON_ELEMENT_PATTERN.test(String(element));
}

export function isSizingOnlyClasses(classes) {
  const categories = new Set(classes.flatMap(classCategories));
  return categories.size > 0 && [...categories].every((category) => SIZE_ONLY_CATEGORIES.has(category));
}

export function classPrefix(className) {
  const normalized = stripVariant(className);
  const bracketIndex = normalized.indexOf('[');
  const safe = bracketIndex === -1 ? normalized : normalized.slice(0, bracketIndex);
  return safe.split('-')[0] || safe;
}

export function stripVariant(className) {
  const parts = String(className).split(':');
  return parts[parts.length - 1];
}

function hasStateVariant(className) {
  return String(className).split(':').slice(0, -1).some((part) => STATE_VARIANT_PATTERN.test(`${part}:`));
}
