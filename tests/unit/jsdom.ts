import { JSDOM } from 'jsdom';

const dom = new JSDOM('', { url: 'http://localhost/' });
const testWindow = dom.window;
const jsdomGlobals = new Map<string, unknown>();

for (const key of Reflect.ownKeys(testWindow)) {
  if (typeof key !== 'string' || key in globalThis) continue;

  jsdomGlobals.set(key, Reflect.get(testWindow, key));
}

for (const [key, value] of jsdomGlobals) {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    enumerable: false,
    value,
    writable: true,
  });
}
