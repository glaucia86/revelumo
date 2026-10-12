import { parseExportRecipe } from '../processing/jpeg-export-contract.ts';
import { adjustJpegCanvas } from './strips.ts';
export async function encodeFullResolution(source: Uint8Array<ArrayBuffer>, recipe: unknown, maximumOutputBytes: number) {
  const adjustments = parseExportRecipe(recipe);
  if (!adjustments) throw new Error('UNSUPPORTED_RECIPE');
  let bitmap: ImageBitmap | undefined, canvas: OffscreenCanvas | undefined;
  try {
    bitmap = await createImageBitmap(new Blob([source], { type: 'image/jpeg' }), { imageOrientation: 'from-image', colorSpaceConversion: 'default' });
    const { width, height } = bitmap;
    if (width * height > 40_000_000) throw new Error('SOURCE_TOO_LARGE');
    canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d', { colorSpace: 'srgb', willReadFrequently: true });
    if (!context) throw new Error('CANVAS_UNAVAILABLE');
    context.drawImage(bitmap, 0, 0); bitmap.close(); bitmap = undefined;
    adjustJpegCanvas(context, width, height, adjustments);
    const encoded = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.90 });
    if (encoded.type !== 'image/jpeg') throw new Error('ENCODE_FAILED');
    if (encoded.size > maximumOutputBytes) throw new Error('OUTPUT_TOO_LARGE');
    return { bytes: new Uint8Array(await encoded.arrayBuffer()), width, height };
  } finally { bitmap?.close(); if (canvas) canvas.width = canvas.height = 1; }
}
