const CLASS_ATTR_PATTERN = /\bclassName\s*=\s*(?:"([^"]*)"|'([^']*)'|\{\s*(["'`])([\s\S]*?)\3\s*\})/g;
const CN_CALL_PATTERN = /\bcn\s*\(([\s\S]*?)\)/g;
const CVA_CALL_PATTERN = /\bcva\s*\(([\s\S]*?)\)/g;
const STRING_LITERAL_PATTERN = /(["'`])([\s\S]*?)\1/g;
const IMPORT_PATTERN = /import\s+(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g;
const CSS_MODULE_IMPORT_PATTERN = /import\s+([\w_$]+)\s+from\s+["'][^"']+\.module\.(?:css|scss|sass)["']/g;
const TAG_BEFORE_ATTR_PATTERN = /<([A-Za-z][A-Za-z0-9.:-]*)\b[^<>]*$/;

export function normalizeClasses(value) {
  return value
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(isClassTokenCandidate);
}

export function extractJsxClassNames(source, filePath) {
  const matches = [];
  let match;

  while ((match = CLASS_ATTR_PATTERN.exec(source)) !== null) {
    const className = match[1] ?? match[2] ?? match[4] ?? '';
    const element = findElementName(source, match.index);
    const position = lineAndColumn(source, match.index);
    const classes = match[3] === '`'
      ? extractTemplateLiteralClasses(className)
      : normalizeClasses(className);

    if (classes.length === 0) {
      continue;
    }

    matches.push({
      file: filePath,
      line: position.line,
      column: position.column,
      element,
      className,
      classes,
      signature: classes.slice().sort().join(' '),
    });
  }

  return matches;
}

export function analyzeSource(source, filePath) {
  return {
    file: filePath,
    imports: extractImports(source),
    classNameMatches: extractJsxClassNames(source, filePath),
    cnCalls: extractClassCompositionCalls(source, filePath),
    cvaDefinitions: extractCvaDefinitions(source, filePath),
    cssModules: extractCssModuleImports(source),
    stylingSignals: extractStylingSignals(source),
  };
}

export function extractClassCompositionCalls(source, filePath) {
  const calls = [];
  let match;

  while ((match = CN_CALL_PATTERN.exec(source)) !== null) {
    const argumentSource = match[1] ?? '';
    const classes = extractStringLiteralClasses(argumentSource);
    const position = lineAndColumn(source, match.index);

    if (classes.length === 0) {
      continue;
    }

    calls.push({
      file: filePath,
      line: position.line,
      column: position.column,
      element: findElementName(source, match.index),
      helper: 'cn',
      source: argumentSource.trim(),
      classes,
      signature: classes.slice().sort().join(' '),
    });
  }

  return calls;
}

export function extractCvaDefinitions(source, filePath) {
  const definitions = [];
  let match;

  while ((match = CVA_CALL_PATTERN.exec(source)) !== null) {
    const callSource = match[1] ?? '';
    const classes = extractStringLiteralClasses(callSource);
    const variants = extractVariantNames(callSource);
    const position = lineAndColumn(source, match.index);

    definitions.push({
      file: filePath,
      line: position.line,
      column: position.column,
      classes,
      variants,
    });
  }

  return definitions;
}

export function extractImports(source) {
  const imports = [];
  let match;

  while ((match = IMPORT_PATTERN.exec(source)) !== null) {
    imports.push(match[1]);
  }

  return imports;
}

function extractCssModuleImports(source) {
  const imports = [];
  let match;

  while ((match = CSS_MODULE_IMPORT_PATTERN.exec(source)) !== null) {
    imports.push(match[1]);
  }

  return imports;
}

function extractStylingSignals(source) {
  return {
    cssModules: /\.module\.(?:css|scss|sass)["']/.test(source),
    styledComponents: /from\s+["']styled-components["']/.test(source) || /\bstyled\.[a-z]/.test(source),
    sxProp: /\bsx\s*=\s*\{/.test(source),
  };
}

function extractStringLiteralClasses(source) {
  const classes = [];
  const stringLiteralPattern = new RegExp(STRING_LITERAL_PATTERN);
  let match;

  while ((match = stringLiteralPattern.exec(source)) !== null) {
    const quote = match[1];
    const value = match[2] ?? '';
    classes.push(...(quote === '`' ? extractTemplateLiteralClasses(value) : normalizeClasses(value)));
  }

  return classes;
}

function extractTemplateLiteralClasses(source) {
  const classes = [];
  let staticChunk = '';

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];

    if (char === '\\') {
      staticChunk += char;
      if (index + 1 < source.length) {
        staticChunk += source[index + 1];
        index += 1;
      }
      continue;
    }

    if (char === '$' && source[index + 1] === '{') {
      classes.push(...normalizeClasses(staticChunk));
      staticChunk = '';

      const closeBrace = findMatchingExpressionBrace(source, index + 1);
      if (closeBrace === -1) {
        break;
      }

      classes.push(...extractStringLiteralClasses(source.slice(index + 2, closeBrace)));
      index = closeBrace;
      continue;
    }

    staticChunk += char;
  }

  classes.push(...normalizeClasses(staticChunk));
  return classes;
}

function findMatchingExpressionBrace(source, openBrace) {
  let depth = 0;
  let quote = null;
  let escaped = false;

  for (let index = openBrace; index < source.length; index += 1) {
    const char = source[index];

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }

    if (char === '{') {
      depth += 1;
      continue;
    }

    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

function isClassTokenCandidate(token) {
  if (!token) {
    return false;
  }

  if (token === ':' || token === '?' || token === '${') {
    return false;
  }

  if (token.includes('${')) {
    return false;
  }

  if (/^["'`]|["'`]$/.test(token)) {
    return false;
  }

  return /[A-Za-z0-9_\-[\]!:/.%#]/.test(token);
}

function extractVariantNames(source) {
  const variantsKey = source.search(/\bvariants\s*:/);
  if (variantsKey === -1) {
    return [];
  }

  const openBrace = source.indexOf('{', variantsKey);
  if (openBrace === -1) {
    return [];
  }

  const closeBrace = findMatchingBrace(source, openBrace);
  if (closeBrace === -1) {
    return [];
  }

  const names = [];
  const body = source.slice(openBrace + 1, closeBrace);
  let depth = 0;

  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];

    if (char === '{') {
      depth += 1;
      continue;
    }

    if (char === '}') {
      depth -= 1;
      continue;
    }

    if (depth === 0 && /[A-Za-z_$]/.test(char)) {
      const match = body.slice(index).match(/^([A-Za-z_$][\w$]*)\s*:/);
      if (match && !['true', 'false'].includes(match[1])) {
        names.push(match[1]);
        index += match[0].length - 1;
      }
    }
  }

  return [...new Set(names)];
}

function findMatchingBrace(source, openBrace) {
  let depth = 0;

  for (let index = openBrace; index < source.length; index += 1) {
    if (source[index] === '{') {
      depth += 1;
    } else if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

function findElementName(source, attributeIndex) {
  const beforeAttribute = source.slice(Math.max(0, attributeIndex - 500), attributeIndex);
  const tagMatch = beforeAttribute.match(TAG_BEFORE_ATTR_PATTERN);
  return tagMatch ? tagMatch[1] : 'unknown';
}

function lineAndColumn(source, index) {
  const prefix = source.slice(0, index);
  const lines = prefix.split(/\r\n|\r|\n/);
  return {
    line: lines.length,
    column: lines[lines.length - 1].length + 1,
  };
}
