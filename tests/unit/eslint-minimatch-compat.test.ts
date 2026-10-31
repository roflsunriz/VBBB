import { resolve } from 'node:path';
import { Linter } from 'eslint';
import importX from 'eslint-plugin-import-x';
import { describe, expect, it } from 'vitest';

function lintImports(
  options: { allow?: string[]; forbid?: string[] },
  source = "import 'react-dom/client';\nimport 'react-dom/server';\n",
) {
  const linter = new Linter();
  return linter.verify(
    source,
    [
      {
        languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
        plugins: { 'import-x': importX },
        rules: { 'import-x/no-internal-modules': ['error', options] },
      },
    ],
    { filename: resolve(process.cwd(), 'src/example.js') },
  );
}

describe('import-x glob compatibility', () => {
  it('reports only forbidden submodule patterns', () => {
    const messages = lintImports({ forbid: ['react-dom/cli*'] });
    expect(messages.map((message) => message.line)).toEqual([1]);
  });

  it('permits configured submodule patterns and rejects the others', () => {
    const messages = lintImports({ allow: ['react-dom/cli*'] });
    expect(messages.map((message) => message.line)).toEqual([2]);
  });

  it('expands brace patterns when checking forbidden imports', () => {
    const messages = lintImports({ forbid: ['react-dom/{client,server}'] });
    expect(messages.map((message) => message.line)).toEqual([1, 2]);
  });

  it('uses the default glob behavior for hidden path segments', () => {
    const messages = lintImports(
      { forbid: ['react-dom/**'] },
      "import 'react-dom/.hidden';\nimport 'react-dom/client';\n",
    );
    expect(messages.map((message) => message.line)).toEqual([2]);
  });
});
