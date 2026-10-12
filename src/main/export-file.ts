import * as fs from 'node:fs/promises';
import type { BigIntStats } from 'node:fs';
import { basename, dirname, join, resolve, sep } from 'node:path';

export interface ExportFileRequest {
  bytes: Uint8Array;
  destination: string;
  originalPaths: readonly string[];
  protectedDirectories: readonly string[];
  maximumBytes: number;
  signal?: AbortSignal;
}

export class ExportFileError extends Error {
  readonly code: string;
  cleanupPending = false;
  constructor(code: string, message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'ExportFileError';
    this.code = code;
  }
}

async function canonicalPath(path: string, filesystem: typeof fs): Promise<string> {
  const absolute = resolve(path);
  try { return await filesystem.realpath(absolute); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || dirname(absolute) === absolute) throw error;
    return join(await canonicalPath(dirname(absolute), filesystem), basename(absolute));
  }
}

function sameRegularFile(current: BigIntStats, expected: BigIntStats | undefined): boolean {
  return !!expected && current.isFile() && current.dev === expected.dev && current.ino === expected.ino;
}

/** Main-only publication of already validated bytes. Cancellation is accepted
 * until submitting link(); the in-flight filesystem operation is not cancelable.
 * Private staging is not a security boundary against equally privileged processes
 * that deliberately mutate its names or contents between filesystem operations.
 */
export async function publishNewExport(request: ExportFileRequest, filesystem: typeof fs = fs) {
  if (request.signal?.aborted) throw new ExportFileError('CANCELED', 'Export canceled before publication.');
  if (!Number.isSafeInteger(request.maximumBytes) || request.maximumBytes <= 0 || request.bytes.byteLength === 0) {
    throw new ExportFileError('INVALID_OUTPUT', 'Export requires nonempty bytes and an explicit positive integer byte budget.');
  }
  if (request.bytes.byteLength > request.maximumBytes) {
    throw new ExportFileError('OUTPUT_TOO_LARGE', 'The encoded JPEG exceeds the export byte budget. Quality and dimensions were not reduced.');
  }
  request = { ...request, bytes: Buffer.from(request.bytes), originalPaths: [...request.originalPaths], protectedDirectories: [...request.protectedDirectories] };
  const destination = join(await filesystem.realpath(dirname(resolve(request.destination))), basename(request.destination));
  const originals = await Promise.all(request.originalPaths.map(async path =>
    join(await canonicalPath(dirname(resolve(path)), filesystem), basename(path))));
  const protectedDirectories = await Promise.all(request.protectedDirectories.map(path => canonicalPath(path, filesystem)));
  // Conservative on case-sensitive disks too: never reuse an absent original's
  // name merely with different case or canonical Unicode spelling.
  const comparisonPath = (path: string) => path.normalize('NFC').toLowerCase();
  const destinationKey = comparisonPath(destination);
  if (originals.some(path => comparisonPath(path) === destinationKey) || protectedDirectories.some(path => {
    const key = comparisonPath(path);
    return destinationKey === key || destinationKey.startsWith(key.endsWith(sep) ? key : key + sep);
  })) {
    throw new ExportFileError('PROTECTED_DESTINATION', 'Choose a destination outside the original and catalog paths.');
  }
  const directory = await filesystem.mkdtemp(join(dirname(destination), '.revelumo-export-'));
  const temporary = join(directory, 'payload');
  const result = { path: destination, cleanupPending: false };
  let failure: ExportFileError | undefined;
  let directoryIdentity: BigIntStats;
  try { directoryIdentity = await filesystem.lstat(directory, { bigint: true }); }
  catch (error) {
    const failure = new ExportFileError('WRITE_FAILED', 'The temporary directory could not be verified. Cleanup may be needed.', error);
    failure.cleanupPending = true;
    throw failure;
  }
  let fileIdentity: BigIntStats | undefined;
  let handle: fs.FileHandle | undefined;
  try {
    handle = await filesystem.open(temporary, 'wx', 0o600);
    fileIdentity = await handle.stat({ bigint: true });
    await handle.writeFile(request.bytes);
    await handle.sync();
    const current = await filesystem.lstat(temporary, { bigint: true });
    if (!sameRegularFile(current, fileIdentity)) {
      throw new ExportFileError('STAGING_CHANGED', 'The staged file changed. No export was published.');
    }
    if (request.signal?.aborted) throw new ExportFileError('CANCELED', 'Export canceled before publication.');
    // Cancellation beyond this point cannot revoke the in-flight commit. The
    // caller must reconcile the eventual result, never report a premature cancel.
    try { await filesystem.link(temporary, destination); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        throw new ExportFileError('DESTINATION_EXISTS', 'Choose a new filename; the destination already exists.', error);
      }
      throw new ExportFileError('ATOMIC_PUBLICATION_UNAVAILABLE', 'This destination cannot safely publish without replacing files. Choose another local folder.', error);
    }
    return result;
  } catch (error) {
    failure = error instanceof ExportFileError ? error
      : new ExportFileError('WRITE_FAILED', 'The export could not be written. No destination was published.', error);
    throw failure;
  } finally {
    try {
      await handle?.close();
      const currentDirectory = await filesystem.lstat(directory, { bigint: true });
      if (!currentDirectory.isDirectory() || currentDirectory.dev !== directoryIdentity.dev || currentDirectory.ino !== directoryIdentity.ino) {
        throw new Error('The staging directory changed ownership.');
      }
      if (handle) {
        const current = await filesystem.lstat(temporary, { bigint: true });
        if (!sameRegularFile(current, fileIdentity)) {
          throw new Error('The staging pathname no longer identifies this export.');
        }
        await filesystem.unlink(temporary);
      }
      await filesystem.rmdir(directory);
    } catch {
      result.cleanupPending = true;
      if (failure) failure.cleanupPending = true;
    }
  }
}
