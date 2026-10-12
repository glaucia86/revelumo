export type UiLanguage = 'pt-BR' | 'en' | 'es';
export type LanguageChoice = 'system' | UiLanguage;

export function isLanguageChoice(value: unknown): value is LanguageChoice {
  return value === 'system' || value === 'pt-BR' || value === 'en' || value === 'es';
}

export function resolveLanguage(choice: LanguageChoice, preferred: unknown): UiLanguage {
  if (choice !== 'system') return choice;
  if (!Array.isArray(preferred)) return 'en';
  for (const language of preferred) {
    if (typeof language !== 'string') continue;
    const normalized = language.replace(/\.(?:UTF-?8|ISO-8859-\d+)(?=@|$)/i, '').replace(/@(?:euro|latin|cyrillic)$/i, '').replaceAll('_', '-');
    try {
      const base = new Intl.Locale(normalized).language;
      if (base === 'pt') return 'pt-BR';
      if (base === 'en' || base === 'es') return base;
    } catch { /* Invalid OS entries do not prevent the next preference. */ }
  }
  return 'en';
}
