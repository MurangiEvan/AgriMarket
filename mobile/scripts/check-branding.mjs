import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ignoredDirectories = new Set(['.git', '.expo', 'dist', 'node_modules']);
const legacyBrand = new RegExp(
  [
    `\\b${['south', 'african', 'business', 'directory'].join('[\\s_-]*')}\\b`,
    `\\b${['sa', 'business', 'directory'].join('[\\s_-]+')}\\b`,
    `\\b${['business', 'directory'].join('[\\s_-]*')}\\b`,
    `\\b${['sa', 'bd'].join('')}\\b`,
  ].join('|'),
  'iu',
);
const matches = [];

async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    if (entry.name === '.env' || entry.name.startsWith('.env.')) continue;

    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await scan(fullPath);
      continue;
    }

    const content = await readFile(fullPath);
    if (content.includes(0)) continue;
    const text = content.toString('utf8');
    if (legacyBrand.test(text)) matches.push(path.relative(repoRoot, fullPath));
  }
}

await scan(repoRoot);
if (matches.length) {
  console.error(`Legacy brand wording found in: ${matches.join(', ')}`);
  process.exitCode = 1;
} else {
  console.log('Legacy brand wording not found.');
}
