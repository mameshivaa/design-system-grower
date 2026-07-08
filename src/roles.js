import { classCategories, stripVariant } from './class-analysis.js';

const DISPLAYED_ROLES = new Set(['Button', 'FormField', 'Badge', 'Alert', 'Card', 'Heading', 'Link', 'Text']);

export function classifyRole(candidate = {}) {
  const elements = elementTagsFor(candidate);
  const classes = classSetFor(candidate);
  const categories = categorySetFor(candidate, classes);

  // Native interactive controls are the strongest role signal, even when the
  // class mix is sparse or shared with adjacent elements.
  if (hasElement(elements, 'button') || hasComponentSuffix(elements, 'button')) {
    return 'Button';
  }

  if (hasAnyElement(elements, ['input', 'textarea', 'select']) || hasComponentSuffix(elements, 'input')) {
    return 'FormField';
  }

  // Badges are compact inline labels. Check before generic text because spans
  // with text-xs/text-sm are otherwise easy to collapse into Text.
  if (
    hasElement(elements, 'span')
    && hasClass(classes, 'inline-flex')
    && hasTextSize(classes, ['text-xs'])
    && hasRounded(classes)
    && hasPaddingXAtLeast(classes, 2)
  ) {
    return 'Badge';
  }

  // Anchor tags can be button-like when they carry pointer, padding, rounded,
  // and background classes; divs with the same mix are often custom buttons.
  if (
    hasAnyElement(elements, ['a', 'div'])
    && hasClass(classes, 'cursor-pointer')
    && hasPadding(classes)
    && hasRounded(classes)
    && hasBackground(classes)
  ) {
    return 'Button';
  }

  // Form fields often appear as styled wrappers in fixtures, so allow the
  // structural field mix without relying solely on the native element tag.
  if (
    hasBorder(classes)
    && hasPaddingX(classes)
    && hasPaddingY(classes)
    && hasClass(classes, 'w-full')
    && hasFocusState(classes)
  ) {
    return 'FormField';
  }

  // Alert before Card: alert surfaces are also bordered and padded, but the
  // low-intensity bg-*-50/100 color is the role-specific notice signal.
  if (
    hasElement(elements, 'div')
    && hasBorder(classes)
    && hasNoticeBackground(classes)
    && hasPaddingAtLeast(classes, 3)
  ) {
    return 'Alert';
  }

  if (
    hasElement(elements, 'div')
    && hasRoundedAtLeast(classes, 'lg')
    && (hasBorder(classes) || hasShadow(classes))
    && hasPaddingAtLeast(classes, 4)
  ) {
    return 'Card';
  }

  if (
    hasHeadingElement(elements)
    || (hasAnyClass(classes, ['font-heading', 'font-bold']) && hasTextSizeAtLeast(classes, 'text-2xl'))
  ) {
    return 'Heading';
  }

  if (hasElement(elements, 'a') || (hasUnderline(classes) && hasHoverState(classes))) {
    return 'Link';
  }

  if (hasAnyElement(elements, ['p', 'span']) && hasTextSize(classes, ['text-sm', 'text-xs'])) {
    return 'Text';
  }

  // Pure flex/grid/spacing candidates are layout conventions rather than a UI
  // asset role. Anything with color, border, typography, or effects is not
  // considered layout-only.
  if (
    classes.size > 0
    && [...categories].every((category) => ['layout', 'spacing', 'sizing'].includes(category))
    && (categories.has('layout') || categories.has('spacing'))
  ) {
    return 'Layout';
  }

  return 'Other';
}

export function summarizeRoles(candidates = []) {
  const roles = new Map();

  for (const candidate of candidates) {
    const role = candidate.role || classifyRole(candidate);
    if (!roles.has(role)) {
      roles.set(role, {
        variants: 0,
        competingFamilies: 0,
        topExample: '',
        topScore: Number.NEGATIVE_INFINITY,
      });
    }

    const summary = roles.get(role);
    if (candidate.actionType === 'canonicalize' || candidate.driftId) {
      summary.competingFamilies += 1;
    } else {
      summary.variants += 1;
    }

    const score = Number(candidate.score ?? 0);
    if (!summary.topExample || score > summary.topScore) {
      summary.topExample = representativeClasses(candidate);
      summary.topScore = score;
    }
  }

  return Object.fromEntries(
    [...roles.entries()]
      .sort((a, b) => (
        (b[1].variants + b[1].competingFamilies) - (a[1].variants + a[1].competingFamilies)
        || b[1].variants - a[1].variants
        || a[0].localeCompare(b[0])
      ))
      .map(([role, summary]) => [role, {
        variants: summary.variants,
        competingFamilies: summary.competingFamilies,
        topExample: summary.topExample,
      }]),
  );
}

export function roleSummaryLines(roles = {}) {
  return Object.entries(roles)
    .filter(([role]) => DISPLAYED_ROLES.has(role))
    .sort((a, b) => (
      b[1].variants - a[1].variants
      || b[1].competingFamilies - a[1].competingFamilies
      || a[0].localeCompare(b[0])
    ))
    .map(([role, summary]) => (
      `${role}: ${summary.variants} variant${summary.variants === 1 ? '' : 's'} (${summary.competingFamilies} competing ${summary.competingFamilies === 1 ? 'family' : 'families'})`
    ));
}

function elementTagsFor(candidate) {
  return new Set((candidate.source?.examples ?? [])
    .map((example) => String(example.element ?? '').trim())
    .filter(Boolean));
}

function classSetFor(candidate) {
  return new Set([
    ...(candidate.commonClasses ?? []),
    ...(candidate.variantClasses ?? []),
    ...((candidate.sides ?? []).flatMap((side) => side.classes ?? [])),
  ].map(String).filter(Boolean));
}

function categorySetFor(candidate, classes) {
  const categoryNames = (candidate.categories ?? [])
    .map((category) => (typeof category === 'string' ? category : category?.name ?? category?.category))
    .filter(Boolean);
  return new Set([
    ...categoryNames,
    ...[...classes].flatMap((className) => classCategories(className)),
  ]);
}

function representativeClasses(candidate) {
  const classes = candidate.commonClasses?.length
    ? candidate.commonClasses
    : candidate.sides?.[0]?.classes ?? candidate.variantClasses ?? [];
  return classes.slice(0, 12).join(' ');
}

function hasElement(elements, tag) {
  const normalizedTag = tag.toLowerCase();
  return [...elements].some((element) => element.toLowerCase() === normalizedTag);
}

function hasAnyElement(elements, tags) {
  return tags.some((tag) => hasElement(elements, tag));
}

function hasComponentSuffix(elements, suffix) {
  return [...elements].some((element) => {
    const value = String(element);
    return /^[A-Z]/.test(value) && value.toLowerCase().endsWith(suffix);
  });
}

function hasHeadingElement(elements) {
  return [...elements].some((element) => /^h[1-6]$/i.test(element));
}

function hasClass(classes, className) {
  return classes.has(className);
}

function hasAnyClass(classes, classNames) {
  return classNames.some((className) => classes.has(className));
}

function normalizedClasses(classes) {
  return [...classes].map((className) => stripVariant(className));
}

function hasPadding(classes) {
  return normalizedClasses(classes).some((className) => /^p[trblxy]?-\S+/.test(className));
}

function hasPaddingX(classes) {
  return normalizedClasses(classes).some((className) => /^(px|p)-\S+/.test(className));
}

function hasPaddingY(classes) {
  return normalizedClasses(classes).some((className) => /^(py|p)-\S+/.test(className));
}

function hasPaddingXAtLeast(classes, minimum) {
  return normalizedClasses(classes).some((className) => {
    const match = className.match(/^(?:px|p)-(\d+(?:\.\d+)?)$/);
    return match && Number(match[1]) >= minimum;
  });
}

function hasPaddingAtLeast(classes, minimum) {
  return normalizedClasses(classes).some((className) => {
    const match = className.match(/^p[trblxy]?-(\d+(?:\.\d+)?)$/);
    return match && Number(match[1]) >= minimum;
  });
}

function hasRounded(classes) {
  return normalizedClasses(classes).some((className) => /^rounded(?:-|$)/.test(className));
}

function hasRoundedAtLeast(classes, minimum) {
  const ranks = new Map([
    ['none', 0],
    ['sm', 1],
    ['DEFAULT', 2],
    ['md', 3],
    ['lg', 4],
    ['xl', 5],
    ['2xl', 6],
    ['3xl', 7],
    ['full', 8],
  ]);
  const required = ranks.get(minimum) ?? 0;
  return normalizedClasses(classes).some((className) => {
    const match = className.match(/^rounded(?:-(sm|md|lg|xl|2xl|3xl|full|none))?$/);
    if (!match) {
      return false;
    }
    return (ranks.get(match[1] ?? 'DEFAULT') ?? 0) >= required;
  });
}

function hasBackground(classes) {
  return normalizedClasses(classes).some((className) => /^bg-/.test(className));
}

function hasNoticeBackground(classes) {
  return normalizedClasses(classes).some((className) => /^bg-[a-z]+-(50|100)$/.test(className));
}

function hasBorder(classes) {
  return normalizedClasses(classes).some((className) => /^border(?:-|$)/.test(className));
}

function hasShadow(classes) {
  return normalizedClasses(classes).some((className) => /^shadow(?:-|$)/.test(className));
}

function hasFocusState(classes) {
  return [...classes].some((className) => String(className).startsWith('focus:') || String(className).startsWith('focus-visible:'));
}

function hasHoverState(classes) {
  return [...classes].some((className) => String(className).startsWith('hover:'));
}

function hasUnderline(classes) {
  return normalizedClasses(classes).includes('underline');
}

function hasTextSize(classes, sizes) {
  return normalizedClasses(classes).some((className) => sizes.includes(className));
}

function hasTextSizeAtLeast(classes, minimum) {
  const ranks = new Map([
    ['text-xs', 0],
    ['text-sm', 1],
    ['text-base', 2],
    ['text-lg', 3],
    ['text-xl', 4],
    ['text-2xl', 5],
    ['text-3xl', 6],
    ['text-4xl', 7],
    ['text-5xl', 8],
    ['text-6xl', 9],
    ['text-7xl', 10],
    ['text-8xl', 11],
    ['text-9xl', 12],
  ]);
  const required = ranks.get(minimum) ?? 0;
  return normalizedClasses(classes).some((className) => (ranks.get(className) ?? -1) >= required);
}
