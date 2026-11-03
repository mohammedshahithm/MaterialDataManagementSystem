import axios from 'axios';
import { supabase } from './supabase';
import type {
  Batch, BatchDetail, DateFolder, DateFolderDetail,
  Product, ProductDetail, ProductFile, DashboardSummary,
  StorageSummary, BackupBatch, AuditLog,
  RetentionSettings, User, DownloadHistoryItem,
} from '../types';

// In production, default to '/api' so requests route relatively via Vercel rewrites (or reverse proxies).
// In development, uses VITE_API_URL if provided, or '/api' which Vite dev proxy targets to localhost:3001.
const rawApiUrl = import.meta.env.VITE_API_URL;
const API_BASE =
  import.meta.env.PROD && (!rawApiUrl || rawApiUrl.includes('localhost'))
    ? '/api'
    : (rawApiUrl || '/api');

const api = axios.create({ baseURL: API_BASE });

// ── In-Memory Request Deduplication & Stale-While-Revalidate Caching ────
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const memoryCache = new Map<string, CacheEntry<any>>();
const inFlightRequests = new Map<string, Promise<any>>();
const DEFAULT_READ_TTL_MS = 20 * 1000; // 20 seconds default TTL for read data

export function invalidateApiCache(pattern?: string): void {
  if (!pattern) {
    memoryCache.clear();
    return;
  }
  for (const key of memoryCache.keys()) {
    if (key.includes(pattern)) {
      memoryCache.delete(key);
    }
  }
}

async function cachedGet<T>(
  url: string,
  params?: Record<string, any>,
  ttlMs: number = DEFAULT_READ_TTL_MS
): Promise<T> {
  const cacheKey = params && Object.keys(params).length > 0 ? `${url}?${JSON.stringify(params)}` : url;
  const now = Date.now();

  const cached = memoryCache.get(cacheKey);
  if (cached && now - cached.timestamp < ttlMs) {
    return cached.data as T;
  }

  // Deduplicate in-flight requests for the same URL + params
  if (inFlightRequests.has(cacheKey)) {
    return inFlightRequests.get(cacheKey)!;
  }

  const promise = api
    .get<T>(url, { params })
    .then((r) => {
      memoryCache.set(cacheKey, { data: r.data, timestamp: Date.now() });
      inFlightRequests.delete(cacheKey);
      return r.data;
    })
    .catch((err) => {
      inFlightRequests.delete(cacheKey);
      throw err;
    });

  inFlightRequests.set(cacheKey, promise);
  return promise;
}

// ── Dashboard ────────────────────────────────────────────────

export const getDashboard = () =>
  cachedGet<DashboardSummary>('/dashboard', undefined, 15000);

// ── Batches ──────────────────────────────────────────────────

export const getBatches = (status?: string) =>
  cachedGet<Batch[]>('/batches', status ? { status } : undefined, 15000);

export const getBatch = (id: string) =>
  cachedGet<BatchDetail>(`/batches/${id}`, undefined, 15000);

export const createBatch = async (data: { batchName: string; description?: string }) => {
  const res = await api.post<Batch>('/batches', data);
  invalidateApiCache('/batches');
  invalidateApiCache('/dashboard');
  invalidateApiCache('/storage');
  return res.data;
};

export const updateBatch = async (id: string, data: { batchName?: string; description?: string }) => {
  const res = await api.patch(`/batches/${id}`, data);
  invalidateApiCache('/batches');
  return res.data;
};

export interface BatchDeletionSummary {
  batchId: string;
  batchName: string;
  lastActivityAt?: string;
  retentionDueAt?: string;
  isEligibleForDeletion?: boolean;
  inactivityDays?: number;
  retentionDays?: number;
  totalDateFolders: number;
  totalProducts: number;
  totalFiles: number;
  storageUsed: string;
  downloadHistory: Array<{
    id: string;
    downloadType: string;
    filename?: string;
    downloadedAt: string;
    downloadedBy: string;
    productName?: string;
    productCode?: string;
  }>;
  hasDownloads: boolean;
  batchZipDownloaded: boolean;
  productZipsDownloadedCount: number;
  reportsDownloadedCount: number;
}

export const getBatchDeletionSummary = (id: string) =>
  api.get<BatchDeletionSummary>(`/batches/${id}/deletion-summary`).then((r) => r.data);

export const deleteBatch = async (id: string) => {
  const res = await api.delete(`/batches/${id}`);
  invalidateApiCache('/batches');
  invalidateApiCache('/dashboard');
  invalidateApiCache('/storage');
  return res.data;
};

// ── Date Folders ─────────────────────────────────────────────

export const getDateFolders = (batchId: string) =>
  cachedGet<DateFolder[]>(`/batches/${batchId}/dates`, undefined, 15000);

export const createDateFolder = async (batchId: string, workDate: string) => {
  const res = await api.post(`/batches/${batchId}/dates`, { workDate });
  invalidateApiCache(`/batches/${batchId}`);
  invalidateApiCache('/batches');
  return res.data;
};

export const getDateFolder = (dateId: string) =>
  cachedGet<DateFolderDetail>(`/dates/${dateId}`, undefined, 15000);

export const deleteDateFolder = async (dateId: string) => {
  const res = await api.delete(`/dates/${dateId}`);
  invalidateApiCache('/dates');
  invalidateApiCache('/batches');
  return res.data;
};

// ── Products ─────────────────────────────────────────────────

export const getProducts = (dateId: string) =>
  cachedGet<Product[]>(`/dates/${dateId}/products`, undefined, 15000);

export const getProduct = (productId: string) =>
  cachedGet<ProductDetail>(`/products/${productId}`, undefined, 10000);

export const createProduct = async (dateId: string, data: {
  productName: string; productCode: string; metadata?: Record<string, any>;
}) => {
  const res = await api.post(`/dates/${dateId}/products`, data);
  invalidateApiCache(`/dates/${dateId}`);
  invalidateApiCache('/dashboard');
  invalidateApiCache('/batches');
  return res.data;
};

export const updateProduct = async (productId: string, data: {
  productName?: string; metadata?: Record<string, any>;
}) => {
  const res = await api.patch(`/products/${productId}`, data);
  invalidateApiCache(`/products/${productId}`);
  invalidateApiCache('/dashboard');
  return res.data;
};

export const deleteProduct = async (productId: string) => {
  const res = await api.delete(`/products/${productId}`);
  invalidateApiCache(`/products/${productId}`);
  invalidateApiCache('/dates');
  invalidateApiCache('/dashboard');
  return res.data;
};

// ── Files ────────────────────────────────────────────────────

export const getProductFiles = (productId: string) =>
  cachedGet<ProductFile[]>(`/products/${productId}/files`, undefined, 10000);

export const getFileDownloadUrl = (fileId: string, inline: boolean = false) =>
  cachedGet<{ downloadUrl: string; filename: string }>(
    `/files/${fileId}/download-url`,
    inline ? { inline: 'true' } : undefined,
    300 * 1000 // 5 minutes client cache for signed URLs
  );

export const deleteFile = async (fileId: string) => {
  const res = await api.delete(`/files/${fileId}`);
  invalidateApiCache('/products');
  invalidateApiCache('/files');
  invalidateApiCache('/storage');
  invalidateApiCache('/dashboard');
  return res.data;
};

// ── Direct Signed Upload Workflow (Bypasses Vercel 4.5MB Payload Limit) ──

export interface RequestUploadResponse {
  fileId: string;
  storageKey: string;
  signedUrl: string;
  path: string;
  token: string;
  bucket: string;
}

export const requestUploadUrl = async (
  productId: string,
  data: {
    category: string;
    slotIndex: number;
    filename: string;
    fileSize: number;
    mimeType: string;
  }
): Promise<RequestUploadResponse> => {
  const res = await api.post(`/products/${productId}/files/request-upload`, data);
  return res.data;
};

export const confirmUpload = async (
  productId: string,
  fileId: string
): Promise<{ success: boolean; message: string; fileId: string }> => {
  const res = await api.post(`/products/${productId}/files/${fileId}/confirm`);
  return res.data;
};

export const abortUpload = async (productId: string, fileId: string): Promise<void> => {
  try {
    await api.post(`/products/${productId}/files/${fileId}/abort`);
  } catch {}
};

/**
 * Upload file directly to Supabase Storage using server-signed authorization.
 * The 25MB binary travels directly from the browser to Supabase Storage,
 * completely bypassing Vercel Functions and their 4.5MB payload limit.
 */
export async function uploadFile(
  productId: string,
  file: File,
  category: string,
  slotIndex: number = 0,
  onProgress?: (percent: number) => void
): Promise<void> {
  // 1. Request signed upload permission from backend
  const auth = await requestUploadUrl(productId, {
    category,
    slotIndex,
    filename: file.name,
    fileSize: file.size,
    mimeType: file.type || 'application/octet-stream',
  });

  try {
    // 2. Direct upload to Supabase Storage with real-time progress tracking
    let uploadedSuccessfully = false;

    // Use axios PUT directly to Supabase signed URL
    try {
      await axios.put(auth.signedUrl, file, {
        headers: {
          'Content-Type': file.type || 'application/octet-stream',
        },
        onUploadProgress: (e) => {
          if (onProgress && e.total) {
            onProgress(Math.round((e.loaded / e.total) * 100));
          }
        },
      });
      uploadedSuccessfully = true;
    } catch (putErr) {
      // Fallback: try Supabase JS client uploadToSignedUrl if available
      if (supabase?.storage) {
        const { error } = await supabase.storage
          .from(auth.bucket)
          .uploadToSignedUrl(auth.path, auth.token, file, {
            contentType: file.type || 'application/octet-stream',
            upsert: false,
          });
        if (error) throw error;
        uploadedSuccessfully = true;
      } else {
        throw putErr;
      }
    }

    if (!uploadedSuccessfully) {
      throw new Error('Direct upload to storage failed');
    }

    // 3. Confirm upload with backend (triggers range-based magic-byte verification)
    await confirmUpload(productId, auth.fileId);

    // Invalidate stale caches
    invalidateApiCache(`/products/${productId}`);
    invalidateApiCache('/storage');
    invalidateApiCache('/dashboard');
  } catch (err: any) {
    // Best-effort cleanup of pending record
    await abortUpload(productId, auth.fileId);
    throw err;
  }
}

// ── PDF ──────────────────────────────────────────────────────

export const generateReport = async (productId: string) => {
  const res = await api.post(`/products/${productId}/generate-report`);
  invalidateApiCache(`/products/${productId}`);
  invalidateApiCache('/storage');
  invalidateApiCache('/dashboard');
  return res.data;
};

export const getReport = (productId: string) =>
  cachedGet(`/products/${productId}/report`, undefined, 30000);

export const downloadReport = (productId: string) =>
  `${API_BASE}/products/${productId}/report/download`;

export const downloadReportUrl = (productId: string) =>
  `${API_BASE}/products/${productId}/report/download`;

// ── Archives ─────────────────────────────────────────────────

export const downloadProductZip = (productId: string) =>
  `${API_BASE}/products/${productId}/archive`;

export const downloadBatchZip = (batchId: string) =>
  `${API_BASE}/batches/${batchId}/archive`;

// ── Download Tracking & Safe Deletion ─────────────────────────

export const getBackupBatches = () =>
  cachedGet<BackupBatch[]>('/downloads/batches', undefined, 15000);

export const getDownloadHistory = () =>
  cachedGet<DownloadHistoryItem[]>('/downloads/history', undefined, 15000);

export const confirmBackup = async (batchId: string, data: {
  diskIdentifier: string; destinationPath?: string;
  archiveFilename?: string; archiveChecksum?: string; notes?: string;
}) => {
  const res = await api.post(`/batches/${batchId}/backup-confirmation`, data);
  invalidateApiCache('/downloads');
  return res.data;
};

export const getBackupStatus = (batchId: string) =>
  cachedGet(`/batches/${batchId}/backup-status`, undefined, 15000);

export const approveDeletion = async (batchId: string) => {
  const res = await api.post(`/batches/${batchId}/approve-deletion`);
  invalidateApiCache('/batches');
  invalidateApiCache('/downloads');
  return res.data;
};

export const retryDeletion = async (batchId: string) => {
  const res = await api.post(`/batches/${batchId}/retry-deletion`);
  invalidateApiCache('/batches');
  invalidateApiCache('/downloads');
  return res.data;
};

// ── Storage ──────────────────────────────────────────────────

export const getStorageSummary = () =>
  cachedGet<StorageSummary>('/storage/summary', undefined, 15000);

// ── Admin ────────────────────────────────────────────────────

export const getAuditLogs = (page: number = 1, limit: number = 50) =>
  cachedGet<{ logs: AuditLog[]; pagination: any }>('/audit-logs', { page, limit }, 15000);

export const getRetentionSettings = () =>
  cachedGet<RetentionSettings>('/admin/retention-settings', undefined, 60000);

export const updateRetentionSettings = async (data: Partial<RetentionSettings>) => {
  const res = await api.patch('/admin/retention-settings', data);
  invalidateApiCache('/admin/retention-settings');
  invalidateApiCache('/batches');
  invalidateApiCache('/dashboard');
  return res.data;
};

export const getUsers = () =>
  cachedGet<User[]>('/admin/users', undefined, 30000);

export const updateUserRole = async (userId: string, role: string) => {
  const res = await api.patch(`/admin/users/${userId}/role`, { role });
  invalidateApiCache('/admin/users');
  return res.data;
};

export default api;
