import { Navigate } from 'react-router-dom';

/**
 * LoginPage has been retired for this internal company deployment.
 * Direct access redirects straight to the Dashboard.
 */
export default function LoginPage() {
  return <Navigate to="/" replace />;
}
