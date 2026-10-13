import { prepareJpegAdjustments } from '../processing/jpeg-adjustments.ts';
import type { ExportRecipe } from '../processing/jpeg-export-contract.ts';
export function adjustJpegCanvas(context: Pick<OffscreenCanvasRenderingContext2D, 'getImageData' | 'putImageData'>, width: number, height: number, recipe: ExportRecipe): void {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) throw new RangeError('Invalid raster dimensions.');
  const prepared = prepareJpegAdjustments(recipe);
  const rows = Math.max(1, Math.floor(1024 * 1024 / (width * 4)));
  for (let y = 0; y < height; y += rows) {
    const image = context.getImageData(0, y, width, Math.min(rows, height - y), { colorSpace: 'srgb' });
    prepared.applyInPlace(image.data);
    context.putImageData(image, 0, y);
  }
}
