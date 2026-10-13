// Trust comes from the official electron npm package fixed by package-lock.json,
// never from hashing an already downloaded ZIP to invent its expected digest.
export function electronDownloadChecksums(input: {
  expectedVersion: string; installedVersion: string;
  platform: string; arch: string; checksums: unknown;
}): Record<string, string> {
  if (!/^\d+\.\d+\.\d+$/.test(input.expectedVersion) || input.installedVersion !== input.expectedVersion) {
    throw new Error('Installed Electron version must match the exact pinned version');
  }
  const artifact = `electron-v${input.expectedVersion}-${input.platform}-${input.arch}.zip`;
  if (!input.checksums || typeof input.checksums !== 'object' || Array.isArray(input.checksums)) {
    throw new Error('Official Electron checksums are missing');
  }
  const checksums = input.checksums as Record<string, unknown>;
  if (typeof checksums[artifact] !== 'string' || !/^[a-f0-9]{64}$/i.test(checksums[artifact])) {
    throw new Error(`Official checksum is missing or invalid for ${artifact}`);
  }
  for (const digest of Object.values(checksums)) {
    if (typeof digest !== 'string' || !/^[a-f0-9]{64}$/i.test(digest)) throw new Error('Invalid official Electron checksum');
  }
  return { ...checksums } as Record<string, string>;
}
