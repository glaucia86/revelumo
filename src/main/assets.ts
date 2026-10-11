import { extname, resolve, sep } from 'node:path';
export function assetPath(root: string, input: string): string | null {
  try {
    const url = new URL(input);
    if (url.protocol !== 'app:' || url.hostname !== 'revelumo' || url.port || url.username || url.password) return null;
    const pathname = decodeURIComponent(url.pathname);
    if (pathname.includes('\\') || pathname.includes('\0') || pathname.startsWith('//')) return null;
    const target = resolve(root, '.' + pathname);
    if (!target.startsWith(resolve(root) + sep)) return null;
    if (!['.html', '.js', '.css', '.svg', '.woff2'].includes(extname(target))) return null;
    return target;
  } catch { return null; }
}
