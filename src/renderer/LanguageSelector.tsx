import React from 'react';
import { useLanguage } from './i18n/LanguageProvider.tsx';
import { isLanguageChoice } from '../shared/i18n/locale.ts';
import './language.css';
export function LanguageSelector() {
  const { choice, pending, writable, notice, error, t, setChoice, retry } = useLanguage();
  return <div className="language-control">
    <label htmlFor="language-choice">{t({ key: 'preferences.language' })}</label>
    <select id="language-choice" value={choice} disabled={pending || !writable} aria-describedby={notice || error ? 'language-notice' : undefined} onChange={event => { const value = event.target.value; if (isLanguageChoice(value)) void setChoice(value); }}>
      <option value="system">{t({ key: 'preferences.system' })}</option>
      <option value="pt-BR">Português (Brasil)</option><option value="en">English</option><option value="es">Español</option>
    </select>
    {(notice || error) && <div id="language-notice" className="language-notice" role="status"><span>{t(error ?? { key: notice === 'future' ? 'preferences.future' : notice === 'invalid' ? 'preferences.invalid' : 'preferences.unreadable' })}</span>{!writable && <p>{t({ key: 'preferences.readOnly' })}</p>}{(error || !writable) && <button disabled={pending} onClick={() => void retry()}>{t({ key: 'preferences.retry' })}</button>}</div>}
  </div>;
}
