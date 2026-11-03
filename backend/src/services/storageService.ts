// ──────────────────────────────────────────────────────────────
// Supabase Storage Service — centralised file operations
// ──────────────────────────────────────────────────────────────
// Uses the service-role client so the backend has full access to
// the private "material-data" bucket.  The secret key is NEVER
// exposed to the frontend.
// ──────────────────────────────────────────────────────────────

import { supabaseAdmin } from '../config/supabase';
import { config } from '../config';

const bucket = () => supabaseAdmin.storage.from(config.storage.bucketName);

interface CachedSignedUrl {
  url: string;
  expiresAt: number;
}

const signedUrlCache = new Map<string, CachedSignedUrl>();
const SIGNED_URL_SAFETY_MARGIN_MS = 60 * 1000; // 1 minute safety buffer before true expiry

export const storageService = {
  // ── Upload ──────────────────────────────────────────────────

  /** Upload a Buffer to Supabase Storage. */
  async uploadFile(
    key: string,
    body: Buffer,
    contentType: string
  ): Promise<void> {
    const { error } = await bucket().upload(key, body, {
      contentType,
      upsert: false, // fail if object already exists
    });
    if (error) throw new Error(`Storage upload failed: ${error.message}`);
  },

  /** Upload a Buffer, overwriting if it already exists. */
  async upsertFile(
    key: string,
    body: Buffer,
    contentType: string
  ): Promise<void> {
    const { error } = await bucket().upload(key, body, {
      contentType,
      upsert: true,
    });
    if (error) throw new Error(`Storage upsert failed: ${error.message}`);
  },

  // ── Download ────────────────────────────────────────────────

  /** Download a file and return its contents as a Buffer. */
  async downloadFile(key: string): Promise<Buffer> {
    const { data, error } = await bucket().download(key);
    if (error) throw new Error(`Storage download failed: ${error.message}`);

    // Supabase returns a Blob — convert to Buffer
    const arrayBuffer = await data.arrayBuffer();
    return Buffer.from(arrayBuffer);
  },

  // ── Signed URLs ─────────────────────────────────────────────

  /**
   * Create a short-lived signed download URL with in-memory caching.
   * @param key       Storage object path
   * @param expiresIn Seconds until the URL expires (default from config)
   * @param options   Optional download filename & content-disposition
   */
  async getSignedUrl(
    key: string,
    expiresIn: number = config.app.signedUrlExpiry,
    options?: { download?: string }
  ): Promise<string> {
    const cacheKey = `${key}:${options?.download || ''}`;
    const now = Date.now();
    const cached = signedUrlCache.get(cacheKey);

    if (cached && now < cached.expiresAt) {
      return cached.url;
    }

    const { data, error } = await bucket().createSignedUrl(key, expiresIn, {
      download: options?.download,
    });
    if (error) throw new Error(`Signed URL creation failed: ${error.message}`);

    signedUrlCache.set(cacheKey, {
      url: data.signedUrl,
      expiresAt: now + (expiresIn * 1000) - SIGNED_URL_SAFETY_MARGIN_MS,
    });

    return data.signedUrl;
  },

  /**
   * Create a Supabase signed upload URL.
   * This authorizes the client browser to upload directly to Supabase Storage via PUT.
   */
  async createSignedUploadUrl(
    key: string
  ): Promise<{ signedUrl: string; path: string; token: string }> {
    const { data, error } = await bucket().createSignedUploadUrl(key, {
      upsert: false,
    });
    if (error || !data) {
      throw new Error(`Failed to create signed upload URL: ${error?.message || 'Unknown error'}`);
    }
    return {
      signedUrl: data.signedUrl,
      path: data.path,
      token: data.token,
    };
  },

  /**
   * Memory-efficient object header inspection.
   * Fetches only the first 1024 bytes (Range: bytes=0-1023) directly from Supabase Storage
   * to verify object presence, determine exact total size from Content-Range, and inspect
   * magic bytes without loading large 25MB binaries into RAM.
   */
  async fetchObjectHeader(
    key: string
  ): Promise<{
    exists: boolean;
    buffer: Buffer;
    size: number;
    contentType: string;
  }> {
    try {
      const { data, error } = await bucket().createSignedUrl(key, 60);
      if (error || !data?.signedUrl) {
        return { exists: false, buffer: Buffer.alloc(0), size: 0, contentType: '' };
      }

      const res = await fetch(data.signedUrl, {
        headers: { Range: 'bytes=0-1023' },
      });

      if (!res.ok && res.status !== 206) {
        return { exists: false, buffer: Buffer.alloc(0), size: 0, contentType: '' };
      }

      const arrayBuf = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuf);

      // Parse total byte count from Content-Range header: "bytes 0-1023/2423462"
      const contentRange = res.headers.get('content-range');
      let size = buffer.length;
      if (contentRange) {
        const parts = contentRange.split('/');
        if (parts[1]) {
          const parsed = parseInt(parts[1], 10);
          if (!isNaN(parsed) && parsed > 0) size = parsed;
        }
      }
      const contentType = res.headers.get('content-type') || 'application/octet-stream';

      return { exists: true, buffer, size, contentType };
    } catch {
      return { exists: false, buffer: Buffer.alloc(0), size: 0, contentType: '' };
    }
  },

  /**
   * Clean up temporary archives generated in _temp_archives folder older than specified age.
   */
  async cleanupTempArchives(olderThanMs: number = 2 * 60 * 60 * 1000): Promise<number> {
    try {
      const { data, error } = await bucket().list('_temp_archives', { limit: 100 });
      if (error || !data) return 0;

      const cutoff = new Date(Date.now() - olderThanMs);
      const toDelete: string[] = [];

      for (const item of data) {
        if (item.name && item.created_at && new Date(item.created_at) < cutoff) {
          toDelete.push(`_temp_archives/${item.name}`);
        }
      }

      if (toDelete.length > 0) {
        await bucket().remove(toDelete);
      }
      return toDelete.length;
    } catch (err) {
      console.warn('[STORAGE] Cleanup temp archives failed:', err);
      return 0;
    }
  },

  // ── Metadata / Existence ────────────────────────────────────

  /**
   * Check whether an object exists.
   * Returns basic metadata when found; `{ exists: false }` otherwise.
   */
  async fileExists(
    key: string
  ): Promise<
    | { exists: true; size: number; contentType: string }
    | { exists: false }
  > {
    // Supabase Storage doesn't have a direct HEAD equivalent, so we
    // list with an exact prefix and limit 1.  The file path is always
    // unique so this is safe.
    const folder = key.substring(0, key.lastIndexOf('/'));
    const filename = key.substring(key.lastIndexOf('/') + 1);

    const { data, error } = await bucket().list(folder, {
      limit: 1,
      search: filename,
    });

    if (error) throw new Error(`Storage list failed: ${error.message}`);

    const match = data?.find((f) => f.name === filename);
    if (!match) return { exists: false };

    return {
      exists: true,
      size: match.metadata?.size ?? 0,
      contentType: match.metadata?.mimetype ?? 'application/octet-stream',
    };
  },

  // ── Delete ──────────────────────────────────────────────────

  /** Delete a single object. */
  async deleteFile(key: string): Promise<void> {
    for (const k of signedUrlCache.keys()) {
      if (k.startsWith(`${key}:`)) signedUrlCache.delete(k);
    }
    const { error } = await bucket().remove([key]);
    if (error) throw new Error(`Storage delete failed: ${error.message}`);
  },

  /**
   * Batch-delete multiple objects.
   * Returns lists of successfully deleted keys and any errors.
   */
  async deleteFiles(
    keys: string[]
  ): Promise<{ deleted: string[]; errors: { key: string; error: string }[] }> {
    if (keys.length === 0) return { deleted: [], errors: [] };

    for (const key of keys) {
      for (const k of signedUrlCache.keys()) {
        if (k.startsWith(`${key}:`)) signedUrlCache.delete(k);
      }
    }

    const allDeleted: string[] = [];
    const allErrors: { key: string; error: string }[] = [];

    // Supabase Storage supports batching but we chunk in groups of 100
    // to stay safe with payload limits.
    const batchSize = 100;
    for (let i = 0; i < keys.length; i += batchSize) {
      const batch = keys.slice(i, i + batchSize);
      try {
        const { data, error } = await bucket().remove(batch);
        if (error) {
          allErrors.push(
            ...batch.map((k) => ({ key: k, error: error.message }))
          );
        } else {
          // data contains the successfully removed file metadata
          allDeleted.push(...batch);
        }
      } catch (err: any) {
        allErrors.push(
          ...batch.map((k) => ({ key: k, error: err.message || 'Batch delete failed' }))
        );
      }
    }

    return { deleted: allDeleted, errors: allErrors };
  },

  // ── List ────────────────────────────────────────────────────

  /** List objects under a given prefix path. */
  async listFiles(
    prefix: string,
    limit: number = 1000
  ): Promise<{ name: string; size: number }[]> {
    const { data, error } = await bucket().list(prefix, { limit });
    if (error) throw new Error(`Storage list failed: ${error.message}`);
    return (data || []).map((f) => ({
      name: `${prefix}/${f.name}`,
      size: f.metadata?.size ?? 0,
    }));
  },
};
