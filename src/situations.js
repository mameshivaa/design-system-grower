const OBSERVED_LIBRARY_NAMES = new Set(['mui', 'chakra', 'mantine', 'ant-design']);

export function diagnoseSituations(inventory, clusters) {
  const situations = [];
  const libraries = new Map(inventory.uiLibraries.map((library) => [library.name, library.count]));

  if (clusters.length > 0) {
    situations.push({
      id: 'repeated-ui-patterns',
      title: 'Repeated Tailwind / className UI patterns detected',
      severity: 'high',
      safetyLevel: 'safe',
      primaryResponse: 'reuse / variant / wrapper candidate',
      evidence: [`${clusters.length} repeated UI clusters`],
    });
  }

  if (inventory.shadcn.detected) {
    situations.push({
      id: 'shadcn-project',
      title: 'shadcn/ui signal detected',
      severity: 'info',
      safetyLevel: 'safe',
      primaryResponse: 'use as additional inventory signal',
      evidence: [
        `${inventory.shadcn.componentFiles.length} components/ui files`,
        `${inventory.counts.cvaDefinitions} cva definitions`,
      ],
    });
  }

  if (inventory.shadcn.detected && inventory.counts.classNameMatches > 0) {
    situations.push({
      id: 'shadcn-classname-overrides',
      title: 'shadcn/ui usage with scattered className overrides',
      severity: clusters.length > 0 ? 'high' : 'medium',
      safetyLevel: 'safe',
      primaryResponse: 'existing variant reuse / new variant',
      evidence: [
        `${inventory.counts.classNameMatches} className matches`,
        `${clusters.length} repeated UI clusters`,
      ],
    });
  }

  if (inventory.counts.componentClassNameMatches > 0) {
    situations.push({
      id: 'scattered-component-classname-overrides',
      title: 'Component className overrides detected',
      severity: 'medium',
      safetyLevel: 'safe',
      primaryResponse: 'reuse / variant / wrapper candidate',
      evidence: [`${inventory.counts.componentClassNameMatches} component className overrides`],
    });
  }

  if (inventory.counts.cvaDefinitions > 0) {
    situations.push({
      id: 'shadcn-cva-variants',
      title: 'cva variant definitions available for normalization',
      severity: 'medium',
      safetyLevel: 'safe',
      primaryResponse: 'variant normalization',
      evidence: inventory.shadcn.cvaDefinitions.map((definition) => `${definition.file}:${definition.line}`),
    });
  }

  if (libraries.has('radix') || libraries.has('headless-ui')) {
    situations.push({
      id: 'primitive-wrappers',
      title: 'Radix / Headless UI primitives with local wrappers',
      severity: 'medium',
      safetyLevel: 'safe',
      primaryResponse: 'observe-only primitive signal',
      evidence: [
        `${libraries.get('radix') ?? 0} Radix imports`,
        `${libraries.get('headless-ui') ?? 0} Headless UI imports`,
      ],
    });
  }

  const observedLibraries = [...OBSERVED_LIBRARY_NAMES].filter((name) => libraries.has(name));
  if (observedLibraries.length > 0 || inventory.counts.sxPropFiles > 0) {
    situations.push({
      id: 'component-library-customization',
      title: 'MUI / Chakra / Mantine / Ant Design customization',
      severity: 'medium',
      safetyLevel: 'safe',
      primaryResponse: 'observe-only library signal',
      evidence: [
        ...observedLibraries.map((name) => `${name}: ${libraries.get(name)} imports`),
        `${inventory.counts.sxPropFiles} files with sx props`,
      ],
    });
  }

  const domainClusters = clusters.filter((cluster) => inferActionType(cluster) === 'extract-block');
  if (domainClusters.length > 0) {
    situations.push({
      id: 'domain-specific-ui',
      title: 'Domain-specific UI mixed with generic UI',
      severity: 'medium',
      safetyLevel: 'review-required',
      primaryResponse: 'blocks/ or domain component',
      evidence: [`${domainClusters.length} block-like repeated clusters`],
    });
  }

  if (inventory.counts.cssModuleFiles > 0 || inventory.counts.styledComponentFiles > 0) {
    situations.push({
      id: 'legacy-mixed-styling',
      title: 'Legacy CSS / CSS Modules mixed in',
      severity: 'low',
      safetyLevel: 'safe',
      primaryResponse: 'unsupported / observe only',
      evidence: [
        `${inventory.counts.cssModuleFiles} CSS Module files`,
        `${inventory.counts.styledComponentFiles} styled-components files`,
      ],
    });
  }

  return situations;
}

function inferActionType(cluster) {
  const elements = cluster.examples.map((example) => example.element);
  if (elements.some((element) => /^[A-Z]/.test(element) && !/^(Button|Card|Badge|Input|Select)$/.test(element))) {
    return 'extract-block';
  }
  return 'reuse';
}
