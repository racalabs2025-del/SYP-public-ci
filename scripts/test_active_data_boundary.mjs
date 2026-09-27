import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const sourceRoot = path.resolve('src');
const entry = path.join(sourceRoot, 'main.jsx');
const extensions = ['.js', '.jsx', '.mjs', '.json'];
const visited = new Set();

function resolveLocalImport(fromFile, specifier) {
  if (!specifier.startsWith('.')) return null;
  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [
    base,
    ...extensions.map((extension) => `${base}${extension}`),
    ...extensions.map((extension) => path.join(base, `index${extension}`)),
  ];
  return candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile()) || null;
}

function visit(file) {
  if (visited.has(file)) return;
  visited.add(file);
  const source = readFileSync(file, 'utf8');
  const importPattern = /(?:import\s+(?:[^'"()]*?\s+from\s+)?|export\s+[^'"()]*?\s+from\s+|import\s*\()\s*['"]([^'"]+)['"]/g;
  for (const match of source.matchAll(importPattern)) {
    const dependency = resolveLocalImport(file, match[1]);
    if (dependency?.startsWith(sourceRoot)) visit(dependency);
  }
}

visit(entry);

const forbiddenImports = ['firebase/firestore', 'firebase/storage', 'firebase/analytics'];
const forbiddenModules = ['firebaseDb'];
const retiredCollections = [
  'meydanBasvurulari',
  'meydanBasvuruStats',
  'personelIzinler',
  'personelAnaKayitlari',
  'kronikSorunlar',
];

for (const file of visited) {
  const source = readFileSync(file, 'utf8');
  const relative = path.relative(process.cwd(), file);
  for (const marker of [...forbiddenImports, ...forbiddenModules, ...retiredCollections]) {
    assert.ok(!source.includes(marker), `Active source graph contains retired Firebase data marker "${marker}" in ${relative}`);
  }
}

const sourceFiles = [];
function collect(directory) {
  for (const entryItem of readdirSync(directory, { withFileTypes: true })) {
    const item = path.join(directory, entryItem.name);
    if (entryItem.isDirectory()) collect(item);
    else if (/\.(js|jsx|mjs)$/.test(entryItem.name)) sourceFiles.push(item);
  }
}
collect(sourceRoot);

const legacyFirebaseDataFiles = sourceFiles.filter((file) => {
  if (visited.has(file)) return false;
  const source = readFileSync(file, 'utf8');
  return /firebase\/(?:firestore|storage)|firebaseDb/.test(source);
});

console.log(`PASS: ${visited.size} active source modules use Supabase for product data; ${legacyFirebaseDataFiles.length} unreachable Firebase data modules remain isolated for archival tests.`);
