/**
 * StorageService — cloud file storage abstraction.
 *
 * Primary: Cloudinary (free tier: 25 GB storage / 25 GB bandwidth per month)
 * Fallback: base64 data URL — only used when Cloudinary env vars are absent
 *           (local dev without a Cloudinary account). Never use in production.
 *
 * Swapping to AWS S3:
 *   Replace the uploadToCloudinary / deleteFromCloudinary implementations
 *   with @aws-sdk/client-s3 calls. The interface (UploadResult) stays identical
 *   so no other file needs to change.
 *
 * Required env vars:
 *   CLOUDINARY_CLOUD_NAME
 *   CLOUDINARY_API_KEY
 *   CLOUDINARY_API_SECRET
 */
import { v2 as cloudinary } from 'cloudinary';
import path from 'path';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface UploadResult {
  url:        string;   // public URL (Cloudinary CDN or data: URI for fallback)
  publicId:   string;   // Cloudinary public_id or '' for fallback
  storageKey: string;   // same as publicId for Cloudinary; S3 key otherwise
}

// ── Cloudinary config ─────────────────────────────────────────────────────────

function isCloudinaryConfigured(): boolean {
  return !!(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY    &&
    process.env.CLOUDINARY_API_SECRET
  );
}

function configureCloudinary(): void {
  if (!isCloudinaryConfigured()) return;
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key:    process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure:     true,
  });
}

configureCloudinary();

// ── Allowed MIME types ────────────────────────────────────────────────────────

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/plain',
]);

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB

// ── Upload ────────────────────────────────────────────────────────────────────

export async function uploadFile(
  buffer:       Buffer,
  originalName: string,
  mimeType:     string,
  folder:       string = 'ssi/presales'
): Promise<UploadResult> {

  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw Object.assign(new Error(`File type not allowed: ${mimeType}`), { statusCode: 400 });
  }
  if (buffer.byteLength > MAX_FILE_SIZE_BYTES) {
    throw Object.assign(
      new Error(`File exceeds 20 MB limit (${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB)`),
      { statusCode: 413 }
    );
  }

  if (isCloudinaryConfigured()) {
    return uploadToCloudinary(buffer, originalName, mimeType, folder);
  }

  // ── Dev fallback: base64 data URL (never for production) ─────────────────
  console.warn('[StorageService] Cloudinary not configured — storing as base64 (dev only)');
  const dataUrl = `data:${mimeType};base64,${buffer.toString('base64')}`;
  return { url: dataUrl, publicId: '', storageKey: '' };
}

async function uploadToCloudinary(
  buffer:       Buffer,
  originalName: string,
  mimeType:     string,
  folder:       string
): Promise<UploadResult> {
  const isPdf      = mimeType === 'application/pdf';
  const isImage    = mimeType.startsWith('image/');
  const resourceType: 'image' | 'raw' | 'auto' = isImage ? 'image' : 'raw';

  // Unique public_id: folder/timestamp-sanitisedName
  const safeName = path.parse(originalName).name
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 60);
  const publicId = `${folder}/${Date.now()}-${safeName}`;

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        public_id:     publicId,
        resource_type: resourceType,
        // PDFs: deliver as fl_attachment so browser downloads rather than renders
        ...(isPdf ? { flags: 'attachment' } : {}),
        // Keep originals — useful for re-processing
        overwrite: false,
      },
      (error, result) => {
        if (error || !result) return reject(error ?? new Error('Cloudinary upload failed'));
        resolve({
          url:        result.secure_url,
          publicId:   result.public_id,
          storageKey: result.public_id,
        });
      }
    );
    uploadStream.end(buffer);
  });
}

// ── Delete ────────────────────────────────────────────────────────────────────

export async function deleteFile(publicId: string, mimeType?: string): Promise<void> {
  if (!publicId || !isCloudinaryConfigured()) return;

  const isImage    = mimeType?.startsWith('image/') ?? false;
  const resourceType = isImage ? 'image' : 'raw';

  await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
}

// ── Multer middleware config (re-exported for use in routes) ──────────────────

import multer from 'multer';

export const dealUpload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) cb(null, true);
    else cb(new Error(`File type not allowed: ${file.mimetype}`));
  },
});
