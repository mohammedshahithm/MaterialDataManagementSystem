// ── API Response Types ─────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: 'admin' | 'worker';
  createdAt: string;
}

export interface Batch {
  id: string;
  batchName: string;
  description?: string;
  createdBy: string;
  createdAt: string;
  closedAt?: string;
  status: BatchStatus;
  backupDueAt?: string;
  lastActivityAt?: string;
  retentionDueAt?: string;
  isEligibleForDeletion?: boolean;
  inactivityDays?: number;
  retentionDays?: number;
  totalDateFolders: number;
  totalProducts: number;
  completedProducts: number;
  storageUsed: string;
  backupStatus: string | null;
}

export type BatchStatus =
  | 'active'
  | 'closed'
  | 'backup_due'
  | 'backup_overdue'
  | 'backup_confirmed'
  | 'deletion_approved'
  | 'partially_deleted'
  | 'deleted';

export interface BatchDetail {
  id: string;
  batchName: string;
  description?: string;
  createdBy: { fullName: string; email: string };
  createdAt: string;
  closedAt?: string;
  status: BatchStatus;
  backupDueAt?: string;
  lastActivityAt?: string;
  retentionDueAt?: string;
  isEligibleForDeletion?: boolean;
  inactivityDays?: number;
  retentionDays?: number;
  dateFolders: DateFolder[];
  backupRecords: BackupRecord[];
}

export interface DateFolder {
  id: string;
  batchId: string;
  workDate: string;
  createdBy: string;
  createdAt: string;
  totalProducts: number;
  completedProducts: number;
  storageUsed: string;
}

export interface DateFolderDetail {
  id: string;
  batchId: string;
  workDate: string;
  batch: { id: string; batchName: string; status: string };
  createdBy: { fullName: string };
  createdAt: string;
  products: Product[];
}

export interface Product {
  id: string;
  dateFolderId: string;
  productCode: string;
  productName: string;
  metadata?: Record<string, any>;
  createdBy: { fullName: string };
  createdAt: string;
  status: string;
  categories: {
    microstructure: number;
    graph: number;
    source_pdf: number;
    whatsapp_image: number;
    generated_report: number;
  };
  requiredComplete: boolean;
  completionPercent: number;
  totalStorage: string;
  files?: ProductFile[];
}

export interface ProductDetail {
  id: string;
  dateFolderId: string;
  productCode: string;
  productName: string;
  metadata?: Record<string, any>;
  createdBy: { fullName: string; email: string };
  createdAt: string;
  updatedAt: string;
  status: string;
  dateFolder: {
    id: string;
    workDate: string;
    batch: { id: string; batchName: string; status: string };
  };
  files: ProductFile[];
  checklist: ProductChecklist;
  reportOutdated: boolean;
  completionPercent: number;
}

export interface ProductFile {
  id: string;
  productId: string;
  category: FileCategory;
  slotIndex: number;
  originalFilename: string;
  storageKey: string;
  mimeType: string;
  fileSize: string;
  checksumSha256?: string;
  uploadedBy: { fullName: string };
  uploadedAt: string;
  isLatest: boolean;
}

export type FileCategory =
  | 'microstructure'
  | 'graph'
  | 'source_pdf'
  | 'whatsapp_image'
  | 'generated_report';

export interface ProductChecklist {
  microstructure1: boolean;
  microstructure2: boolean;
  microstructure3: boolean;
  graph: boolean;
  sourcePdf: boolean;
  whatsappImage: boolean;
  reportGenerated: boolean;
  reportDownloaded: boolean;
  zipDownloaded: boolean;
}

export interface BackupRecord {
  id: string;
  batchId: string;
  confirmedBy: string;
  confirmedAt: string;
  diskIdentifier?: string;
  destinationPath?: string;
  archiveFilename?: string;
  archiveChecksum?: string;
  notes?: string;
  status: string;
}

export interface DashboardSummary {
  totalBatches: number;
  activeBatches: number;
  totalProducts: number;
  completedProducts: number;
  pendingUploads: number;
  totalFiles: number;
  storageUsedBytes: string;
  storageUsedGb: string;
  storageWarningGb: number;
  awaitingBackup: number;
  readyForDeletion: number;
}

export interface StorageSummary {
  totalFiles: number;
  totalStorageBytes: string;
  totalStorageGb: string;
  warningThresholdGb: number;
  isWarning: boolean;
  failedUploads: number;
  pendingDeletions: number;
  batchStorage: {
    batchId: string;
    batchName: string;
    status: string;
    backupDueAt?: string;
    fileCount: number;
    storageUsed: string;
  }[];
}

export interface AuditLog {
  id: string;
  userId: string;
  action: string;
  entityType: string;
  entityId?: string;
  details?: Record<string, any>;
  createdAt: string;
  user: { fullName: string; email: string };
}

export interface BackupBatch {
  id: string;
  batchName: string;
  status: BatchStatus;
  createdAt?: string;
  closedAt?: string;
  backupDueAt?: string;
  createdBy: string;
  totalFiles: number;
  totalStorage: string;
  totalProducts: number;
  reportsGeneratedCount: number;
  reportsDownloadedCount: number;
  productZipsDownloadedCount: number;
  batchZipDownloaded: boolean;
  downloadStatus: 'not_downloaded' | 'partially_downloaded' | 'downloaded';
  latestBackup?: {
    confirmedAt: string;
    confirmedBy: string;
    diskIdentifier?: string;
    destinationPath?: string;
    status: string;
  } | null;
}

export interface DownloadHistoryItem {
  id: string;
  downloadType: string;
  filename: string | null;
  downloadedAt: string;
  actor: string;
  batchName: string;
  productCode: string | null;
}



export interface RetentionSettings {
  retentionDays: number;
  storageWarningGb: number;
  maxFileSizeMb: number;
  requiredCategories: string[];
}
