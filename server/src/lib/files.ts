/**
 * Private file storage.
 *
 * - Files are stored on disk under UPLOAD_DIR (outside the web root) with random
 *   names; the client-supplied filename is kept only as metadata and never used
 *   as a path component (no path traversal).
 * - Extension + MIME allowlists and size limits are enforced server-side.
 * - Downloads go through an authenticated API route with per-owner authorization.
 */
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, createWriteStream, statSync, unlinkSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { MultipartFile } from '@fastify/multipart';
import type { Db } from '../db/index.js';
import { files } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { config } from '../config.js';

const ALLOWED: Record<string, string[]> = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'application/pdf': ['.pdf'],
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/vnd.ms-excel': ['.xls'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'text/plain': ['.txt'],
};

// Magic-byte sniffing for the common types (defense in depth: never trust client MIME).
export function sniffMime(buf: Buffer): string | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length >= 4 && buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  if (buf.length >= 5 && buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  if (buf.length >= 4 && buf.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) return 'application/zip'; // docx/xlsx are zip containers
  return null;
}

export class FileValidationError extends Error {}

export interface StoredFile {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
}

export async function storeUpload(
  db: Db,
  part: MultipartFile,
  owner: { type: string; id?: string | null },
  uploadedBy?: string | null,
  visibility: 'private' | 'public' = 'private',
): Promise<StoredFile> {
  const maxBytes = config.maxUploadMb * 1024 * 1024;
  const originalName = (part.filename ?? 'upload').slice(0, 280).replace(/[^\w.\-\u0600-\u06FF ()]/g, '_');
  const ext = extname(originalName).toLowerCase();

  const claimedMime = part.mimetype?.toLowerCase() ?? '';
  if (!ALLOWED[claimedMime] || !ALLOWED[claimedMime].includes(ext)) {
    await part.toBuffer().catch(() => undefined);
    throw new FileValidationError(`File type not allowed: ${claimedMime || 'unknown'} (${ext || 'no extension'})`);
  }

  const buf = await part.toBuffer();
  if (buf.length > maxBytes) throw new FileValidationError(`File too large (max ${config.maxUploadMb}MB)`);
  if (buf.length === 0) throw new FileValidationError('Empty file');

  const sniffed = sniffMime(buf);
  const zipOk = ['application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'].includes(claimedMime);
  if (sniffed && sniffed !== claimedMime && !(sniffed === 'application/zip' && zipOk)) {
    throw new FileValidationError('File content does not match its declared type');
  }
  if (!sniffed && !['application/msword', 'application/vnd.ms-excel', 'text/plain'].includes(claimedMime)) {
    throw new FileValidationError('Unrecognized file content');
  }

  const storedName = `${randomUUID()}${ext}`;
  mkdirSync(config.uploadDir, { recursive: true });
  const dest = join(config.uploadDir, storedName);
  await pipeline(bufToStream(buf), createWriteStream(dest, { mode: 0o600 }));

  const sha = createHash('sha256').update(buf).digest('hex');
  const [row] = await db.insert(files).values({
    storedName,
    originalName,
    mimeType: claimedMime,
    sizeBytes: buf.length,
    sha256: sha,
    ownerType: owner.type,
    ownerId: owner.id ?? null,
    visibility,
    uploadedBy: uploadedBy ?? null,
  }).returning({ id: files.id });

  return { id: row!.id, originalName, mimeType: claimedMime, sizeBytes: buf.length };
}

import { Readable } from 'node:stream';
function bufToStream(buf: Buffer): Readable {
  return Readable.from(buf);
}

export function filePathOnDisk(storedName: string): string {
  // storedName is always a server-generated UUID+safe ext, but double-check anyway.
  if (!/^[0-9a-f-]{36}\.[a-z0-9]{1,10}$/i.test(storedName)) throw new FileValidationError('Invalid stored file name');
  const p = join(config.uploadDir, storedName);
  if (!existsSync(p)) throw new FileValidationError('File missing on disk');
  return p;
}

export async function deleteFile(db: Db, fileId: string): Promise<void> {
  const [row] = await db.select().from(files).where(eq(files.id, fileId)).limit(1);
  if (!row) return;
  try {
    const p = join(config.uploadDir, row.storedName);
    if (statSync(p, { throwIfNoEntry: false })) unlinkSync(p);
  } catch { /* ignore disk errors */ }
  await db.delete(files).where(eq(files.id, fileId));
}
