import { format, parseISO } from 'date-fns';

/** Format bytes to human-readable string */
export function formatBytes(bytes: string | number | bigint): string {
  const b = typeof bytes === 'string' ? parseInt(bytes, 10) : Number(bytes);
  if (b === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(b) / Math.log(k));
  return `${parseFloat((b / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/** Format date string to DD-MM-YYYY */
export function formatDate(dateStr: string): string {
  try {
    const d = parseISO(dateStr);
    return format(d, 'dd-MM-yyyy');
  } catch {
    return dateStr;
  }
}

/** Format datetime string to DD-MM-YYYY HH:mm */
export function formatDateTime(dateStr: string): string {
  try {
    const d = parseISO(dateStr);
    return format(d, 'dd-MM-yyyy HH:mm');
  } catch {
    return dateStr;
  }
}

/** Get category display name */
export function getCategoryLabel(category: string): string {
  const labels: Record<string, string> = {
    microstructure: 'Microstructure',
    graph: 'Graph',
    source_pdf: 'Original PDF',
    whatsapp_image: 'WhatsApp Image',
    generated_report: 'Generated Report',
  };
  return labels[category] || category;
}

/** Get batch status badge color class */
export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    active: 'bg-emerald-100 text-emerald-800',
    closed: 'bg-slate-100 text-slate-800',
    backup_due: 'bg-amber-100 text-amber-800',
    backup_overdue: 'bg-red-100 text-red-800',
    backup_confirmed: 'bg-blue-100 text-blue-800',
    deletion_approved: 'bg-purple-100 text-purple-800',
    partially_deleted: 'bg-orange-100 text-orange-800',
    deleted: 'bg-gray-100 text-gray-500',
  };
  return colors[status] || 'bg-gray-100 text-gray-800';
}

/** Format status for display */
export function formatStatus(status: string): string {
  return status
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
