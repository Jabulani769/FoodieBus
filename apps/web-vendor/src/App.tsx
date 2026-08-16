import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from '@foodiebus/auth';
import { LoginPage } from './pages/Login.js';
import { ForgotPasswordPage } from './pages/ForgotPassword.js';
import { DashboardLayout } from './layouts/DashboardLayout.js';
import { VendorDashboard } from './vendor/Dashboard.js';
import { MenuPage } from './vendor/Menu.js';
import { OrdersPage } from './vendor/Orders.js';
import { VendorRatings } from './vendor/Ratings.js';
import { PayoutsPage } from './vendor/Payouts.js';
import { ProfilePage } from './pages/Profile.js';
import { OperatorDashboard } from './operator/Dashboard.js';
import { BusesPage } from './operator/Buses.js';
import { TripsPage } from './operator/Trips.js';
import { DriversPage } from './operator/Drivers.js';
import { OperatorSettlements } from './operator/Settlements.js';

function HomeRedirect() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'VENDOR') return <Navigate to="/vendor" replace />;
  if (user.role === 'OPERATOR') return <Navigate to="/operator" replace />;
  return <Navigate to="/login" replace />;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route element={<DashboardLayout />}>
        <Route path="/" element={<HomeRedirect />} />
        <Route path="vendor" element={<VendorDashboard />} />
        <Route path="vendor/menu" element={<MenuPage />} />
        <Route path="vendor/orders" element={<OrdersPage />} />
        <Route path="vendor/ratings" element={<VendorRatings />} />
        <Route path="vendor/payouts" element={<PayoutsPage />} />
        <Route path="operator" element={<OperatorDashboard />} />
        <Route path="operator/buses" element={<BusesPage />} />
        <Route path="operator/trips" element={<TripsPage />} />
        <Route path="operator/drivers" element={<DriversPage />} />
        <Route path="operator/settlements" element={<OperatorSettlements />} />
        <Route path="settings" element={<ProfilePage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
