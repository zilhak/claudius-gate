import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        entry: 'src/main/index.cjs',
        vite: {
          build: {
            outDir: 'dist/main',
            lib: {
              entry: 'src/main/index.cjs',
              formats: ['cjs']
            },
            rollupOptions: {
              external: ['electron', 'path', 'fs', 'child_process'],
              output: {
                entryFileNames: '[name].cjs'
              }
            },
            copyPublicDir: false,
            ssr: true
          }
        }
      }
    ]),
    renderer()
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src/renderer')
    }
  },
  build: {
    outDir: 'dist/renderer',
    emptyOutDir: false
  },
  server: {
    port: 5173
  }
});