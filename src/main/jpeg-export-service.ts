import { createJpegExporter } from './jpeg-export-circuit.ts';
import { encodeJpegSnapshot } from './jpeg-export-engine.ts';
// Main-only singleton. No app/UI IPC is connected in this preparatory stage.
export const { exportJpeg } = createJpegExporter(encodeJpegSnapshot);
