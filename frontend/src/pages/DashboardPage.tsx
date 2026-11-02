import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getDashboard } from '../services/api';
import type { DashboardSummary } from '../types';

import {
  Package, CheckCircle2, Clock, HardDrive,
  AlertTriangle, Trash2, Layers, FileText
} from 'lucide-react';

const statCards = [
  { key: 'totalBatches', label: 'Total Batches', icon: Package, color: 'from-blue-500 to-blue-600' },
  { key: 'totalProducts', label: 'Total Products', icon: Layers, color: 'from-indigo-500 to-indigo-600' },
  { key: 'completedProducts', label: 'Completed', icon: CheckCircle2, color: 'from-emerald-500 to-emerald-600' },
  { key: 'pendingUploads', label: 'Pending Uploads', icon: Clock, color: 'from-amber-500 to-amber-600' },
  { key: 'storageUsedGb', label: 'Storage Used', icon: HardDrive, color: 'from-purple-500 to-purple-600', suffix: ' GB' },
  { key: 'totalFiles', label: 'Total Files', icon: FileText, color: 'from-cyan-500 to-cyan-600' },
  { key: 'activeBatches', label: 'Active Batches', icon: Layers, color: 'from-orange-500 to-orange-600' },
  { key: 'readyForDeletion', label: 'Ready for Deletion', icon: Trash2, color: 'from-rose-500 to-rose-600' },
];

export default function DashboardPage() {
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDashboard()
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading && !data) {
    return (
      <div>
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">
            Overview of your material data management system
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="bg-white rounded-xl border border-slate-200/60 p-5 shadow-sm animate-pulse"
            >
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <div className="h-3 w-20 bg-slate-200 rounded" />
                  <div className="h-7 w-16 bg-slate-300 rounded" />
                </div>
                <div className="w-10 h-10 rounded-xl bg-slate-200" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-500 mt-1">
          Overview of your material data management system
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        {statCards.map((card) => {
          const Icon = card.icon;
          const value = data
            ? card.suffix
              ? `${(data as any)[card.key]}${card.suffix}`
              : (data as any)[card.key]
            : '—';

          return (
            <div
              key={card.key}
              className="bg-white rounded-xl border border-slate-200/60 p-5 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                    {card.label}
                  </p>
                  <p className="text-2xl font-bold text-slate-900 mt-1">{value}</p>
                </div>
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${card.color} flex items-center justify-center shadow-lg`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Storage warning */}
      {data && parseFloat(data.storageUsedGb) >= data.storageWarningGb && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-8 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-amber-800">Storage Warning</p>
            <p className="text-xs text-amber-600">
              Cloud storage usage ({data.storageUsedGb} GB) has reached the warning threshold
              ({data.storageWarningGb} GB). Consider backing up and deleting completed batches.
            </p>
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <Link
          to="/batches"
          className="bg-white rounded-xl border border-slate-200/60 p-6 shadow-sm hover:shadow-md hover:border-blue-200 transition-all group"
        >
          <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center mb-4 group-hover:bg-blue-100 transition-colors">
            <Package className="w-6 h-6 text-blue-600" />
          </div>
          <h3 className="font-semibold text-slate-900 mb-1">Batch Management</h3>
          <p className="text-sm text-slate-500">
            Create batches, manage dates, and track material data
          </p>
        </Link>

        <Link
          to="/downloads"
          className="bg-white rounded-xl border border-slate-200/60 p-6 shadow-sm hover:shadow-md hover:border-blue-200 transition-all group"
        >
          <div className="w-12 h-12 rounded-xl bg-purple-50 flex items-center justify-center mb-4 group-hover:bg-purple-100 transition-colors">
            <CheckCircle2 className="w-6 h-6 text-purple-600" />
          </div>
          <h3 className="font-semibold text-slate-900 mb-1">Download Archive</h3>
          <p className="text-sm text-slate-500">
            Download batch ZIP archives and verify local copies
          </p>
        </Link>

        <Link
          to="/storage"
          className="bg-white rounded-xl border border-slate-200/60 p-6 shadow-sm hover:shadow-md hover:border-blue-200 transition-all group"
        >
          <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center mb-4 group-hover:bg-amber-100 transition-colors">
            <HardDrive className="w-6 h-6 text-amber-600" />
          </div>
          <h3 className="font-semibold text-slate-900 mb-1">Storage Monitor</h3>
          <p className="text-sm text-slate-500">
            Monitor cloud storage usage and manage retention
          </p>
        </Link>
      </div>
    </div>
  );
}
