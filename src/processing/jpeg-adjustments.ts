// Relative JPEG color controls, not Kelvin or RAW white-balance metadata.
// The caller supplies the same unedited, oriented sRGB RGBA base on each render.
export type JpegAdjustments = { exposureTenths: number; temperature: number; tint: number };

/** Pure byte transform. Allocates a detached result and preserves every alpha byte.
 * This module does not decode, orient, resize, crop, retain, or mutate the base.
 */
export function applyJpegAdjustments(base: Uint8ClampedArray, adjustments: JpegAdjustments): Uint8ClampedArray {
  if (base.length % 4 !== 0) throw new RangeError('JPEG adjustment pixels must be complete RGBA tuples.');
  const { exposureTenths, temperature, tint } = adjustments;
  if (!Number.isInteger(exposureTenths) || exposureTenths < -30 || exposureTenths > 30
    || !Number.isInteger(temperature) || temperature < -100 || temperature > 100
    || !Number.isInteger(tint) || tint < -100 || tint > 100) {
    throw new RangeError('JPEG adjustments must use canonical integer values within their ranges.');
  }
  const pixels = new Uint8ClampedArray(base);
  if (exposureTenths === 0 && temperature === 0 && tint === 0) return pixels;
  const gains = [1, 1, 1];
  if (temperature !== 0 || tint !== 0) {
    gains[0] = 2 ** (temperature / 200);
    gains[2] = 2 ** (-temperature / 200);
    gains[1] = 2 ** (-tint / 200);
    // W3C CSS Color 4's linear-sRGB-to-XYZ Y row. This normalizes neutral
    // gray luminance before clipping; arbitrary colored pixels can change Y.
    // The relative gain operator itself is specific to Revelumo, not a W3C WB standard.
    const normalization = (87098 / 409605) * gains[0] + (175762 / 245763) * gains[1] + (12673 / 175545) * gains[2];
    for (let channel = 0; channel < 3; channel++) gains[channel] /= normalization;
  }
  const exposureGain = 2 ** (exposureTenths / 10);
  const luts = gains.map((balanceGain) => {
    // Compose both linear operations before the only clipping/8-bit rounding.
    const gain = balanceGain * exposureGain, lut = new Uint8ClampedArray(256);
    for (let channel = 0; channel < 256; channel++) {
      const srgb = channel / 255;
      const linear = srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
      const adjusted = Math.min(1, linear * gain);
      lut[channel] = Math.round(255 * (adjusted <= 0.0031308 ? adjusted * 12.92 : 1.055 * adjusted ** (1 / 2.4) - 0.055));
    }
    return lut;
  });
  for (let i = 0; i < pixels.length; i += 4) { pixels[i] = luts[0][base[i]]; pixels[i + 1] = luts[1][base[i + 1]]; pixels[i + 2] = luts[2][base[i + 2]]; }
  return pixels;
}
