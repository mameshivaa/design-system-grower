import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { buildApprovedAssets } from './assets.js';
import { checkClassesAgainstAssets, loadApprovedAssets } from './check.js';

const SERVER_INFO = {
  name: 'design-system-grower',
  version: '0.2.0',
};

const TOOL_DEFINITIONS = [
  {
    name: 'list_assets',
    description: 'List approved design-system assets and their canonical classes.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'lookup_pattern',
    description: 'Find approved assets by class overlap, asset name, or element keyword.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Class string or keyword to search for.',
        },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'check_classes',
    description: 'Check a class string against approved and deprecated design-system classes.',
    inputSchema: {
      type: 'object',
      properties: {
        classes: {
          type: 'string',
          description: 'Space-separated class string to check.',
        },
      },
      required: ['classes'],
      additionalProperties: false,
    },
  },
];

export async function startMcpServer(options, streams = process) {
  const artifactsDir = path.resolve(options.designSystem);
  const rl = readline.createInterface({
    input: streams.stdin,
    crlfDelay: Infinity,
  });
  let queue = Promise.resolve();

  rl.on('line', (line) => {
    queue = queue.then(() => handleLine(line, artifactsDir, streams.stdout));
  });

  return new Promise((resolve, reject) => {
    rl.on('close', () => {
      queue.then(resolve, reject);
    });
  });
}

async function handleLine(line, artifactsDir, stdout) {
  const trimmed = line.trim();
  if (!trimmed) {
    return;
  }

  let request;
  try {
    request = JSON.parse(trimmed);
  } catch {
    writeResponse(stdout, {
      jsonrpc: '2.0',
      id: null,
      error: { code: -32700, message: 'Parse error' },
    });
    return;
  }

  if (!Object.hasOwn(request, 'id')) {
    if (request.method === 'notifications/initialized') {
      return;
    }
    return;
  }

  try {
    const result = await dispatchRequest(request, artifactsDir);
    writeResponse(stdout, {
      jsonrpc: '2.0',
      id: request.id,
      result,
    });
  } catch (error) {
    writeResponse(stdout, {
      jsonrpc: '2.0',
      id: request.id,
      error: {
        code: error.code ?? -32603,
        message: error.message,
      },
    });
  }
}

async function dispatchRequest(request, artifactsDir) {
  switch (request.method) {
    case 'initialize':
      return {
        protocolVersion: request.params?.protocolVersion,
        capabilities: {
          tools: {},
        },
        serverInfo: SERVER_INFO,
      };
    case 'tools/list':
      return {
        tools: TOOL_DEFINITIONS,
      };
    case 'tools/call':
      return callTool(request.params, artifactsDir);
    default: {
      const error = new Error(`Method not found: ${request.method}`);
      error.code = -32601;
      throw error;
    }
  }
}

async function callTool(params, artifactsDir) {
  const name = params?.name;
  const args = params?.arguments ?? {};

  if (name === 'list_assets') {
    const { assets } = await loadArtifacts(artifactsDir);
    return textResult(assets.map((asset) => ({
      name: asset.name,
      action: asset.actionType,
      elementTags: asset.elementTags ?? [],
      commonClasses: asset.commonClasses ?? [],
      deprecatedClasses: asset.deprecatedClasses ?? [],
    })));
  }

  if (name === 'lookup_pattern') {
    const query = requireString(args.query, 'query');
    const { assets } = await loadArtifacts(artifactsDir);
    return textResult(lookupPattern(query, assets));
  }

  if (name === 'check_classes') {
    const classes = requireString(args.classes, 'classes');
    const { assets } = await loadArtifacts(artifactsDir);
    return textResult(checkClassesAgainstAssets(classes, assets));
  }

  const error = new Error(`Unknown tool: ${name}`);
  error.code = -32602;
  throw error;
}

async function loadArtifacts(artifactsDir) {
  const [assets, decisions, catalog] = await Promise.all([
    loadApprovedAssets(artifactsDir),
    readJson(path.join(artifactsDir, 'decisions.json'), []),
    readJson(path.join(artifactsDir, 'catalog.json'), null),
  ]);

  if (assets.length > 0 || !catalog || !Array.isArray(decisions)) {
    return { assets, decisions, catalog };
  }

  return {
    assets: buildApprovedAssets(catalog, decisions),
    decisions,
    catalog,
  };
}

function lookupPattern(query, assets) {
  const queryClasses = splitClasses(query);
  const queryClassSet = new Set(queryClasses);
  const keywords = query.toLowerCase().split(/[^a-z0-9_-]+/).filter(Boolean);

  return assets
    .map((asset) => {
      const classes = asset.commonClasses ?? [];
      const classSet = new Set(classes);
      const overlap = [...queryClassSet].filter((className) => classSet.has(className));
      const searchable = [
        asset.name,
        ...(asset.elementTags ?? []),
      ].join(' ').toLowerCase();
      const keywordMatches = keywords.filter((keyword) => searchable.includes(keyword));
      const unionSize = new Set([...queryClassSet, ...classSet]).size;
      const similarity = unionSize === 0 ? 0 : overlap.length / unionSize;
      const score = overlap.length * 10 + similarity * 5 + keywordMatches.length * 3;

      return {
        asset,
        score,
        overlap,
      };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || String(left.asset.name).localeCompare(String(right.asset.name)))
    .slice(0, 3)
    .map(({ asset, score, overlap }) => ({
      name: asset.name,
      canonicalClasses: asset.commonClasses ?? [],
      usageExample: asset.usageExample ?? null,
      referenceLocation: (asset.referenceLocations ?? [])[0] ?? null,
      score,
      matchedClasses: overlap,
    }));
}

function splitClasses(value) {
  return String(value ?? '')
    .split(/\s+/)
    .map((className) => className.trim())
    .filter(Boolean);
}

function requireString(value, name) {
  if (typeof value !== 'string' || value.trim() === '') {
    const error = new Error(`${name} must be a non-empty string`);
    error.code = -32602;
    throw error;
  }
  return value;
}

function textResult(value) {
  return {
    content: [{
      type: 'text',
      text: JSON.stringify(value),
    }],
  };
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

function writeResponse(stdout, response) {
  stdout.write(`${JSON.stringify(response)}\n`);
}
