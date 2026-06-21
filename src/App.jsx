import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { ModalProvider } from './context/ModalContext';
import ProtectedRoute from './components/ProtectedRoute';

import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Orders from './pages/Orders';
import Products from './pages/Products';
import Categories from './pages/Categories';
import Customers from './pages/Customers';
import Inventory from './pages/Inventory';
import Payments from './pages/Payments';
import Delivery from './pages/Delivery';
import Support from './pages/Support';
import Ai from './pages/Ai';
import Analytics from './pages/Analytics';
import Settings from './pages/Settings';

function wrap(Component) {
  return (
    <ProtectedRoute>
      <Component />
    </ProtectedRoute>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <ModalProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Login />} />
              <Route path="/dashboard" element={wrap(Dashboard)} />
              <Route path="/orders" element={wrap(Orders)} />
              <Route path="/products" element={wrap(Products)} />
              <Route path="/categories" element={wrap(Categories)} />
              <Route path="/customers" element={wrap(Customers)} />
              <Route path="/inventory" element={wrap(Inventory)} />
              <Route path="/payments" element={wrap(Payments)} />
              <Route path="/delivery" element={wrap(Delivery)} />
              <Route path="/support" element={wrap(Support)} />
              <Route path="/ai" element={wrap(Ai)} />
              <Route path="/analytics" element={wrap(Analytics)} />
              <Route path="/settings" element={wrap(Settings)} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </ModalProvider>
      </ToastProvider>
    </AuthProvider>
  );
}
