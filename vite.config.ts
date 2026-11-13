import { defineConfig } from 'vitest/config';
import buildInfo from './public/build-info.json';

export default defineConfig({
  define: { __LYRION_BUILD__: JSON.stringify(buildInfo) },
  base: './',
  resolve: { preserveSymlinks: true },
  build: {
    // Native esbuild's large-input async file path terminates on this Windows
    // host. Terser handles the larger modern Three.js modules without that path.
    // All supported rendering browsers already support the emitted ES modules.
    target: 'esnext',
    minify: 'terser',
    terserOptions: {ecma:2022,compress:{passes:1},format:{comments:false}},
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
