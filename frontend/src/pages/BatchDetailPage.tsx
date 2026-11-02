import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getBatch, createDateFolder, getDateFolders, updateBatch } from '../services/api';
import type { BatchDetail, DateFolder } from '../types';
import { formatDate, formatDateTime, formatBytes, getStatusColor, formatStatus } from '../utils/helpers';
import {
  ArrowLeft, Plus, CalendarDays, Loader2, X, FolderOpen, Edit2, AlertTriangle
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function BatchDetailPage() {
  const { batchId } = useParams<{ batchId: string }>();
  const [batch, setBatch] = useState<BatchDetail | null>(null);
  const [dateFolders, setDateFolders] = useState<DateFolder[]>([]);
  const [loading, setLoading] = useState(true);

  // Create date modal state
  const [showCreateDate, setShowCreateDate] = useState(false);
  const [newDate, setNewDate] = useState('');
  const [creating, setCreating] = useState(false);

  // Edit batch modal state
  const [showEditBatch, setShowEditBatch] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [updating, setUpdating] = useState(false);

  const fetchData = async () => {
    if (!batchId) return;
    try {
      const [batchData, foldersData] = await Promise.all([
        getBatch(batchId),
        getDateFolders(batchId),
      ]);
      setBatch(batchData);
      setDateFolders(foldersData);
    } catch {
      toast.error('Failed to load batch');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [batchId]);

  const handleCreateDate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDate || !batchId) return;
    setCreating(true);
    try {
      await createDateFolder(batchId, newDate);
      toast.success('Date folder created');
      setShowCreateDate(false);
      setNewDate('');
      fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to create date folder');
    } finally {
      setCreating(false);
    }
  };

  const openEditBatch = () => {
    if (!batch) return;
    setEditName(batch.batchName);
    setEditDesc(batch.description || '');
    setShowEditBatch(true);
  };

  const handleUpdateBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!batchId || !editName.trim()) return;
    setUpdating(true);
    try {
      await updateBatch(batchId, {
        batchName: editName.trim(),
        description: editDesc.trim() || undefined,
      });
      toast.success('Batch updated successfully');
      setShowEditBatch(false);
      fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to update batch');
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  if (!batch) {
    return <div className="text-center py-20 text-slate-500">Batch not found</div>;
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <Link to="/batches" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-blue-600 mb-3 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Back to Batches
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-slate-900">{batch.batchName}</h1>
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${getStatusColor(batch.status)}`}>
                {formatStatus(batch.status)}
              </span>
              {batch.isEligibleForDeletion && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-200">
                  <AlertTriangle className="w-3 h-3 text-amber-600" />
                  Eligible for Deletion ({batch.inactivityDays || 5}+ days inactive)
                </span>
              )}
            </div>
            {batch.description && (
              <p className="text-sm text-slate-500 mt-1">{batch.description}</p>
            )}
            <p className="text-xs text-slate-400 mt-1">
              Created by {batch.createdBy.fullName} on {formatDateTime(batch.createdAt)}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={openEditBatch}
              className="flex items-center gap-1.5 px-3.5 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-sm font-medium transition-colors shadow-sm"
              title="Edit batch name or description"
            >
              <Edit2 className="w-4 h-4 text-slate-500" />
              Edit Batch
            </button>
            {batch.status !== 'deleted' && (
              <button
                onClick={() => setShowCreateDate(true)}
                className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl text-sm font-medium shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all"
              >
                <Plus className="w-4 h-4" />
                Add Date
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Inactivity Expiry Notice Banner */}
      {batch.isEligibleForDeletion && (
        <div className="mb-6 bg-amber-50 border border-amber-200/80 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs">
            <h4 className="font-semibold text-amber-900 text-sm flex items-center gap-1.5">
              ⚠️ Inactivity Notice: Batch Eligible for Deletion
            </h4>
            <p className="text-amber-800 mt-1 leading-relaxed">
              This batch has been inactive for {batch.inactivityDays || 5} days (exceeding the {batch.retentionDays || 5}-day retention period) and is eligible for manual deletion.
              Batches are never automatically deleted. Creating date folders, adding products, or uploading files will automatically reset the activity timer.
            </p>
          </div>
        </div>
      )}

      {/* Edit batch modal */}
      {showEditBatch && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-slate-900">Edit Batch</h2>
              <button onClick={() => setShowEditBatch(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleUpdateBatch} className="space-y-4">
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
                  onClick={() => setShowEditBatch(false)}
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

      {/* Create date modal */}
      {showCreateDate && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-slate-900">Add Date Folder</h2>
              <button onClick={() => setShowCreateDate(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateDate} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Work Date *</label>
                <input
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateDate(false)}
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

      {/* Date folders */}
      {dateFolders.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-slate-200/60">
          <CalendarDays className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No date folders yet</p>
          <p className="text-sm text-slate-400">Add a date to start creating products</p>
        </div>
      ) : (
        <div className="space-y-4">
          {dateFolders.map((df) => (
            <Link
              key={df.id}
              to={`/dates/${df.id}`}
              className="block bg-white rounded-xl border border-slate-200/60 p-5 shadow-sm hover:shadow-md hover:border-blue-200 transition-all group"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center group-hover:bg-blue-100 transition-colors">
                    <CalendarDays className="w-6 h-6 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900 text-lg">{formatDate(df.workDate)}</h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Created by {df.createdBy} · {formatBytes(df.storageUsed)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-center">
                    <p className="text-lg font-bold text-slate-900">{df.totalProducts}</p>
                    <p className="text-[10px] text-slate-500 uppercase">Products</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-emerald-600">{df.completedProducts}</p>
                    <p className="text-[10px] text-slate-500 uppercase">Complete</p>
                  </div>
                  <FolderOpen className="w-5 h-5 text-slate-300 group-hover:text-blue-500 transition-colors" />
                </div>
              </div>

              {/* Progress bar */}
              {df.totalProducts > 0 && (
                <div className="mt-3 w-full bg-slate-100 rounded-full h-1.5">
                  <div
                    className="bg-gradient-to-r from-blue-500 to-emerald-500 h-1.5 rounded-full transition-all duration-500"
                    style={{ width: `${(df.completedProducts / df.totalProducts) * 100}%` }}
                  />
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
