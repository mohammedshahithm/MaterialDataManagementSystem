import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  getProduct, uploadFile, deleteFile, getFileDownloadUrl,
  generateReport, downloadReport, downloadProductZip
} from '../services/api';

import type { ProductDetail, ProductFile } from '../types';
import { formatDate, formatDateTime, formatBytes } from '../utils/helpers';
import {
  ArrowLeft, Upload, Trash2, Download,
  CheckCircle2, Circle, AlertTriangle, Loader2, Eye,
  FileArchive, RefreshCw
} from 'lucide-react';
import toast from 'react-hot-toast';

interface UploadSlot {
  category: string;
  slotIndex: number;
  label: string;
  accept: string;
  file: ProductFile | null;
  uploading: boolean;
  progress: number;
}

export default function ProductDetailPage() {
  const { productId } = useParams<{ productId: string }>();

  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [downloadingZip, setDownloadingZip] = useState(false);
  const [slots, setSlots] = useState<UploadSlot[]>([]);

  const fetchProduct = useCallback(async () => {
    if (!productId) return;
    try {
      const data = await getProduct(productId);
      setProduct(data);
      buildSlots(data);
    } catch {
      toast.error('Failed to load product');
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => { fetchProduct(); }, [fetchProduct]);

  const buildSlots = (p: ProductDetail) => {
    const files = p.files;
    const getFile = (cat: string, slot: number) =>
      files.find((f) => f.category === cat && f.slotIndex === slot && f.isLatest) || null;

    setSlots([
      { category: 'microstructure', slotIndex: 0, label: 'Microstructure Image 1', accept: '.jpg,.jpeg,.png,.tiff,.tif', file: getFile('microstructure', 0), uploading: false, progress: 0 },
      { category: 'microstructure', slotIndex: 1, label: 'Microstructure Image 2', accept: '.jpg,.jpeg,.png,.tiff,.tif', file: getFile('microstructure', 1), uploading: false, progress: 0 },
      { category: 'microstructure', slotIndex: 2, label: 'Microstructure Image 3 (Optional)', accept: '.jpg,.jpeg,.png,.tiff,.tif', file: getFile('microstructure', 2), uploading: false, progress: 0 },
      { category: 'graph', slotIndex: 0, label: 'Graph Image', accept: '.jpg,.jpeg,.png', file: getFile('graph', 0), uploading: false, progress: 0 },
      { category: 'source_pdf', slotIndex: 0, label: 'Original PDF Document', accept: '.pdf', file: getFile('source_pdf', 0), uploading: false, progress: 0 },
      { category: 'whatsapp_image', slotIndex: 0, label: 'WhatsApp Image', accept: '.jpg,.jpeg,.png,.webp', file: getFile('whatsapp_image', 0), uploading: false, progress: 0 },
    ]);
  };

  const handleFileSelect = async (slotIdx: number, file: File) => {
    if (!productId) return;
    const slot = slots[slotIdx];

    setSlots((prev) =>
      prev.map((s, i) => (i === slotIdx ? { ...s, uploading: true, progress: 0 } : s))
    );

    try {
      await uploadFile(
        productId,
        file,
        slot.category,
        slot.slotIndex,
        (progress) => {
          setSlots((prev) =>
            prev.map((s, i) => (i === slotIdx ? { ...s, progress } : s))
          );
        }
      );
      toast.success(`${slot.label} uploaded`);
      await fetchProduct();
    } catch (err: any) {
      toast.error(err.response?.data?.error || `Failed to upload ${slot.label}`);
    } finally {
      setSlots((prev) =>
        prev.map((s, i) => (i === slotIdx ? { ...s, uploading: false, progress: 0 } : s))
      );
    }
  };

  const handleDeleteFile = async (fileId: string, label: string) => {
    if (!confirm(`Delete ${label}?`)) return;
    try {
      await deleteFile(fileId);
      toast.success('File deleted');
      await fetchProduct();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to delete file');
    }
  };

  const handlePreviewFile = async (fileId: string) => {
    try {
      const { downloadUrl } = await getFileDownloadUrl(fileId, true);
      window.open(downloadUrl, '_blank');
    } catch {
      toast.error('Failed to get preview URL');
    }
  };

  const handleGenerateReport = async () => {
    if (!productId) return;
    setGeneratingPdf(true);
    try {
      await generateReport(productId);
      toast.success('PDF report generated!');
      await fetchProduct();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to generate report');
    } finally {
      setGeneratingPdf(false);
    }
  };

  const handleDownloadReport = async () => {
    if (!productId) return;
    setDownloadingPdf(true);
    try {
      const url = downloadReport(productId);
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to download report');
      const blob = await response.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${product?.productCode || 'product'}-report.pdf`;
      link.click();
      URL.revokeObjectURL(link.href);
      toast.success('Report downloaded successfully');
      await fetchProduct();
    } catch (err: any) {
      toast.error('Failed to download report');
    } finally {
      setDownloadingPdf(false);
    }
  };

  const handleDownloadZip = async () => {
    if (!productId) return;
    setDownloadingZip(true);
    try {
      const url = downloadProductZip(productId);
      const response = await fetch(url);
      
      if (!response.ok) throw new Error('Download failed');
      
      const blob = await response.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${product?.productCode || 'product'}.zip`;
      link.click();
      URL.revokeObjectURL(link.href);
      toast.success('ZIP download complete');
      await fetchProduct();
    } catch (err: any) {
      toast.error('Failed to download ZIP');
    } finally {
      setDownloadingZip(false);
    }
  };

  if (loading && !product) {
    return (
      <div>
        <div className="mb-8 space-y-2 animate-pulse">
          <div className="h-4 w-24 bg-slate-200 rounded" />
          <div className="h-7 w-48 bg-slate-300 rounded" />
          <div className="h-4 w-32 bg-slate-200 rounded" />
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 animate-pulse">
          <div className="xl:col-span-2 space-y-4">
            <div className="h-64 bg-slate-100 rounded-xl" />
          </div>
          <div className="space-y-4">
            <div className="h-48 bg-slate-100 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (!product) {
    return <div className="text-center py-20 text-slate-500">Product not found</div>;
  }

  const checklist = product.checklist;
  const checklistItems = [
    { key: 'microstructure1', label: 'Microstructure 1', done: checklist.microstructure1 },
    { key: 'microstructure2', label: 'Microstructure 2', done: checklist.microstructure2 },
    { key: 'microstructure3', label: 'Microstructure 3 (Optional)', done: checklist.microstructure3, optional: true },
    { key: 'graph', label: 'Graph', done: checklist.graph },
    { key: 'sourcePdf', label: 'Original PDF', done: checklist.sourcePdf },
    { key: 'whatsappImage', label: 'WhatsApp Image', done: checklist.whatsappImage },
    { key: 'reportGenerated', label: 'Report Generated', done: checklist.reportGenerated },
    { key: 'reportDownloaded', label: 'Report Downloaded', done: checklist.reportDownloaded },
    { key: 'zipDownloaded', label: 'Product ZIP Downloaded', done: checklist.zipDownloaded },
  ];

  const canGenerateReport = checklist.microstructure1 && checklist.graph && checklist.sourcePdf && checklist.whatsappImage;

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <Link
          to={`/dates/${product.dateFolderId}`}
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-blue-600 mb-3 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to {formatDate(product.dateFolder.workDate)}
        </Link>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{product.productCode}</h1>
            <p className="text-slate-600 mt-1">{product.productName}</p>
            <p className="text-xs text-slate-400 mt-1">
              {product.dateFolder.batch.batchName} · {formatDate(product.dateFolder.workDate)}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Completion badge */}
            <div className={`px-4 py-2 rounded-xl text-sm font-medium ${
              product.completionPercent === 100
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-blue-50 text-blue-700 border border-blue-200'
            }`}>
              {product.completionPercent}% Complete
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left: Upload sections */}
        <div className="xl:col-span-2 space-y-5">
          {/* Report outdated warning */}
          {product.reportOutdated && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-amber-800">Report Outdated</p>
                <p className="text-xs text-amber-600">
                  Source files have been updated since the last report generation. Please regenerate the report.
                </p>
              </div>
            </div>
          )}

          {/* Upload slots */}
          <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h2 className="font-semibold text-slate-900">File Uploads</h2>
              <p className="text-xs text-slate-500 mt-0.5">Upload product files for each category</p>
            </div>
            <div className="p-6 space-y-4">
              {slots.map((slot, idx) => (
                <div
                  key={`${slot.category}-${slot.slotIndex}`}
                  className={`border rounded-xl p-4 transition-all ${
                    slot.file
                      ? 'border-emerald-200 bg-emerald-50/30'
                      : 'border-slate-200 hover:border-blue-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {slot.file ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                      ) : (
                        <Circle className="w-5 h-5 text-slate-300" />
                      )}
                      <div>
                        <p className="text-sm font-medium text-slate-900">{slot.label}</p>
                        {slot.file && (
                          <p className="text-xs text-slate-500 mt-0.5">
                            {slot.file.originalFilename} · {formatBytes(slot.file.fileSize)} · {formatDateTime(slot.file.uploadedAt)}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {slot.file && (
                        <>
                          <button
                            onClick={() => handlePreviewFile(slot.file!.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                            title="Preview"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteFile(slot.file!.id, slot.label)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                      <label className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
                        slot.file
                          ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          : 'bg-blue-600 text-white hover:bg-blue-700'
                      }`}>
                        {slot.uploading ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Upload className="w-3.5 h-3.5" />
                        )}
                        {slot.file ? 'Replace' : 'Upload'}
                        <input
                          type="file"
                          accept={slot.accept}
                          className="hidden"
                          disabled={slot.uploading}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleFileSelect(idx, f);
                            e.target.value = '';
                          }}
                        />
                      </label>
                    </div>
                  </div>
                  {/* Upload progress */}
                  {slot.uploading && (
                    <div className="mt-3 w-full bg-slate-100 rounded-full h-1.5">
                      <div
                        className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
                        style={{ width: `${slot.progress}%` }}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm p-6">
            <h2 className="font-semibold text-slate-900 mb-4">Actions</h2>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleGenerateReport}
                disabled={!canGenerateReport || generatingPdf}
                className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl text-sm font-medium shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {generatingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                {product.reportOutdated ? 'Regenerate Report' : 'Generate Report'}
              </button>
              <button
                onClick={handleDownloadReport}
                disabled={!checklist.reportGenerated || downloadingPdf}
                className="flex items-center gap-2 px-5 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {downloadingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                Download PDF
              </button>
              <button
                onClick={handleDownloadZip}
                disabled={downloadingZip || product.files.length === 0}
                className="flex items-center gap-2 px-5 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {downloadingZip ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileArchive className="w-4 h-4" />}
                Download ZIP
              </button>
            </div>
            {!canGenerateReport && (
              <p className="text-xs text-amber-600 mt-3">
                ⚠ Upload at least 1 microstructure image, graph, original PDF, and WhatsApp image to generate the report.
              </p>
            )}
          </div>
        </div>

        {/* Right: Checklist and metadata */}
        <div className="space-y-5">
          {/* Product info */}
          <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm p-5">
            <h3 className="font-semibold text-slate-900 mb-3 text-sm">Product Info</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Code</span>
                <span className="font-medium text-slate-900">{product.productCode}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Batch</span>
                <span className="font-medium text-slate-900">{product.dateFolder.batch.batchName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Date</span>
                <span className="font-medium text-slate-900">{formatDate(product.dateFolder.workDate)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Created by</span>
                <span className="font-medium text-slate-900">{product.createdBy.fullName}</span>
              </div>
              {product.metadata && (
                <>
                  {(product.metadata as any).material && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">Material</span>
                      <span className="font-medium text-slate-900">{(product.metadata as any).material}</span>
                    </div>
                  )}
                  {(product.metadata as any).remarks && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">Remarks</span>
                      <span className="font-medium text-slate-900">{(product.metadata as any).remarks}</span>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Progress */}
          <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-slate-900 text-sm">Progress</h3>
              <span className={`text-lg font-bold ${
                product.completionPercent === 100 ? 'text-emerald-600' : 'text-blue-600'
              }`}>
                {product.completionPercent}%
              </span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2.5 mb-4">
              <div
                className={`h-2.5 rounded-full transition-all duration-700 ${
                  product.completionPercent === 100 ? 'bg-emerald-500' : 'bg-gradient-to-r from-blue-500 to-indigo-500'
                }`}
                style={{ width: `${product.completionPercent}%` }}
              />
            </div>

            {/* Checklist */}
            <div className="space-y-2">
              {checklistItems.map((item) => (
                <div
                  key={item.key}
                  className={`flex items-center gap-2.5 py-1.5 ${item.optional && !item.done ? 'opacity-50' : ''}`}
                >
                  {item.done ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                  ) : (
                    <Circle className="w-4 h-4 text-slate-300 flex-shrink-0" />
                  )}
                  <span className={`text-xs ${item.done ? 'text-slate-700' : 'text-slate-400'}`}>
                    {item.label}
                    {item.optional && ' (Optional)'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
