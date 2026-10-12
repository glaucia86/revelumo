import { defineConfig } from 'vite';
import { resolve } from 'node:path';
export default defineConfig({ root: resolve('src/export-renderer'), base: './', build: { outDir: resolve('.vite/renderer/jpeg_export') } });
