import type { LanguageChoice, UiLanguage } from './i18n/locale.ts';
export type LanguageSnapshot = {
  choice: LanguageChoice;
  resolved: UiLanguage;
  writable: boolean;
  notice: null | 'invalid' | 'unreadable' | 'future';
};
export type PreferencesFailure = { ok: false; code: 'invalid-request' | 'settings-unavailable'; message: { key: 'preferences.invalidRequest' | 'preferences.saveFailed' | 'preferences.future' } };
export type PreferencesResult<T> = { ok: true; value: T } | PreferencesFailure;
export interface PreferencesApi {
  getLanguage(): Promise<PreferencesResult<LanguageSnapshot>>;
  setLanguage(choice: LanguageChoice): Promise<PreferencesResult<LanguageSnapshot>>;
}
