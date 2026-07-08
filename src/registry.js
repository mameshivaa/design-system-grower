import fs from 'node:fs/promises';
import path from 'node:path';

const REGISTRY_SCHEMA = 'https://ui.shadcn.com/schema/registry.json';
const REGISTRY_ITEM_SCHEMA = 'https://ui.shadcn.com/schema/registry-item.json';
const COMPONENT_TYPE = 'registry:component';

export async function buildRegistry(options = {}) {
  const designSystemDir = path.resolve(options.designSystemDir ?? path.join(process.cwd(), 'design-system'));
  const componentsDir = path.resolve(options.componentsDir ?? path.join(process.cwd(), 'components', 'ui'));
  const registryName = options.name ?? 'design-system-grower';
  const homepage = options.homepage ?? '';
  const assets = await readJson(path.join(designSystemDir, 'assets.json'), []);
  const provenanceEntries = normalizeProvenance(await readJson(path.join(designSystemDir, 'provenance.json'), []));
  const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
  const items = [];

  for (const provenance of provenanceEntries) {
    if (!provenance.assetId || !provenance.componentPath) {
      continue;
    }

    const asset = assetsById.get(provenance.assetId);
    const assetName = asset?.name ?? provenance.assetId;
    const itemName = kebabCase(assetName);
    const componentPath = await resolveComponentPath(provenance.componentPath, componentsDir);
    const source = await fs.readFile(componentPath, 'utf8');
    const target = normalizeTargetPath(provenance.componentPath, componentPath, componentsDir);
    const file = {
      path: target,
      type: COMPONENT_TYPE,
      target,
    };
    const summaryItem = {
      name: itemName,
      type: COMPONENT_TYPE,
      title: assetName,
      description: asset?.usageGuidance ?? '',
      files: [file],
      meta: {
        provenance,
      },
    };

    items.push({
      summary: summaryItem,
      full: {
        $schema: REGISTRY_ITEM_SCHEMA,
        ...summaryItem,
        files: [{
          ...file,
          content: source,
        }],
      },
    });
  }

  items.sort((left, right) => left.summary.name.localeCompare(right.summary.name));

  return {
    registry: {
      $schema: REGISTRY_SCHEMA,
      name: registryName,
      homepage,
      items: items.map((item) => item.summary),
    },
    items: items.map((item) => item.full),
  };
}

export async function writeRegistry(options = {}) {
  const outDir = path.resolve(options.outDir ?? path.join(process.cwd(), 'registry'));
  const built = await buildRegistry(options);

  await fs.mkdir(path.join(outDir, 'r'), { recursive: true });
  await fs.writeFile(path.join(outDir, 'registry.json'), `${JSON.stringify(built.registry, null, 2)}\n`, 'utf8');

  for (const item of built.items) {
    await fs.writeFile(path.join(outDir, 'r', `${item.name}.json`), `${JSON.stringify(item, null, 2)}\n`, 'utf8');
  }

  return {
    outDir,
    registryPath: path.join(outDir, 'registry.json'),
    itemPaths: built.items.map((item) => path.join(outDir, 'r', `${item.name}.json`)),
    itemCount: built.items.length,
  };
}

function normalizeProvenance(provenance) {
  if (Array.isArray(provenance)) {
    return provenance;
  }

  if (provenance && typeof provenance === 'object') {
    return Object.values(provenance);
  }

  return [];
}

async function resolveComponentPath(componentPath, componentsDir) {
  const candidates = path.isAbsolute(componentPath)
    ? [componentPath]
    : [
        path.resolve(path.dirname(path.dirname(componentsDir)), componentPath),
        path.resolve(process.cwd(), componentPath),
        path.resolve(componentsDir, componentPath),
      ];

  for (const candidate of candidates) {
    if (await fileExists(candidate)) {
      return candidate;
    }
  }

  return candidates[0];
}

function normalizeTargetPath(componentPath, resolvedPath, componentsDir) {
  if (!path.isAbsolute(componentPath)) {
    return toPosixPath(componentPath);
  }

  return toPosixPath(path.relative(path.dirname(componentsDir), resolvedPath));
}

function kebabCase(value) {
  return String(value)
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function toPosixPath(value) {
  return value.split(path.sep).join('/');
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
