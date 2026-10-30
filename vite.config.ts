import { defineConfig } from 'vitest/config';
import buildInfo from './public/build-info.json';

export default defineConfig({
  define: { __LYRION_BUILD__: JSON.stringify(buildInfo) },
  base: './',
  resolve: { preserveSymlinks: true },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: { three: ['three'] },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
