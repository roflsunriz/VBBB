import { readFileSync } from 'fs';
const html = readFileSync('stats.html', 'utf-8');

const idx = html.indexOf('const data = {');
const chunk = html.substring(idx + 'const data = '.length);
let depth = 0,
  i = 0;
for (; i < chunk.length; i++) {
  if (chunk[i] === '{') depth++;
  else if (chunk[i] === '}') {
    depth--;
    if (depth === 0) break;
  }
}
const data = JSON.parse(chunk.substring(0, i + 1));

// Find the index (main) bundle
const mainBundle = data.tree.children.find((c) => c.name?.includes('index-'));
console.log('Main bundle:', mainBundle?.name);

// Walk the index bundle and collect all module names
function collectNames(node, results, maxDepth, curDepth) {
  if (curDepth > maxDepth) return;
  const n = node.name || '';
  if ((n && !n.includes('root') && !n.endsWith('.js')) || n.includes('node_modules')) {
    results.push({ name: n, depth: curDepth });
  }
  for (const child of node.children || []) {
    collectNames(child, results, maxDepth, curDepth + 1);
  }
}

const names = [];
collectNames(mainBundle, names, 10, 0);

// Find node_modules packages
const pkgSet = new Set();
for (const { name } of names) {
  const m = name.match(/node_modules\/((?:@[^/]+\/[^/]+|[^/]+))/);
  if (m) pkgSet.add(m[1]);
}

console.log('\n=== Packages in main index bundle ===');
for (const pkg of [...pkgSet].sort()) {
  console.log(' -', pkg);
}

// Show top-level src modules
const srcModules = names.filter((n) => n.name.includes('/src/'));
console.log('\n=== Src module groups in index bundle ===');
const srcSet = new Set();
for (const { name } of srcModules) {
  const m = name.match(/src\/([^/]+)/);
  if (m) srcSet.add(m[1]);
}
for (const s of [...srcSet].sort()) console.log(' -', s);
