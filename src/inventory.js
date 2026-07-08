const UI_LIBRARY_PATTERNS = [
  ['shadcn', /^@\/components\/ui\//],
  ['radix', /^@radix-ui\//],
  ['headless-ui', /^@headlessui\//],
  ['mui', /^@mui\//],
  ['chakra', /^@chakra-ui\//],
  ['mantine', /^@mantine\//],
  ['ant-design', /^antd$/],
];

export function buildInventory(analyses) {
  const files = analyses.map((analysis) => summarizeFile(analysis));
  const libraryCounts = countLibraries(analyses);
  const shadcnComponents = findShadcnComponents(analyses);
  const cvaDefinitions = analyses.flatMap((analysis) => analysis.cvaDefinitions);
  const cvaDefinitionFiles = findCvaDefinitionFiles(analyses);
  const cnCalls = analyses.flatMap((analysis) => analysis.cnCalls);
  const classNameMatches = analyses.flatMap((analysis) => analysis.classNameMatches);
  const stylingSignals = summarizeStylingSignals(analyses);
  const componentClassNameMatches = classNameMatches
    .filter((match) => /^[A-Z]/.test(match.element))
    .map((match) => ({
      file: match.file,
      line: match.line,
      element: match.element,
      className: match.className,
    }));

  return {
    files,
    uiLibraries: libraryCounts,
    shadcn: {
      detected: shadcnComponents.length > 0 || cvaDefinitions.length > 0,
      componentFiles: shadcnComponents,
      cvaDefinitions,
    },
    existingDesignSystem: {
      files: [...new Set([...shadcnComponents, ...cvaDefinitionFiles])].sort(),
      componentFiles: shadcnComponents,
      cvaDefinitionFiles,
      cvaDefinitions,
    },
    classComposition: {
      cnCalls,
      cvaDefinitions,
    },
    componentClassNameMatches,
    stylingSignals,
    counts: {
      files: files.length,
      classNameMatches: classNameMatches.length,
      componentClassNameMatches: componentClassNameMatches.length,
      cnCalls: cnCalls.length,
      cvaDefinitions: cvaDefinitions.length,
      existingDesignSystemFiles: new Set([...shadcnComponents, ...cvaDefinitionFiles]).size,
      cssModuleFiles: stylingSignals.cssModuleFiles.length,
      styledComponentFiles: stylingSignals.styledComponentFiles.length,
      sxPropFiles: stylingSignals.sxPropFiles.length,
    },
  };
}

function summarizeFile(analysis) {
  return {
    file: analysis.file,
    imports: analysis.imports,
    classNameCount: analysis.classNameMatches.length,
    cnCallCount: analysis.cnCalls.length,
    cvaDefinitionCount: analysis.cvaDefinitions.length,
    cssModules: analysis.stylingSignals.cssModules,
    styledComponents: analysis.stylingSignals.styledComponents,
    sxProp: analysis.stylingSignals.sxProp,
  };
}

function countLibraries(analyses) {
  const counts = new Map();

  for (const analysis of analyses) {
    for (const importSource of analysis.imports) {
      for (const [library, pattern] of UI_LIBRARY_PATTERNS) {
        if (pattern.test(importSource)) {
          counts.set(library, (counts.get(library) ?? 0) + 1);
        }
      }
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name, count]) => ({ name, count }));
}

function findShadcnComponents(analyses) {
  return analyses
    .filter((analysis) => isComponentsUiFile(analysis.file))
    .map((analysis) => analysis.file)
    .sort();
}

function findCvaDefinitionFiles(analyses) {
  return analyses
    .filter((analysis) => analysis.cvaDefinitions.length > 0)
    .map((analysis) => analysis.file)
    .sort();
}

export function isExistingDesignSystemSource(analysis) {
  return isComponentsUiFile(analysis.file) || analysis.cvaDefinitions.length > 0;
}

function isComponentsUiFile(filePath) {
  return /(^|\/)components\/ui\/.*\.[jt]sx?$/.test(filePath);
}

function summarizeStylingSignals(analyses) {
  return {
    cssModuleFiles: analyses
      .filter((analysis) => analysis.stylingSignals.cssModules)
      .map((analysis) => analysis.file)
      .sort(),
    styledComponentFiles: analyses
      .filter((analysis) => analysis.stylingSignals.styledComponents)
      .map((analysis) => analysis.file)
      .sort(),
    sxPropFiles: analyses
      .filter((analysis) => analysis.stylingSignals.sxProp)
      .map((analysis) => analysis.file)
      .sort(),
  };
}
