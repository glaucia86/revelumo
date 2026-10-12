import type { PreferencesApi } from './shared/preferences-contract.ts';
import type { RevelumoApi } from './shared/contracts.ts';
declare global {
  const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
  const MAIN_WINDOW_VITE_NAME: string;
  interface Window { revelumo: RevelumoApi; revelumoPreferences: PreferencesApi; }
}
export {};
