import { readFileSync } from 'fs';
const content = readFileSync('out/renderer/assets/index-D6TLeTg_.js', 'utf-8');

console.log('Total size:', (content.length / 1024).toFixed(1), 'KB');

// Check for zod in main bundle
const hasZod = content.includes('ZodType') || content.includes('ZodString');
console.log('Contains Zod:', hasZod);

// Check for react in main bundle
const hasReact = content.includes('createElement') && content.includes('useEffect');
console.log('Contains React-like code:', hasReact);

// Estimate @mdi/js icon sizes by looking at SVG path data
// MDI paths are long SVG path strings starting with 'M'
// Each icon is typically 100-400 bytes
const mdiMatches = content.match(/mdi[A-Z][a-zA-Z]+\s*=\s*"M[^"]{50,}"/g) || [];
let mdiTotalSize = 0;
for (const m of mdiMatches) {
  mdiTotalSize += m.length;
}
console.log('\n@mdi/js icons in bundle:');
console.log('  Count:', mdiMatches.length);
console.log('  Approx size:', (mdiTotalSize / 1024).toFixed(1), 'KB');

// Count lines
const lines = content.split('\n');
console.log('\nBundle lines:', lines.length);

// Check top-level function/variable names to estimate what's app code vs vendor
// Look for common React hooks pattern
const hookMatches = content.match(/use[A-Z][a-zA-Z]+/g) || [];
const uniqueHooks = [...new Set(hookMatches)].filter(h => !['useState', 'useEffect', 'useCallback', 'useMemo', 'useRef', 'useContext', 'useReducer', 'useId', 'useLayoutEffect', 'useSyncExternalStore', 'useTransition', 'useDeferredValue', 'useInsertionEffect', 'useDebugValue'].includes(h));
console.log('\nCustom hooks found:', uniqueHooks.length);
uniqueHooks.sort().forEach(h => console.log(' -', h));
