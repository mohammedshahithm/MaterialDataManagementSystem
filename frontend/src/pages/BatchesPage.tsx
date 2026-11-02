import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  getBatches, createBatch, updateBatch, deleteBatch,
  getBatchDeletionSummary, type BatchDeletionSummary
} from '../services/api';
import type { Batch } from '../types';
import { formatBytes, formatDateTime, getStatusColor, formatStatus } from '../utils/helpers';
import {
  Plus, Package, FolderOpen, Trash2, Edit2, Loader2, X,
  Calendar, HardDrive, AlertTriangle, AlertOctagon, CheckSquare,
  Square, FileArchive, FileText, CheckCircle2
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function BatchesPage() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);

  // Create modal state
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);

  // Edit modal state
  const [editingBatch, setEditingBatch] = useState<Batch | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [updating, setUpdating] = useState(false);

  // Delete modal state
  const [deletingBatch, setDeletingBatch] = useState<Batch | null>(null);
  const [deletionSummary, setDeletionSummary] = useState<BatchDeletionSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [confirmConsent, setConfirmConsent] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fetchBatches = () => {
    if (batches.length === 0) setLoading(true);
    getBatches()
      .then(setBatches)
      .catch(() => toast.error('Failed to load batches'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchBatches();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await createBatch({ batchName: newName.trim(), description: newDesc.trim() || undefined });
      toast.success('Batch created');
      setShowCreate(false);
      setNewName('');
      setNewDesc('');
      fetchBatches();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to create batch');
    } finally {
      setCreating(false);
    }
  };

  const openEdit = (batch: Batch) => {
    setEditingBatch(batch);
    setEditName(batch.batchName);
    setEditDesc(batch.description || '');
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBatch || !editName.trim()) return;
    setUpdating(true);
    try {
      await updateBatch(editingBatch.id, {
        batchName: editName.trim(),
        description: editDesc.trim() || undefined,
      });
      toast.success('Batch updated');
      setEditingBatch(null);
      fetchBatches();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to update batch');
    } finally {
      setUpdating(false);
    }
  };

  const openDelete = (batch: Batch) => {
    setDeletingBatch(batch);
    setDeletionSummary(null);
    setConfirmConsent(false);
    setLoadingSummary(true);

    getBatchDeletionSummary(batch.id)
      .then(setDeletionSummary)
      .catch(() => toast.error('Failed to fetch batch deletion details'))
      .finally(() => setLoadingSummary(false));
  };

  const handleExecuteDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deletingBatch || !confirmConsent) return;
    setDeleting(true);
    try {
      await deleteBatch(deletingBatch.id);
      toast.success('Batch deleted successfully');
      setDeletingBatch(null);
      fetchBatches();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to delete batch');
    } finally {
      setDeleting(false);
    }
  };

  const getDownloadTypeBadge = (type: string) => {
    switch (type) {
      case 'batch_zip':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-100 text-purple-700">
            <FileArchive className="w-2.5 h-2.5" /> Batch ZIP
          </span>
        );
      case 'product_zip':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-100 text-indigo-700">
            <FileArchive className="w-2.5 h-2.5" /> Product ZIP
          </span>
        );
      case 'report_pdf':
      case 'pdf':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-700">
            <FileText className="w-2.5 h-2.5" /> Report PDF
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700">
            {type}
          </span>
        );
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Batch Management</h1>
          <p className="text-sm text-slate-500 mt-1">Create, edit and manage product batches</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl text-sm font-medium shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all"
        >
          <Plus className="w-4 h-4" />
          Create Batch
        </button>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-slate-900">Create New Batch</h2>
              <button onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Batch Name *</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., Batch 1 - Week 44"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Description</label>
                <textarea
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  rows={3}
                  placeholder="Optional description..."
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
                >
                  {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingBatch && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-slate-900">Edit Batch</h2>
              <button onClick={() => setEditingBatch(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleUpdate} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Batch Name *</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Description</label>
                <textarea
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  rows={3}
                  placeholder="Optional description..."
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingBatch(null)}
                  className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updating}
                  className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
                >
                  {updating && <Loader2 className="w-4 h-4 animate-spin" />}
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingBatch && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 text-slate-900 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-100 text-red-600 flex items-center justify-center">
                  <AlertOctagon className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">Delete Batch Confirmation</h2>
                  <p className="text-xs text-slate-500">Shared Factory Terminal Batch Deletion</p>
                </div>
              </div>
              <button
                onClick={() => setDeletingBatch(null)}
                className="text-slate-400 hover:text-slate-600 rounded-lg p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {loadingSummary ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3 text-slate-500 text-xs">
                <Loader2 className="w-7 h-7 text-blue-600 animate-spin" />
                <span>Loading batch file count and download history...</span>
              </div>
            ) : deletionSummary ? (
              <form onSubmit={handleExecuteDelete} className="space-y-4">
                {/* Batch Metrics Summary */}
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-200/80 space-y-2 text-xs">
                  <div className="flex justify-between items-center pb-2 border-b border-slate-200/60">
                    <span className="text-slate-500 font-medium">Batch Name</span>
                    <span className="font-bold text-slate-900 text-sm">{deletionSummary.batchName}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Date Folders:</span>
                      <span className="font-semibold text-slate-900">{deletionSummary.totalDateFolders}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Products:</span>
                      <span className="font-semibold text-slate-900">{deletionSummary.totalProducts}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Cloud Files:</span>
                      <span className="font-semibold text-slate-900">{deletionSummary.totalFiles}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Storage Used:</span>
                      <span className="font-semibold text-emerald-600">{formatBytes(deletionSummary.storageUsed)}</span>
                    </div>
                  </div>
                </div>

                {/* Download History Section */}
                <div>
                  <p className="text-xs font-semibold text-slate-800 mb-1.5 flex items-center justify-between">
                    <span>PDF / ZIP Download History</span>
                    <span className="text-[11px] font-normal text-slate-500">
                      {deletionSummary.downloadHistory.length} recorded
                    </span>
                  </p>

                  {!deletionSummary.hasDownloads ? (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800 flex items-start gap-2.5">
                      <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold mb-0.5">⚠️ No Downloads Recorded</p>
                        No complete batch ZIP, product ZIPs, or report PDFs have been downloaded for this batch. Deleting will permanently remove cloud files without an archive copy.
                      </div>
                    </div>
                  ) : (
                    <div className="bg-slate-50 rounded-xl border border-slate-200 p-2.5 max-h-36 overflow-y-auto space-y-1.5 text-xs">
                      <div className="flex items-center gap-2 pb-1 text-[11px] text-slate-500 border-b border-slate-200/60">
                        <span className="inline-flex items-center gap-1">
                          {deletionSummary.batchZipDownloaded ? (
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          ) : (
                            <AlertTriangle className="w-3 h-3 text-amber-500" />
                          )}
                          Batch ZIP: {deletionSummary.batchZipDownloaded ? 'Downloaded' : 'None'}
                        </span>
                        <span>·</span>
                        <span>Product ZIPs: {deletionSummary.productZipsDownloadedCount}/{deletionSummary.totalProducts}</span>
                        <span>·</span>
                        <span>PDFs: {deletionSummary.reportsDownloadedCount}/{deletionSummary.totalProducts}</span>
                      </div>
                      {deletionSummary.downloadHistory.slice(0, 5).map((dl) => (
                        <div key={dl.id} className="flex items-center justify-between text-[11px] py-1 border-b border-slate-100 last:border-0">
                          <div className="flex items-center gap-2 truncate">
                            {getDownloadTypeBadge(dl.downloadType)}
                            <span className="truncate text-slate-700 font-medium">
                              {dl.filename || dl.productName || 'Archive'}
                            </span>
                          </div>
                          <span className="text-slate-400 text-[10px] flex-shrink-0 ml-2">
                            {formatDateTime(dl.downloadedAt)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Retention Policy Eligibility Notice */}
                {deletionSummary.isEligibleForDeletion && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 flex items-start gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold mb-0.5">⚠️ Retention Policy: Eligible for Deletion</p>
                      This batch has been inactive for {deletionSummary.inactivityDays || 5} days, exceeding the {deletionSummary.retentionDays || 5}-day retention threshold.
                    </div>
                  </div>
                )}

                {/* Permanent Deletion Notice */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-700 leading-relaxed">
                  <p className="font-semibold text-slate-900 mb-0.5">Storage Deletion & Audit History</p>
                  All associated binary files in Supabase Storage will be deleted immediately. Database audit records and download logs are safely preserved.
                </div>

                {/* Consent Checkbox */}
                <div
                  onClick={() => setConfirmConsent(!confirmConsent)}
                  className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer select-none transition-colors"
                >
                  <div className="mt-0.5 text-blue-600">
                    {confirmConsent ? (
                      <CheckSquare className="w-4 h-4 text-blue-600" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-400" />
                    )}
                  </div>
                  <label className="text-xs text-slate-700 font-medium cursor-pointer">
                    I confirm that I want to delete this batch and its associated cloud files from Supabase Storage.
                  </label>
                </div>

                {/* Modal Action Buttons */}
                <div className="flex gap-2.5 pt-1">
                  <button
                    type="button"
                    onClick={() => setDeletingBatch(null)}
                    className="flex-1 py-2.5 border border-slate-200 rounded-xl text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={deleting || !confirmConsent}
                    className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-xs font-semibold hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors shadow-sm shadow-red-600/25"
                  >
                    {deleting ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                    Delete Batch
                  </button>
                </div>
              </form>
            ) : null}
          </div>
        </div>
      )}

      {/* Expiry Warning Banner for Inactive Batches */}
      {!loading && batches.some((b) => b.isEligibleForDeletion) && (
        <div className="mb-6 bg-amber-50 border border-amber-200/80 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs">
            <h4 className="font-semibold text-amber-900 text-sm">
              Batch Inactivity Expiry Warning
            </h4>
            <p className="text-amber-800 mt-1 leading-relaxed">
              One or more batches have been inactive for 5 or more days and are eligible for manual deletion.
              Batches and cloud files are never automatically deleted — workers can inspect and manually delete them using the Delete button on each card.
            </p>
          </div>
        </div>
      )}

      {/* Batches list */}
      {loading && batches.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="bg-white rounded-xl border border-slate-200/60 p-5 shadow-sm animate-pulse space-y-4"
            >
              <div className="flex justify-between items-start">
                <div className="space-y-2">
                  <div className="h-4 w-32 bg-slate-200 rounded" />
                  <div className="h-3 w-16 bg-slate-100 rounded-full" />
                </div>
                <div className="w-9 h-9 rounded-lg bg-slate-200" />
              </div>
              <div className="grid grid-cols-3 gap-3 pt-2">
                <div className="h-8 bg-slate-100 rounded" />
                <div className="h-8 bg-slate-100 rounded" />
                <div className="h-8 bg-slate-100 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : batches.length === 0 ? (
        <div className="text-center py-20">
          <Package className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No batches yet</p>
          <p className="text-sm text-slate-400">Create your first batch to get started</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {batches.map((batch) => (
            <div
              key={batch.id}
              className={`bg-white rounded-xl border shadow-sm hover:shadow-md transition-all overflow-hidden ${
                batch.isEligibleForDeletion ? 'border-amber-300 ring-1 ring-amber-300/50' : 'border-slate-200/60'
              }`}
            >
              {/* Expiry header bar if eligible */}
              {batch.isEligibleForDeletion && (
                <div className="bg-amber-500 text-white text-[10px] font-semibold px-4 py-1 flex items-center justify-between tracking-wide">
                  <span className="flex items-center gap-1.5">
                    <AlertTriangle className="w-3 h-3 text-amber-100" />
                    ELIGIBLE FOR DELETION ({batch.inactivityDays || 5}+ DAYS INACTIVE)
                  </span>
                  <span className="text-[9px] text-amber-100">Manual Deletion Required</span>
                </div>
              )}

              {/* Card header */}
              <div className="p-5 pb-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-slate-900 truncate">{batch.batchName}</h3>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${getStatusColor(batch.status)}`}>
                        {formatStatus(batch.status)}
                      </span>
                      {batch.isEligibleForDeletion && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-200">
                          <AlertTriangle className="w-2.5 h-2.5 text-amber-600" />
                          Retention Expired
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
                    <Package className="w-4.5 h-4.5 text-blue-600" />
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-3 mt-4">
                  <div className="text-center">
                    <p className="text-lg font-bold text-slate-900">{batch.totalDateFolders}</p>
                    <p className="text-[10px] text-slate-500 uppercase">Dates</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-slate-900">{batch.totalProducts}</p>
                    <p className="text-[10px] text-slate-500 uppercase">Products</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-emerald-600">{batch.completedProducts}</p>
                    <p className="text-[10px] text-slate-500 uppercase">Complete</p>
                  </div>
                </div>
              </div>

              {/* Card footer */}
              <div className="px-5 py-3 bg-slate-50/50 border-t border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-3 text-[11px] text-slate-500">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {formatDateTime(batch.createdAt)}
                  </span>
                  <span className="flex items-center gap-1">
                    <HardDrive className="w-3 h-3" />
                    {formatBytes(batch.storageUsed)}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <Link
                    to={`/batches/${batch.id}`}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                    title="Open Batch"
                  >
                    <FolderOpen className="w-4 h-4" />
                  </Link>
                  <button
                    onClick={() => openEdit(batch)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                    title="Edit Batch"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => openDelete(batch)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                    title="Delete Batch"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
