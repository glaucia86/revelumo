import type { ForgeConfig } from '@electron-forge/shared-types';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { createRequire } from 'node:module';
import { electronDownloadChecksums } from './scripts/electron-download-checksums.ts';
const require = createRequire(import.meta.url);
const checksums = electronDownloadChecksums({
  expectedVersion: require('./package.json').devDependencies.electron,
  installedVersion: require('electron/package.json').version,
  platform: process.platform, arch: process.arch,
  checksums: require('electron/checksums.json'),
});
const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    download: { checksums, ...(process.env.electron_config_cache ? { cacheRoot: process.env.electron_config_cache } : {}) },
  },
  rebuildConfig: {},
  // Installers/distribution are deliberately outside this first local slice.
  makers: [],
  plugins: [new VitePlugin({
    build: [
      { entry: 'src/main/index.ts', config: 'vite.main.config.mts', target: 'main' },
      { entry: 'src/main/jpeg-export-service.ts', config: 'vite.main.config.mts', target: 'main' },
      { entry: 'src/main/jpeg-export-engine.ts', config: 'vite.main.config.mts', target: 'main' },
      { entry: 'src/export-preload.ts', config: 'vite.preload.config.mts', target: 'preload' },
      { entry: 'src/preload.ts', config: 'vite.preload.config.mts', target: 'preload' },
    ],
    renderer: [{ name: 'main_window', config: 'vite.renderer.config.mts' }, { name: 'jpeg_export', config: 'vite.export.config.mts' }],
  })],
};
export default config;
