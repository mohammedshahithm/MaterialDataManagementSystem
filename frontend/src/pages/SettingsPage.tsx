import { useEffect, useState } from 'react';
import { getRetentionSettings, updateRetentionSettings } from '../services/api';

import { Loader2, Save } from 'lucide-react';
import toast from 'react-hot-toast';

export default function SettingsPage() {

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [retentionDays, setRetentionDays] = useState(5);
  const [storageWarning, setStorageWarning] = useState(0.8);
  const [maxFileSize, setMaxFileSize] = useState(25);

  useEffect(() => {
    getRetentionSettings()
      .then((data) => {

        setRetentionDays(data.retentionDays);
        setStorageWarning(data.storageWarningGb);
        setMaxFileSize(data.maxFileSizeMb);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateRetentionSettings({
        retentionDays,
        storageWarningGb: storageWarning,
        maxFileSizeMb: maxFileSize,
      });
      toast.success('Settings saved');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 text-blue-600 animate-spin" /></div>;
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="text-sm text-slate-500 mt-1">Configure retention, storage, and upload limits</p>
      </div>

      <div className="max-w-lg">
        <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Retention Period (days)</label>
            <input
              type="number"
              value={retentionDays}
              onChange={(e) => setRetentionDays(parseInt(e.target.value) || 5)}
              min={1}
              max={30}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-slate-400 mt-1">Days of inactivity before a batch becomes eligible for deletion.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Storage Warning Threshold (GB)</label>
            <input
              type="number"
              value={storageWarning}
              onChange={(e) => setStorageWarning(parseFloat(e.target.value) || 0.8)}
              min={0.1}
              max={100}
              step={0.1}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-slate-400 mt-1">Show warning when estimated storage exceeds this value</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Max File Size (MB)</label>
            <input
              type="number"
              value={maxFileSize}
              onChange={(e) => setMaxFileSize(parseInt(e.target.value) || 25)}
              min={1}
              max={100}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-slate-400 mt-1">Maximum allowed upload file size per file</p>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
}
