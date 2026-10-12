import { isLanguageChoice, type LanguageChoice } from './i18n/locale.ts';
export type PreferencesRequest = { op: 'get-language' } | { op: 'set-language'; choice: LanguageChoice };

export function parsePreferencesRequest(input: unknown): PreferencesRequest | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  if (value.op === 'get-language' && Object.keys(value).length === 1) return { op: 'get-language' };
  if (value.op === 'set-language' && Object.keys(value).length === 2 && isLanguageChoice(value.choice)) return { op: 'set-language', choice: value.choice };
  return null;
}
