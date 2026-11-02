import { useEffect, useState } from 'react';
import {
  getBackupBatches, getDownloadHistory, approveDeletion, retryDeletion, downloadBatchZip
} from '../services/api';
import type { BackupBatch, DownloadHistoryItem } from '../types';
import { formatBytes, formatDateTime, formatStatus, getStatusColor } from '../utils/helpers';
import {
  Download, HardDrive, AlertTriangle, CheckCircle2,
  Trash2, RefreshCw, Loader2, X, AlertOctagon, CheckSquare, Square,
  FileArchive, FileText, Clock
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function BackupPage() {
  const [batches, setBatches] = useState<BackupBatch[]>([]);
  const [downloadHistory, setDownloadHistory] = useState<DownloadHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloadingBatchId, setDownloadingBatchId] = useState<string | null>(null);

  // Safe Cloud Deletion modal state
  const [deletionBatch, setDeletionBatch] = useState<BackupBatch | null>(null);
  const [verifiedConsent, setVerifiedConsent] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fetchData = async () => {
    try {
      const [batchesData, historyData] = await Promise.all([
        getBackupBatches(),
        getDownloadHistory(),
      ]);
      setBatches(batchesData);
      setDownloadHistory(historyData);
    } catch {
      toast.error('Failed to load download and storage data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleDownloadBatch = async (batchId: string, batchName: string) => {
    setDownloadingBatchId(batchId);
    try {
      const url = downloadBatchZip(batchId);
      const response = await fetch(url);
      if (!response.ok) throw new Error('Download failed');
      const blob = await response.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${batchName.replace(/\s+/g, '-')}.zip`;
      link.click();
      URL.revokeObjectURL(link.href);
      toast.success('Batch ZIP download complete');
      await fetchData();
    } catch {
      toast.error('Failed to download batch ZIP');
    } finally {
      setDownloadingBatchId(null);
    }
  };

  const openDeletionModal = (batch: BackupBatch) => {
    setDeletionBatch(batch);
    setVerifiedConsent(false);
  };

  const handleExecuteDeletion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deletionBatch || !verifiedConsent) return;

    setDeleting(true);
    try {
      const result = await approveDeletion(deletionBatch.id);
      if (result.errors > 0) {
        toast.error(`Partially deleted: ${result.deleted} deleted, ${result.errors} failed`);
      } else {
        toast.success(`Successfully deleted ${result.deleted} cloud files. Database records preserved.`);
      }
      setDeletionBatch(null);
      setVerifiedConsent(false);
      await fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Deletion failed');
    } finally {
      setDeleting(false);
    }
  };

  const handleRetryDeletion = async (batchId: string) => {
    try {
      const result = await retryDeletion(batchId);
      toast.success(result.message);
      await fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Retry failed');
    }
  };

  const getDownloadBadge = (status: 'not_downloaded' | 'partially_downloaded' | 'downloaded') => {
    switch (status) {
      case 'downloaded':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800">
            <CheckCircle2 className="w-3 h-3" /> Downloaded
          </span>
        );
      case 'partially_downloaded':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800">
            <Clock className="w-3 h-3" /> Partially Downloaded
          </span>
        );
      case 'not_downloaded':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700">
            <AlertTriangle className="w-3 h-3 text-slate-500" /> Not Downloaded
          </span>
        );
    }
  };

  const getDownloadTypeBadge = (type: string) => {
    switch (type) {
      case 'batch_zip':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-100 text-purple-700">
            <FileArchive className="w-3 h-3" /> Batch ZIP
          </span>
        );
      case 'product_zip':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-100 text-indigo-700">
            <FileArchive className="w-3 h-3" /> Product ZIP
          </span>
        );
      case 'report_pdf':
      case 'pdf':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-700">
            <FileText className="w-3 h-3" /> Report PDF
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700">
            <Download className="w-3 h-3" /> {type}
          </span>
        );
    }
  };

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Download History & Storage</h1>
        <p className="text-sm text-slate-500 mt-1">
          Track product report & ZIP downloads, monitor cloud storage usage, and safely manage batch cleanup.
        </p>
      </div>

      {/* Safe Cloud Deletion Modal */}
      {deletionBatch && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 text-slate-900 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-100 text-red-600 flex items-center justify-center">
                  <AlertOctagon className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">Safe Cloud Deletion Confirmation</h2>
                  <p className="text-xs text-slate-500">Shared Terminal Cloud Storage Management</p>
                </div>
              </div>
              <button
                onClick={() => setDeletionBatch(null)}
                className="text-slate-400 hover:text-slate-600 rounded-lg p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Batch Info Summary */}
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200/80 mb-4 space-y-2.5 text-xs">
              <div className="flex justify-between items-center pb-2 border-b border-slate-200/60">
                <span className="text-slate-500 font-medium">Batch Name</span>
                <span className="font-bold text-slate-900 text-sm">{deletionBatch.batchName}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Total Products</span>
                <span className="font-semibold text-slate-900">{deletionBatch.totalProducts} products</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Cloud Files to Delete</span>
                <span className="font-semibold text-slate-900">{deletionBatch.totalFiles} files</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Storage Reclaimed</span>
                <span className="font-semibold text-emerald-600">{formatBytes(deletionBatch.totalStorage)}</span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-slate-200/60">
                <span className="text-slate-500">Download Status</span>
                <div>{getDownloadBadge(deletionBatch.downloadStatus)}</div>
              </div>
            </div>

            {/* Prominent warning if Batch ZIP not downloaded */}
            {!deletionBatch.batchZipDownloaded && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-xs text-amber-800 flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold mb-0.5">⚠️ Batch ZIP Not Downloaded</p>
                  The complete batch ZIP archive has not been downloaded for this batch yet. Downloading the complete archive before proceeding with deletion is strongly recommended.
                </div>
              </div>
            )}

            {/* Warning Message */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-4 text-xs text-slate-700 leading-relaxed">
              <p className="font-semibold text-slate-900 mb-0.5">Permanent Cloud File Removal</p>
              Binary microstructure inspection images, graph images, original PDFs, and generated reports will be permanently deleted from Supabase Storage. Database batch records, test results, and product checklists remain safely preserved.
            </div>

            {/* Explicit Consent Checkbox */}
            <form onSubmit={handleExecuteDeletion} className="space-y-4">
              <div
                onClick={() => setVerifiedConsent(!verifiedConsent)}
                className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer select-none transition-colors"
              >
                <div className="mt-0.5 text-blue-600">
                  {verifiedConsent ? (
                    <CheckSquare className="w-4 h-4 text-blue-600" />
                  ) : (
                    <Square className="w-4 h-4 text-slate-400" />
                  )}
                </div>
                <label className="text-xs text-slate-700 font-medium cursor-pointer">
                  I confirm that I want to delete the cloud files for this batch from Supabase Storage.
                </label>
              </div>

              <div className="flex gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setDeletionBatch(null)}
                  className="flex-1 py-2.5 border border-slate-200 rounded-xl text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={deleting || !verifiedConsent}
                  className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-xs font-semibold hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors shadow-sm shadow-red-600/25"
                >
                  {deleting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5" />
                  )}
                  Delete Cloud Files
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Main Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
        </div>
      ) : (
        <>
          {/* Batches Download Status & Cloud Storage Cleanup */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Batches & Storage Management</h2>
                <p className="text-xs text-slate-500">
                  Monitor download completion and reclaim cloud storage.
                </p>
              </div>
              <span className="text-xs text-slate-500 bg-slate-100 px-3 py-1 rounded-full font-medium">
                {batches.length} {batches.length === 1 ? 'Batch' : 'Batches'}
              </span>
            </div>

            {batches.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-xl border border-slate-200/60 shadow-sm">
                <HardDrive className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-600 font-medium">No batches found</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  When batches are created, they appear here for download verification and storage cleanup.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {batches.map((batch) => {
                  const isDeleted = batch.status === 'deleted';
                  return (
                    <div
                      key={batch.id}
                      className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5 hover:border-slate-300 transition-colors"
                    >
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                        <div>
                          <div className="flex items-center gap-3">
                            <h3 className="font-bold text-slate-900 text-base">{batch.batchName}</h3>
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase ${getStatusColor(batch.status)}`}>
                              {formatStatus(batch.status)}
                            </span>
                            {getDownloadBadge(batch.downloadStatus)}
                          </div>
                          <p className="text-xs text-slate-500 mt-1 flex items-center gap-3 flex-wrap">
                            <span>{batch.totalFiles} cloud files · {formatBytes(batch.totalStorage)}</span>
                            {batch.createdAt && <span>Created: {formatDateTime(batch.createdAt)}</span>}
                          </p>
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleDownloadBatch(batch.id, batch.batchName)}
                            disabled={downloadingBatchId === batch.id || isDeleted}
                            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50 transition-colors"
                            title="Download complete batch ZIP archive"
                          >
                            {downloadingBatchId === batch.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Download className="w-3.5 h-3.5" />
                            )}
                            Download Batch ZIP
                          </button>

                          {!isDeleted && batch.status !== 'partially_deleted' && (
                            <button
                              onClick={() => openDeletionModal(batch)}
                              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-red-50 text-red-700 hover:bg-red-100 border border-red-200/60 transition-colors"
                              title="Delete binary files from Supabase Storage"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Delete Cloud Files
                            </button>
                          )}

                          {batch.status === 'partially_deleted' && (
                            <button
                              onClick={() => handleRetryDeletion(batch.id)}
                              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-orange-50 text-orange-700 hover:bg-orange-100 transition-colors"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                              Retry Deletion
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Download Tracking Breakdown */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 pt-3.5 text-xs">
                        <div className="bg-slate-50 rounded-lg p-2.5">
                          <span className="text-slate-500 block text-[11px]">Total Products</span>
                          <span className="font-bold text-slate-800 text-sm mt-0.5 block">{batch.totalProducts}</span>
                        </div>
                        <div className="bg-slate-50 rounded-lg p-2.5">
                          <span className="text-slate-500 block text-[11px]">Reports Generated</span>
                          <span className="font-bold text-slate-800 text-sm mt-0.5 block">
                            {batch.reportsGeneratedCount} / {batch.totalProducts}
                          </span>
                        </div>
                        <div className="bg-slate-50 rounded-lg p-2.5">
                          <span className="text-slate-500 block text-[11px]">PDFs Downloaded</span>
                          <span className="font-bold text-slate-800 text-sm mt-0.5 block">
                            {batch.reportsDownloadedCount} / {batch.totalProducts}
                          </span>
                        </div>
                        <div className="bg-slate-50 rounded-lg p-2.5">
                          <span className="text-slate-500 block text-[11px]">Product ZIPs Downloaded</span>
                          <span className="font-bold text-slate-800 text-sm mt-0.5 block">
                            {batch.productZipsDownloadedCount} / {batch.totalProducts}
                          </span>
                        </div>
                        <div className="bg-slate-50 rounded-lg p-2.5">
                          <span className="text-slate-500 block text-[11px]">Complete Batch ZIP</span>
                          <span className={`font-bold text-xs mt-1 inline-flex items-center gap-1 ${
                            batch.batchZipDownloaded ? 'text-emerald-700' : 'text-slate-500'
                          }`}>
                            {batch.batchZipDownloaded ? (
                              <>
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                Downloaded
                              </>
                            ) : (
                              'Not Downloaded'
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Download History Section */}
          <div className="space-y-4 pt-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Download History</h2>
                <p className="text-xs text-slate-500">
                  Audit log of successful application download responses (PDFs, Product ZIPs, Batch ZIPs).
                </p>
              </div>
              <span className="text-xs text-slate-500 bg-slate-100 px-3 py-1 rounded-full font-medium">
                {downloadHistory.length} Recorded Downloads
              </span>
            </div>

            {downloadHistory.length === 0 ? (
              <div className="text-center py-10 bg-white rounded-xl border border-slate-200/60 shadow-sm">
                <FileArchive className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                <p className="text-slate-500 text-sm font-medium">No downloads recorded yet</p>
                <p className="text-xs text-slate-400">
                  When workers download reports or archives, successful responses will be logged here automatically.
                </p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-600">
                    <thead className="bg-slate-50 text-[11px] font-semibold text-slate-700 uppercase border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-3">Timestamp</th>
                        <th className="px-4 py-3">Type</th>
                        <th className="px-4 py-3">Filename</th>
                        <th className="px-4 py-3">Associated Batch / Product</th>
                        <th className="px-4 py-3">Terminal Actor</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {downloadHistory.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-4 py-3 font-mono text-[11px] text-slate-700 whitespace-nowrap">
                            {formatDateTime(item.downloadedAt)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {getDownloadTypeBadge(item.downloadType)}
                          </td>
                          <td className="px-4 py-3 font-mono text-[11px] text-slate-800 font-medium">
                            {item.filename || '—'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className="font-semibold text-slate-800">{item.batchName}</span>
                            {item.productCode && (
                              <span className="text-slate-500 text-[11px] block">{item.productCode}</span>
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-medium text-[11px]">
                              {item.actor}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
