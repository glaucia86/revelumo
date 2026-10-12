import type { MessageDescriptor, MessageKey } from './i18n/messages.ts';
export function exportFailureMessage(code: string | undefined): MessageDescriptor {
  const keys: Record<string, MessageKey> = {
    OUTPUT_TOO_LARGE: 'export.outputLimit', SOURCE_TOO_LARGE: 'export.sourceLimit',
    DESTINATION_EXISTS: 'export.exists', PROTECTED_DESTINATION: 'export.protected', INVALID_DESTINATION: 'export.destination',
    IDENTITY_UNVERIFIED: 'export.identity', IDENTITY_MISMATCH: 'export.identity', SOURCE_CHANGED: 'export.identity',
    SOURCE_UNREADABLE: 'export.unreadable', NOT_REGULAR_FILE: 'export.unreadable',
    METADATA_NOT_PRESERVABLE: 'export.metadata', ATOMIC_PUBLICATION_UNAVAILABLE: 'export.atomic',
    UNSUPPORTED_RECIPE: 'export.recipe', 'invalid-request': 'export.revision', BUSY: 'export.busy',
    UNKNOWN_JOB: 'export.uncertain', SAVE_NOT_CONFIRMED: 'export.saveFirst', PREVIEW_NOT_READY: 'export.previewFirst',
  };
  return { key: keys[code ?? ''] ?? 'export.failed' } as MessageDescriptor;
}
