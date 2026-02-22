import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';
import type { Plugin } from 'vite';

const pkg = JSON.parse(readFileSync(resolve('package.json'), 'utf-8')) as { version: string };

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/types'),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/types'),
      },
    },
  },
  renderer: {
    plugins: [
      react(),
      tailwindcss(),
      visualizer({ open: false, filename: 'stats.html', gzipSize: true }) as unknown as Plugin,
    ],
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer'),
        '@shared': resolve('src/types'),
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: (id) => {
            if (!id.includes('node_modules')) return undefined;
            if (id.includes('/react-dom/') || id.includes('/react/') || id.includes('/scheduler/')) {
              return 'vendor-react';
            }
            if (id.includes('/zustand/')) return 'vendor-state';
            if (id.includes('/@tanstack/')) return 'vendor-virtual';
            if (id.includes('/dompurify/')) return 'vendor-sanitize';
            return undefined;
          },
        },
      },
    },
  },
});
