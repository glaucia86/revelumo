import type { ForgeConfig } from '@electron-forge/shared-types';
import { VitePlugin } from '@electron-forge/plugin-vite';
const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    download: process.env.electron_config_cache ? { cacheRoot: process.env.electron_config_cache } : undefined,
  },
  rebuildConfig: {},
  // Installers/distribution are deliberately outside this first local slice.
  makers: [],
  plugins: [new VitePlugin({
    build: [
      { entry: 'src/main/index.ts', config: 'vite.main.config.mts', target: 'main' },
      { entry: 'src/main/jpeg-export-engine.ts', config: 'vite.main.config.mts', target: 'main' },
      { entry: 'src/export-preload.ts', config: 'vite.preload.config.mts', target: 'preload' },
      { entry: 'src/preload.ts', config: 'vite.preload.config.mts', target: 'preload' },
    ],
    renderer: [{ name: 'main_window', config: 'vite.renderer.config.mts' }, { name: 'jpeg_export', config: 'vite.export.config.mts' }],
  })],
};
export default config;
