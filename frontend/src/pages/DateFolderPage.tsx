import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getDateFolder, createProduct } from '../services/api';
import type { DateFolderDetail } from '../types';
import { formatDate } from '../utils/helpers';
import {
  ArrowLeft, Plus, Package, Loader2, X, CheckCircle2,
  FolderOpen
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function DateFolderPage() {
  const { dateId } = useParams<{ dateId: string }>();
  const [folder, setFolder] = useState<DateFolderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [productName, setProductName] = useState('');
  const [productCode, setProductCode] = useState('');
  const [material, setMaterial] = useState('');
  const [remarks, setRemarks] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchData = async () => {
    if (!dateId) return;
    try {
      const data = await getDateFolder(dateId);
      setFolder(data);
    } catch {
      toast.error('Failed to load date folder');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [dateId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dateId) return;
    setCreating(true);
    try {
      await createProduct(dateId, {
        productName: productName.trim(),
        productCode: productCode.trim(),
        metadata: {
          material: material.trim() || undefined,
          remarks: remarks.trim() || undefined,
        },
      });
      toast.success('Product created');
      setShowCreate(false);
      setProductName('');
      setProductCode('');
      setMaterial('');
      setRemarks('');
      fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to create product');
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  if (!folder) {
    return <div className="text-center py-20 text-slate-500">Date folder not found</div>;
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <Link
          to={`/batches/${folder.batch.id}`}
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-blue-600 mb-3 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to {folder.batch.batchName}
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{formatDate(folder.workDate)}</h1>
            <p className="text-sm text-slate-500 mt-1">
              {folder.batch.batchName} · {folder.products.length} products
            </p>
          </div>
          {folder.batch.status === 'active' && (
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl text-sm font-medium shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all"
            >
              <Plus className="w-4 h-4" />
              Add Product
            </button>
          )}
        </div>
      </div>

      {/* Create product modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-slate-900">Add New Product</h2>
              <button onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Product Code *</label>
                <input
                  type="text"
                  value={productCode}
                  onChange={(e) => setProductCode(e.target.value)}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., PRD-001"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Product Name *</label>
                <input
                  type="text"
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., Steel Sample A"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Material / Grade</label>
                <input
                  type="text"
                  value={material}
                  onChange={(e) => setMaterial(e.target.value)}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., AISI 304"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Remarks</label>
                <textarea
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  rows={2}
                  placeholder="Optional remarks..."
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Products list */}
      {folder.products.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-slate-200/60">
          <Package className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No products yet</p>
          <p className="text-sm text-slate-400">Add a product to start uploading files</p>
        </div>
      ) : (
        <div className="space-y-3">
          {folder.products.map((product) => {
            const files = product.files || [];
            const microCount = files.filter((f) => f.category === 'microstructure').length;
            const hasGraph = files.some((f) => f.category === 'graph');
            const hasPdf = files.some((f) => f.category === 'source_pdf');
            const hasWa = files.some((f) => f.category === 'whatsapp_image');
            const hasReport = files.some((f) => f.category === 'generated_report');
            const totalDone = [microCount > 0, hasGraph, hasPdf, hasWa, hasReport].filter(Boolean).length;
            const percent = Math.round((totalDone / 5) * 100);

            return (
              <Link
                key={product.id}
                to={`/products/${product.id}`}
                className="block bg-white rounded-xl border border-slate-200/60 p-5 shadow-sm hover:shadow-md hover:border-blue-200 transition-all group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${
                      percent === 100 ? 'bg-emerald-50' : 'bg-slate-50'
                    } group-hover:scale-105 transition-transform`}>
                      {percent === 100 ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                      ) : (
                        <Package className="w-5 h-5 text-slate-400" />
                      )}
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-900">{product.productCode}</h3>
                      <p className="text-sm text-slate-500">{product.productName}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-5">
                    {/* Mini checklist */}
                    <div className="flex items-center gap-1.5">
                      {[
                        { done: microCount > 0, label: 'M' },
                        { done: hasGraph, label: 'G' },
                        { done: hasPdf, label: 'P' },
                        { done: hasWa, label: 'W' },
                        { done: hasReport, label: 'R' },
                      ].map((item, i) => (
                        <div
                          key={i}
                          className={`w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold ${
                            item.done
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-slate-100 text-slate-400'
                          }`}
                          title={item.label}
                        >
                          {item.label}
                        </div>
                      ))}
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-slate-900">{percent}%</p>
                      <p className="text-[10px] text-slate-500">Complete</p>
                    </div>
                    <FolderOpen className="w-5 h-5 text-slate-300 group-hover:text-blue-500 transition-colors" />
                  </div>
                </div>

                {/* Progress bar */}
                <div className="mt-3 w-full bg-slate-100 rounded-full h-1.5">
                  <div
                    className={`h-1.5 rounded-full transition-all duration-500 ${
                      percent === 100 ? 'bg-emerald-500' : 'bg-gradient-to-r from-blue-500 to-indigo-500'
                    }`}
                    style={{ width: `${percent}%` }}
                  />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
