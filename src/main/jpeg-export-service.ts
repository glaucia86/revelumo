import { createJpegExporter } from './jpeg-export-circuit.ts';
import { encodeJpegSnapshot } from './jpeg-export-engine.ts';
// Main-only singleton shared by authorized export jobs.
export const { exportJpeg } = createJpegExporter(encodeJpegSnapshot);
