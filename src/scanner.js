import fs from 'node:fs/promises';
import path from 'node:path';

const JSX_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx']);
export const DEFAULT_IGNORED_DIRS = new Set([
  '.git',
  '.next',
  '.turbo',
  'coverage',
  'dist',
  'build',
  'node_modules',
  'out',
]);

export async function findJsxFiles(rootDir, options = {}) {
  const ignoredDirs = new Set([...(options.ignoredDirs ?? DEFAULT_IGNORED_DIRS)]);
  const files = [];
  await walk(rootDir, rootDir, ignoredDirs, files);
  return files.sort();
}

async function walk(rootDir, currentDir, ignoredDirs, files) {
  let entries;
  try {
    entries = await fs.readdir(currentDir, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'EACCES' || error.code === 'ENOENT') {
      return;
    }
    throw error;
  }

  for (const entry of entries) {
    const fullPath = path.join(currentDir, entry.name);

    if (entry.isDirectory()) {
      if (!ignoredDirs.has(entry.name)) {
        await walk(rootDir, fullPath, ignoredDirs, files);
      }
      continue;
    }

    if (
      entry.isFile()
      && JSX_EXTENSIONS.has(path.extname(entry.name))
      && !entry.name.endsWith('.d.ts')
    ) {
      files.push(path.relative(rootDir, fullPath));
    }
  }
}
