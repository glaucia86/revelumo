/// <reference lib="webworker" />
// Only one selected image lives in this worker. Every adjustment starts from
// the same reduced, oriented, quantized sRGB base, never the prior output.
let base: Uint8ClampedArray | null = null;
let width = 0, height = 0, id = '', sessionId = '';
const context = self as unknown as DedicatedWorkerGlobalScope;
context.onmessage = async ({ data }) => {
  try {
    if (data.op === 'prepare') {
      id = data.id; sessionId = data.sessionId;
      const binary = atob(data.dataUrl.split(',')[1]);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/jpeg' }), { imageOrientation: 'from-image', colorSpaceConversion: 'default' });
      try {
        const scale = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height));
        width = Math.max(1, Math.round(bitmap.width * scale)); height = Math.max(1, Math.round(bitmap.height * scale));
        const canvas = new OffscreenCanvas(width, height), ctx = canvas.getContext('2d', { colorSpace: 'srgb', willReadFrequently: true });
        if (!ctx) throw new Error('Canvas unavailable');
        ctx.drawImage(bitmap, 0, 0, width, height);
        base = ctx.getImageData(0, 0, width, height, { colorSpace: 'srgb' }).data;
        // Free decoder and drawing surface; only the reduced neutral base stays.
        canvas.width = canvas.height = 1;
      } finally { bitmap.close(); }
      context.postMessage({ op: 'ready', id, sessionId, width, height });
    } else if (data.op === 'render' && base && data.id === id && data.sessionId === sessionId) {
      const pixels = new Uint8ClampedArray(base);
      if (data.exposureTenths !== 0) {
        const gain = 2 ** (data.exposureTenths / 10), lut = new Uint8ClampedArray(256);
        for (let channel = 0; channel < 256; channel++) {
          const srgb = channel / 255;
          const linear = srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
          const adjusted = Math.min(1, linear * gain);
          lut[channel] = Math.round(255 * (adjusted <= 0.0031308 ? adjusted * 12.92 : 1.055 * adjusted ** (1 / 2.4) - 0.055));
        }
        for (let i = 0; i < pixels.length; i += 4) { pixels[i] = lut[base[i]]; pixels[i + 1] = lut[base[i + 1]]; pixels[i + 2] = lut[base[i + 2]]; }
      }
      context.postMessage({ op: 'pixels', id, sessionId, revision: data.revision, width, height, buffer: pixels.buffer }, [pixels.buffer]);
    }
  } catch { context.postMessage({ op: 'error', id, sessionId, message: 'Não foi possível preparar a prévia de edição sRGB.' }); }
};
