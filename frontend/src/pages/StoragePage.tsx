import { useEffect, useState } from 'react';
import { getStorageSummary } from '../services/api';
import type { StorageSummary } from '../types';
import { formatBytes, formatStatus, getStatusColor } from '../utils/helpers';
import { AlertTriangle } from 'lucide-react';

export default function StoragePage() {
  const [data, setData] = useState<StorageSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getStorageSummary()
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading && !data) {
    return (
      <div>
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">Storage Monitor</h1>
          <p className="text-sm text-slate-500 mt-1">Track cloud storage usage across all batches (estimated)</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-5 mb-8">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-200/60 p-5 shadow-sm animate-pulse space-y-2">
              <div className="h-3 w-24 bg-slate-200 rounded" />
              <div className="h-7 w-20 bg-slate-300 rounded" />
              <div className="h-2 w-32 bg-slate-100 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const usedPercent = (parseFloat(data.totalStorageGb) / data.warningThresholdGb) * 100;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Storage Monitor</h1>
        <p className="text-sm text-slate-500 mt-1">Track cloud storage usage across all batches (estimated)</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5 mb-8">
        <div className="bg-white rounded-xl border border-slate-200/60 p-5 shadow-sm">
          <p className="text-xs text-slate-500 uppercase tracking-wider">Total Storage</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{data.totalStorageGb} GB</p>
          <p className="text-xs text-slate-400 mt-1">of {data.warningThresholdGb} GB threshold</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200/60 p-5 shadow-sm">
          <p className="text-xs text-slate-500 uppercase tracking-wider">Total Files</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{data.totalFiles}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200/60 p-5 shadow-sm">
          <p className="text-xs text-slate-500 uppercase tracking-wider">Failed Uploads</p>
          <p className={`text-2xl font-bold mt-1 ${data.failedUploads > 0 ? 'text-red-600' : 'text-slate-900'}`}>{data.failedUploads}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200/60 p-5 shadow-sm">
          <p className="text-xs text-slate-500 uppercase tracking-wider">Pending Deletions</p>
          <p className={`text-2xl font-bold mt-1 ${data.pendingDeletions > 0 ? 'text-orange-600' : 'text-slate-900'}`}>{data.pendingDeletions}</p>
        </div>
      </div>

      {/* Warning */}
      {data.isWarning && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-8 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
          <p className="text-sm text-amber-800">Storage usage has exceeded the warning threshold. Consider backing up and deleting completed batches.</p>
        </div>
      )}

      {/* Usage bar */}
      <div className="bg-white rounded-xl border border-slate-200/60 p-6 shadow-sm mb-8">
        <h3 className="font-semibold text-slate-900 mb-4">Storage Usage</h3>
        <div className="w-full bg-slate-100 rounded-full h-4 mb-2">
          <div
            className={`h-4 rounded-full transition-all ${
              data.isWarning ? 'bg-gradient-to-r from-red-500 to-orange-500' : 'bg-gradient-to-r from-blue-500 to-indigo-500'
            }`}
            style={{ width: `${Math.min(usedPercent, 100)}%` }}
          />
        </div>
        <p className="text-xs text-slate-500">
          {data.totalStorageGb} GB used · Warning at {data.warningThresholdGb} GB · This is an application-calculated estimate
        </p>
      </div>

      {/* Batch breakdown */}
      <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h3 className="font-semibold text-slate-900">Storage by Batch</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50">
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Batch</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Status</th>
                <th className="text-right px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Files</th>
                <th className="text-right px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Storage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.batchStorage.map((b) => (
                <tr key={b.batchId} className="hover:bg-slate-50/50">
                  <td className="px-6 py-3 text-sm font-medium text-slate-900">{b.batchName}</td>
                  <td className="px-6 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${getStatusColor(b.status)}`}>
                      {formatStatus(b.status)}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-sm text-slate-600 text-right">{b.fileCount}</td>
                  <td className="px-6 py-3 text-sm font-medium text-slate-900 text-right">{formatBytes(b.storageUsed)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
