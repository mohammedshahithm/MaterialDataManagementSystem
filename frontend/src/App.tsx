import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import AppLayout from './components/layout/AppLayout';

// Route-based code splitting with React.lazy
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const BatchesPage = lazy(() => import('./pages/BatchesPage'));
const BatchDetailPage = lazy(() => import('./pages/BatchDetailPage'));
const DateFolderPage = lazy(() => import('./pages/DateFolderPage'));
const ProductDetailPage = lazy(() => import('./pages/ProductDetailPage'));
const BackupPage = lazy(() => import('./pages/BackupPage'));
const StoragePage = lazy(() => import('./pages/StoragePage'));
const UsersPage = lazy(() => import('./pages/UsersPage'));
const AuditLogsPage = lazy(() => import('./pages/AuditLogsPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* Direct internal factory terminal routing */}
            <Route path="/login" element={<Navigate to="/" replace />} />
            <Route element={<AppLayout />}>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/batches" element={<BatchesPage />} />
              <Route path="/batches/:batchId" element={<BatchDetailPage />} />
              <Route path="/dates/:dateId" element={<DateFolderPage />} />
              <Route path="/products/:productId" element={<ProductDetailPage />} />
              <Route path="/backup" element={<BackupPage />} />
              <Route path="/downloads" element={<BackupPage />} />
              <Route path="/storage" element={<StoragePage />} />
              <Route path="/audit-logs" element={<AuditLogsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/users" element={<UsersPage />} />
            </Route>
          </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  );
}
