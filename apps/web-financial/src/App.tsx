import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth, AuthGuard, RoleGuard } from '@foodiebus/auth';
import { DashboardLayout } from './layouts/DashboardLayout.js';
import { LoginPage } from './pages/Login.js';
import { ForgotPasswordPage } from './pages/ForgotPassword.js';
import { FinancialDashboard } from './financial/Dashboard.js';
import { RevenuePage } from './financial/Revenue.js';
import { RefundsPage } from './financial/Refunds.js';
import { SettlementsPage } from './financial/Settlements.js';
import { DriverPayoutsPage } from './financial/DriverPayouts.js';
import { ReconciliationPage } from './financial/Reconciliation.js';
import { AnalyticsPage } from './financial/Analytics.js';
import { ProfilePage } from './pages/Profile.js';

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
            <RoleGuard roles={['FINANCIAL', 'ADMIN', 'SUPER_ADMIN']}>
              <DashboardLayout />
            </RoleGuard>
          </AuthGuard>
        }
      >
        <Route path="/" element={<FinancialDashboard />} />
        <Route path="/revenue" element={<RevenuePage />} />
        <Route path="/refunds" element={<RefundsPage />} />
        <Route path="/settlements" element={<SettlementsPage />} />
        <Route path="/driver-payouts" element={<DriverPayoutsPage />} />
        <Route path="/reconciliation" element={<ReconciliationPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/profile" element={<ProfilePage />} />
      </Route>
      <Route path="*" element={<RootRedirect />} />
    </Routes>
  );
}
