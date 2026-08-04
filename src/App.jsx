import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { ModalProvider } from './context/ModalContext';
import ProtectedRoute from './components/ProtectedRoute';

import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Orders from './pages/Orders';
import Products from './pages/Products';
import Categories from './pages/Categories';
import Brands from './pages/Brands';
import Coupons from './pages/Coupons';
import Homepage from './pages/Homepage';
import Banners from './pages/Banners';
import Reviews from './pages/Reviews';
import Customers from './pages/Customers';
import Inventory from './pages/Inventory';
import Payments from './pages/Payments';
import Delivery from './pages/Delivery';
import Support from './pages/Support';
import Ai from './pages/Ai';
import Analytics from './pages/Analytics';
import Team from './pages/Team';
import Security from './pages/Security';
import Settings from './pages/Settings';
import NotFound from './pages/NotFound';

function wrap(Component, minRole) {
  return (
    <ProtectedRoute minRole={minRole}>
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
              <Route path="/brands" element={wrap(Brands)} />
              <Route path="/coupons" element={wrap(Coupons)} />
              <Route path="/homepage" element={wrap(Homepage, 'manager')} />
              <Route path="/banners" element={wrap(Banners)} />
              <Route path="/reviews" element={wrap(Reviews)} />
              <Route path="/customers" element={wrap(Customers)} />
              <Route path="/inventory" element={wrap(Inventory)} />
              <Route path="/payments" element={wrap(Payments)} />
              <Route path="/delivery" element={wrap(Delivery)} />
              <Route path="/support" element={wrap(Support)} />
              <Route path="/ai" element={wrap(Ai, 'manager')} />
              <Route path="/analytics" element={wrap(Analytics)} />
              <Route path="/team" element={wrap(Team, 'manager')} />
              <Route path="/security" element={wrap(Security, 'manager')} />
              <Route path="/settings" element={wrap(Settings)} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </ModalProvider>
      </ToastProvider>
    </AuthProvider>
  );
}
