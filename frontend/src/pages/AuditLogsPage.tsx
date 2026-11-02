import { useEffect, useState } from 'react';
import { getAuditLogs } from '../services/api';
import type { AuditLog } from '../types';
import { formatDateTime } from '../utils/helpers';
import { Loader2, ChevronLeft, ChevronRight } from 'lucide-react';

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getAuditLogs(page)
      .then((data) => {
        setLogs(data.logs);
        setTotalPages(data.pagination.totalPages);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [page]);

  const actionColor = (action: string) => {
    if (action.includes('DELETE') || action.includes('DELETION')) return 'text-red-600 bg-red-50';
    if (action.includes('CREATE') || action.includes('CONFIRM')) return 'text-emerald-600 bg-emerald-50';
    if (action.includes('UPDATE')) return 'text-blue-600 bg-blue-50';
    if (action.includes('UPLOAD') || action.includes('GENERATE')) return 'text-purple-600 bg-purple-50';
    return 'text-slate-600 bg-slate-50';
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Audit Logs</h1>
        <p className="text-sm text-slate-500 mt-1">Track all actions performed in the system</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 text-blue-600 animate-spin" /></div>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50">
                  <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Time</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">User</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Action</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Entity</th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/50">
                    <td className="px-6 py-3 text-xs text-slate-500 whitespace-nowrap">{formatDateTime(log.createdAt)}</td>
                    <td className="px-6 py-3 text-sm text-slate-900">{log.user.fullName}</td>
                    <td className="px-6 py-3">
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${actionColor(log.action)}`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-xs text-slate-600">{log.entityType}</td>
                    <td className="px-6 py-3 text-xs text-slate-500 max-w-[200px] truncate">
                      {log.details ? JSON.stringify(log.details) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between mt-4">
            <p className="text-sm text-slate-500">Page {page} of {totalPages}</p>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage(page - 1)}
                className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-50">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button disabled={page >= totalPages} onClick={() => setPage(page + 1)}
                className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-50">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
