import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth, AuthGuard, RoleGuard } from '@foodiebus/auth';
import { DashboardLayout } from './layouts/DashboardLayout.js';
import { LoginPage } from './pages/Login.js';
import { ForgotPasswordPage } from './pages/ForgotPassword.js';
import { AdminDashboard } from './admin/Dashboard.js';
import { UsersPage } from './admin/Users.js';
import { VendorsPage } from './admin/Vendors.js';
import { OperatorsPage } from './admin/Operators.js';
import { CategoriesPage } from './admin/Categories.js';
import { AuditLogsPage } from './admin/AuditLogs.js';
import { SettingsPage } from './admin/Settings.js';

function RootRedirect() {
  const { user, isAuthenticated } = useAuth();
  if (!isAuthenticated || !user) return <Navigate to="/login" replace />;
  return <Navigate to="/" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route
        element={
          <AuthGuard>
            <RoleGuard roles={['ADMIN', 'SUPER_ADMIN']}>
              <DashboardLayout />
            </RoleGuard>
          </AuthGuard>
        }
      >
        <Route path="/" element={<AdminDashboard />} />
        <Route path="/users" element={<UsersPage />} />
        <Route path="/vendors" element={<VendorsPage />} />
        <Route path="/operators" element={<OperatorsPage />} />
        <Route path="/categories" element={<CategoriesPage />} />
        <Route path="/audit-logs" element={<AuditLogsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<RootRedirect />} />
    </Routes>
  );
}
