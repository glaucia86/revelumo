import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { PreferencesApi, LanguageSnapshot } from '../../shared/preferences-contract.ts';
import type { LanguageChoice } from '../../shared/i18n/locale.ts';
import type { MessageDescriptor } from '../../shared/i18n/messages.ts';
import { translate } from '../../shared/i18n/format.ts';

type LanguageContextValue = LanguageSnapshot & {
  pending: boolean;
  error: MessageDescriptor | null;
  setChoice(choice: LanguageChoice): Promise<void>;
  retry(): Promise<void>;
  t(message: MessageDescriptor): string;
};
const LanguageContext = createContext<LanguageContextValue | null>(null);
export function LanguageProvider({ api, children }: { api: PreferencesApi; children: React.ReactNode }) {
  const [snapshot, setSnapshot] = useState<LanguageSnapshot>({ choice: 'system', resolved: 'en', writable: true, notice: null });
  const [pending, setPending] = useState(true);
  const [error, setError] = useState<MessageDescriptor | null>(null);
  const busy = useRef(false);
  const attempted = useRef<LanguageChoice | null>(null);
  async function load() {
    if (busy.current) return;
    busy.current = true; setPending(true);
    try {
      const result = await api.getLanguage();
      if (result.ok) { setSnapshot(result.value); setError(null); }
      else setError(result.message);
    } catch { setError({ key: 'preferences.unreadable' }); }
    finally { busy.current = false; setPending(false); }
  }
  useEffect(() => { void load(); }, [api]);
  useEffect(() => { document.documentElement.lang = snapshot.resolved; }, [snapshot.resolved]);
  async function setChoice(choice: LanguageChoice) {
    if (busy.current) return;
    busy.current = true; attempted.current = choice; setPending(true); setError(null);
    try {
      const result = await api.setLanguage(choice);
      if (result.ok) { setSnapshot(result.value); attempted.current = null; }
      else setError(result.message);
    } catch { setError({ key: 'preferences.saveFailed' }); }
    finally { busy.current = false; setPending(false); }
  }
  const retry = () => attempted.current === null ? load() : setChoice(attempted.current);
  return <LanguageContext.Provider value={{ ...snapshot, pending, error, setChoice, retry, t: message => translate(snapshot.resolved, message) }}>{children}</LanguageContext.Provider>;
}
export function useLanguage(): LanguageContextValue {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('LanguageProvider is required');
  return context;
}
