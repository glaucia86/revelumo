import type { JpegAdjustments } from './jpeg-adjustments.ts';
export type ExportRecipe = JpegAdjustments & { processingVersion: 2 };
export function parseExportRecipe(input: unknown): ExportRecipe | null { if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  if (Object.keys(value).sort().join(',') !== 'exposureTenths,processingVersion,temperature,tint' || value.processingVersion !== 2) return null;
  for (const field of ['exposureTenths', 'temperature', 'tint']) {
    const limit = field === 'exposureTenths' ? 30 : 100, control = value[field];
    if (typeof control !== 'number' || !Number.isInteger(control) || Math.abs(control) > limit) return null;
  }
  return { ...(input as ExportRecipe) }; }
export const JPEG_CODEC_FAILURES = ['ENCODE_FAILED', 'OUTPUT_TOO_LARGE', 'CANVAS_UNAVAILABLE', 'SOURCE_TOO_LARGE', 'UNSUPPORTED_RECIPE'] as const;
