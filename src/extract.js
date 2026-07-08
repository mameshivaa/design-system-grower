import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export async function runExtract(options = {}) {
  const designSystemDir = path.resolve(options.designSystemDir);
  // Source files live in the scanned repo (catalog.target), which is not
  // necessarily the parent of the artifacts directory.
  const catalog = await readJson(path.join(designSystemDir, 'catalog.json'), null);
  const repoRoot = catalog?.target ? path.resolve(catalog.target) : path.dirname(designSystemDir);
  const assets = await readJson(path.join(designSystemDir, 'assets.json'), []);
  const asset = assets.find((entry) => entry.id === options.assetId);

  if (!asset) {
    throw new Error(`Asset not found in assets.json: ${options.assetId}`);
  }

  const sourceLocation = pickSourceLocation(asset);
  const sourceFile = path.resolve(repoRoot, sourceLocation.file);
  const source = await fs.readFile(sourceFile, 'utf8');
  const extraction = extractJsxElementAt(source, sourceLocation);
  const componentName = toPascalCase(asset.name || asset.id);
  const outputDir = options.outDir ? path.resolve(options.outDir) : path.join(repoRoot, 'components/ui');
  const outputFile = path.join(outputDir, `${toKebabCase(componentName)}.jsx`);

  if (!options.force && await fileExists(outputFile)) {
    throw new Error(`${outputFile} already exists. Re-run with --force to overwrite.`);
  }

  const variantResult = await buildVariantResult({
    asset,
    repoRoot,
    representative: extraction,
  });
  const componentSource = buildComponentSource({
    asset,
    componentName,
    extraction,
    sourceLocation,
    variantResult,
  });

  verifyClassEquivalence({
    originalClasses: extraction.classNames,
    generatedClasses: variantResult?.defaultClassNames ?? extraction.classNames,
  });

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(outputFile, componentSource, 'utf8');
  await writeProvenance({
    designSystemDir,
    repoRoot,
    assetId: asset.id,
    componentPath: path.relative(repoRoot, outputFile),
    sourceFile: sourceLocation.file,
    sourceLine: sourceLocation.line,
  });

  return {
    assetId: asset.id,
    componentName,
    outputPath: outputFile,
    sourceFile: sourceLocation.file,
    sourceLine: sourceLocation.line,
  };
}

export function extractJsxElementAt(source, location) {
  const offset = lineColumnToOffset(source, location.line, location.column ?? 1);
  const start = findOpeningTagStart(source, offset, location.element);
  if (start < 0) {
    throw new Error(`Could not find JSX opening tag at ${location.file}:${location.line}`);
  }

  const firstTag = readTag(source, start);
  if (!firstTag || firstTag.closing || !firstTag.name) {
    throw new Error(`Could not read JSX opening tag at ${location.file}:${location.line}`);
  }

  if (location.element && firstTag.name !== location.element) {
    throw new Error(`Expected <${location.element}> at ${location.file}:${location.line}, found <${firstTag.name}>`);
  }

  if (firstTag.selfClosing) {
    const jsx = source.slice(start, firstTag.end);
    return {
      jsx,
      element: firstTag.name,
      classNames: extractRootClassNames(jsx),
      selfClosing: true,
    };
  }

  let depth = 1;
  let cursor = firstTag.end;
  while (cursor < source.length) {
    const next = source.indexOf('<', cursor);
    if (next < 0) {
      break;
    }
    const tag = readTag(source, next);
    if (!tag) {
      cursor = next + 1;
      continue;
    }
    if (tag.name === firstTag.name) {
      if (tag.closing) {
        depth -= 1;
      } else if (!tag.selfClosing) {
        depth += 1;
      }
      if (depth === 0) {
        const jsx = source.slice(start, tag.end);
        return {
          jsx,
          element: firstTag.name,
          classNames: extractRootClassNames(jsx),
          selfClosing: false,
        };
      }
    }
    cursor = tag.end;
  }

  throw new Error(`Could not find matching closing tag for <${firstTag.name}> at ${location.file}:${location.line}`);
}

function buildComponentSource({ asset, componentName, extraction, sourceLocation, variantResult }) {
  const hasPlainChildren = !extraction.selfClosing && hasPlainTextChildren(extraction.jsx);
  const props = [];
  let jsx = extraction.jsx;
  const declarations = [];
  const comments = [];

  if (variantResult?.variants) {
    props.push("variant = 'default'");
    declarations.push(`const variantClassNames = ${JSON.stringify(variantResult.variants, null, 2)};`);
    jsx = replaceRootClassName(jsx, `{\`${variantResult.baseClassName} \${variantClassNames[variant] ?? variantClassNames.default}\`}`);
  } else if (variantResult?.commentClasses?.length) {
    comments.push(`// Variant extraction skipped. Review differing classes: ${variantResult.commentClasses.join(' ')}`);
  }

  if (hasPlainChildren) {
    const text = getPlainTextChildren(extraction.jsx);
    props.push(`children = ${JSON.stringify(text)}`);
    jsx = replacePlainTextChildren(jsx, '{children}');
  }

  const signature = props.length > 0 ? `{ ${props.join(', ')} } = {}` : '';
  const lines = [
    `// Extracted from ${sourceLocation.file}:${sourceLocation.line} by design-system-grower`,
    ...comments,
    ...declarations,
    declarations.length > 0 ? '' : null,
    `export function ${componentName}(${signature}) {`,
    '  return (',
    indentLines(jsx, 4),
    '  );',
    '}',
    '',
  ].filter((line) => line !== null);

  return lines.join('\n');
}

async function buildVariantResult({ asset, repoRoot, representative }) {
  const variantClasses = asset.variantClasses ?? [];
  const locations = asset.referenceLocations ?? [];
  if (variantClasses.length === 0 || locations.length < 2) {
    return null;
  }

  const classSets = [];
  for (const location of locations) {
    const source = await fs.readFile(path.resolve(repoRoot, location.file), 'utf8');
    const extraction = extractJsxElementAt(source, location);
    classSets.push(extraction.classNames);
  }

  const variantSet = new Set(variantClasses);
  const baseClassNames = representative.classNames.filter((className) => !variantSet.has(className));
  const variants = {};
  const seenValues = new Set();

  classSets.forEach((classNames, index) => {
    const base = classNames.filter((className) => !variantSet.has(className));
    if (!sameClassSet(baseClassNames, base)) {
      return;
    }
    const diff = classNames.filter((className) => variantSet.has(className));
    if (diff.length === 0) {
      return;
    }
    const value = diff.join(' ');
    if (seenValues.has(value)) {
      return;
    }
    variants[index === 0 ? 'default' : `variant${Object.keys(variants).length + 1}`] = value;
    seenValues.add(value);
  });

  if (Object.keys(variants).length < 2) {
    return {
      commentClasses: uniqueClasses(classSets.flatMap((classNames) => classNames.filter((className) => variantSet.has(className)))),
    };
  }

  return {
    variants,
    baseClassName: baseClassNames.join(' '),
    defaultClassNames: [...baseClassNames, ...splitClasses(variants.default)],
  };
}

function replaceRootClassName(jsx, replacement) {
  return jsx.replace(/\bclassName\s*=\s*(?:"[^"]*"|'[^']*'|\{`[^`]*`\}|\{"[^"]*"\}|\{'[^']*'\})/, `className=${replacement}`);
}

function extractRootClassNames(jsx) {
  const openingEnd = findOpeningTagEnd(jsx, 0);
  if (openingEnd < 0) {
    throw new Error('Could not read JSX opening tag while extracting className');
  }
  const opening = jsx.slice(0, openingEnd);
  const match = opening.match(/\bclassName\s*=\s*(?:"([^"]*)"|'([^']*)'|\{`([^`]*)`\}|\{"([^"]*)"\}|\{'([^']*)'\})/);
  if (!match) {
    return [];
  }
  return splitClasses(match.slice(1).find((value) => value !== undefined) ?? '');
}

function verifyClassEquivalence({ originalClasses, generatedClasses }) {
  if (!sameClassSet(originalClasses, generatedClasses)) {
    throw new Error(`Generated className is not equivalent to source. Source: ${originalClasses.join(' ')} Generated: ${generatedClasses.join(' ')}`);
  }
}

function sameClassSet(left, right) {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  if (leftSet.size !== rightSet.size) {
    return false;
  }
  return [...leftSet].every((className) => rightSet.has(className));
}

function splitClasses(className) {
  return className.split(/\s+/).map((value) => value.trim()).filter(Boolean);
}

function uniqueClasses(classNames) {
  return [...new Set(classNames)].sort();
}

function pickSourceLocation(asset) {
  const location = asset.usageExample ?? (asset.referenceLocations ?? [])[0];
  if (!location?.file || !location?.line) {
    throw new Error(`Asset ${asset.id} does not include a usageExample or referenceLocations entry`);
  }
  return location;
}

async function writeProvenance({ designSystemDir, repoRoot, assetId, componentPath, sourceFile, sourceLine }) {
  const provenancePath = path.join(designSystemDir, 'provenance.json');
  const entries = await readJson(provenancePath, []);
  const gitCommit = await currentGitCommit(repoRoot);
  const nextEntry = {
    assetId,
    componentPath,
    sourceFile,
    sourceLine,
    extractedAt: new Date().toISOString(),
    gitCommit,
  };
  const nextEntries = [
    ...entries.filter((entry) => entry.assetId !== assetId),
    nextEntry,
  ];
  await fs.writeFile(provenancePath, `${JSON.stringify(nextEntries, null, 2)}\n`, 'utf8');
}

async function currentGitCommit(repoRoot) {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') {
      return fallback;
    }
    throw error;
  }
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function findOpeningTagStart(source, offset, element) {
  const needle = element ? `<${element}` : '<';
  const isBoundary = (index) => {
    if (!element) {
      return true;
    }
    const after = source[index + needle.length];
    return after === undefined || /[\s/>]/.test(after);
  };

  // The recorded location points at the className attribute, which can sit
  // several lines below the tag opening in multi-line JSX. Search backwards
  // for the nearest opening tag whose attribute span still contains the offset.
  let candidate = source.lastIndexOf(needle, offset);
  while (candidate >= 0) {
    if (isBoundary(candidate)) {
      const closeAngle = source.indexOf('>', candidate);
      if (closeAngle < 0 || closeAngle >= offset) {
        return candidate;
      }
      // Nearest same-name tag closes before the offset, so nothing contains it.
      break;
    }
    candidate = source.lastIndexOf(needle, candidate - 1);
  }

  // Single-line JSX: the tag may open right at or after the recorded column.
  const lineEnd = source.indexOf('\n', offset);
  const limit = lineEnd < 0 ? source.length : lineEnd;
  const onLine = source.indexOf(needle, offset);
  if (onLine >= 0 && onLine <= limit && isBoundary(onLine)) {
    return onLine;
  }
  return -1;
}

function lineColumnToOffset(source, line, column) {
  const lines = source.split('\n');
  if (line < 1 || line > lines.length) {
    throw new Error(`Line ${line} is outside the source file`);
  }
  let offset = 0;
  for (let index = 0; index < line - 1; index += 1) {
    offset += lines[index].length + 1;
  }
  return offset + Math.max(0, column - 1);
}

function readTag(source, start) {
  if (source[start] !== '<') {
    return null;
  }
  if (source.startsWith('<!--', start) || source[start + 1] === '>' || source[start + 1] === '=') {
    return null;
  }

  let cursor = start + 1;
  let closing = false;
  if (source[cursor] === '/') {
    closing = true;
    cursor += 1;
  }

  const nameStart = cursor;
  while (cursor < source.length && /[A-Za-z0-9_.:-]/.test(source[cursor])) {
    cursor += 1;
  }
  const name = source.slice(nameStart, cursor);
  if (!name) {
    return null;
  }

  const end = findOpeningTagEnd(source, start);
  if (end < 0) {
    return null;
  }
  let beforeEnd = end - 2;
  while (beforeEnd > start && /\s/.test(source[beforeEnd])) {
    beforeEnd -= 1;
  }

  return {
    name,
    closing,
    selfClosing: !closing && source[beforeEnd] === '/',
    end,
  };
}

function findOpeningTagEnd(source, start) {
  let quote = null;
  let braceDepth = 0;
  for (let index = start + 1; index < source.length; index += 1) {
    const char = source[index];
    const prev = source[index - 1];
    if (quote) {
      if (char === quote && prev !== '\\') {
        quote = null;
      }
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '{') {
      braceDepth += 1;
      continue;
    }
    if (char === '}') {
      braceDepth = Math.max(0, braceDepth - 1);
      continue;
    }
    if (char === '>' && braceDepth === 0) {
      return index + 1;
    }
  }
  return -1;
}

function hasPlainTextChildren(jsx) {
  const text = getPlainTextChildren(jsx);
  return text.length > 0 && !/[<>{}]/.test(text);
}

function getPlainTextChildren(jsx) {
  const openingEnd = findOpeningTagEnd(jsx, 0);
  const closingStart = jsx.lastIndexOf('</');
  if (openingEnd < 0 || closingStart < openingEnd) {
    return '';
  }
  return jsx.slice(openingEnd, closingStart).trim();
}

function replacePlainTextChildren(jsx, replacement) {
  const openingEnd = findOpeningTagEnd(jsx, 0);
  const closingStart = jsx.lastIndexOf('</');
  return `${jsx.slice(0, openingEnd)}${replacement}${jsx.slice(closingStart)}`;
}

function indentLines(value, spaces) {
  const padding = ' '.repeat(spaces);
  return value.split('\n').map((line) => `${padding}${line}`).join('\n');
}

function toPascalCase(value) {
  return String(value)
    .replace(/^[^A-Za-z]+/, '')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => `${part[0].toUpperCase()}${part.slice(1)}`)
    .join('') || 'ExtractedComponent';
}

function toKebabCase(value) {
  return String(value)
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}
