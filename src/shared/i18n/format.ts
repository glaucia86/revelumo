import type { UiLanguage } from './locale.ts';
import { messageParameters, type Dictionary, type MessageDescriptor, type MessageKey, type MessageTemplate } from './messages.ts';
import { messages as en } from './locales/en.ts';
import { messages as es } from './locales/es.ts';
import { messages as ptBR } from './locales/pt-BR.ts';

export const dictionaries = { en, es, 'pt-BR': ptBR } satisfies Record<UiLanguage, Dictionary>;
const numberLocales = { en: 'en-US', es: 'es-ES', 'pt-BR': 'pt-BR' } as const;
export function formatNumber(locale: UiLanguage, value: number): string {
  return new Intl.NumberFormat(numberLocales[locale]).format(value);
}

/** Validate IPC data as well as typed callers; never display unknown failure payloads. */
export function isMessageDescriptor(value: unknown): value is MessageDescriptor {
  if (!value || typeof value !== 'object' || !('key' in value) || typeof value.key !== 'string' || !Object.hasOwn(messageParameters, value.key)) return false;
  const schema = messageParameters[value.key as MessageKey];
  if (Object.keys(schema).length === 0) return !('params' in value) || value.params === undefined;
  if (!('params' in value) || !value.params || typeof value.params !== 'object') return false;
  const params = value.params as Record<string, unknown>;
  return Object.keys(params).length === Object.keys(schema).length && Object.entries(schema).every(([key, kind]) =>
    Object.hasOwn(params, key) && typeof params[key] === kind && (kind !== 'number' || Number.isFinite(params[key])));
}

export function translate(locale: UiLanguage, descriptor: MessageDescriptor): string {
  const dictionary: Partial<Dictionary> = dictionaries[locale] ?? dictionaries.en;
  if (!isMessageDescriptor(descriptor)) return String(dictionary['errors.generic'] ?? en['errors.generic']);
  const template: MessageTemplate = dictionary[descriptor.key] ?? en[descriptor.key];
  const params: Record<string, string | number> = descriptor.params ?? {};
  const text = typeof template === 'string' ? template : new Intl.PluralRules(numberLocales[locale]).select(Number(params[template.plural ?? 'count'])) === 'one' ? template.one : template.other;
  return text.replace(/\{(\w+)\}/g, (_, key: string) => typeof params[key] === 'number' ? formatNumber(locale, params[key]) : String(params[key]));
}
