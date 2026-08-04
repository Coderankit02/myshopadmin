import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { roleAtLeast } from '../lib/auth';

/**
 * ProtectedRoute — auth + RBAC gate.
 * `minRole` optional: e.g. <ProtectedRoute minRole="manager"> means only
 * super_admin/admin/manager can open that page.
 */
export default function ProtectedRoute({ children, minRole }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="route-loading" role="status" aria-live="polite">
        Loading...
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/" replace />;
  }
  if (minRole && !roleAtLeast(user.role || user.app_metadata?.role, minRole)) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}
