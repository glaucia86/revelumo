import type { PreferencesStore } from './preferences.ts';
import type { LanguageSnapshot, PreferencesResult } from '../shared/preferences-contract.ts';
import { parsePreferencesRequest } from '../shared/preferences-request.ts';
import { isTrustedDocument } from './trusted-document.ts';

type Frame = { url: string };
type Owner = { mainFrame: Frame };
type Event = { sender: unknown; senderFrame: Frame | null };
export async function handlePreferencesRequest(store: PreferencesStore, event: Event, owner: Owner | null, entryUrl: string, input: unknown): Promise<PreferencesResult<LanguageSnapshot>> {
  if (!owner || event.sender !== owner || event.senderFrame !== owner.mainFrame || !isTrustedDocument(event.senderFrame.url, entryUrl)) {
    return { ok: false, code: 'invalid-request', message: { key: 'preferences.invalidRequest' } };
  }
  const request = parsePreferencesRequest(input);
  if (!request) return { ok: false, code: 'invalid-request', message: { key: 'preferences.invalidRequest' } };
  if (request.op === 'get-language') return { ok: true, value: await store.read() };
  return store.setLanguage(request.choice);
}
