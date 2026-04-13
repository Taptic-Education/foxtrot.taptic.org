import React, { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { useStore } from './lib/store';

import Layout from './components/Layout/Layout';
import Toast from './components/Toast';

import Setup from './pages/Setup';
import Login from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import InviteAccept from './pages/InviteAccept';
import Dashboard from './pages/Dashboard';
import CostCenters from './pages/CostCenters';
import CostCenterDetail from './pages/CostCenterDetail';
import Transactions from './pages/Transactions';
import Payments from './pages/Payments';
import FundRequests from './pages/FundRequests';
import AuditLog from './pages/AuditLog';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import Users from './pages/Users';
import Profile from './pages/Profile';
import ScheduledTransfers from './pages/ScheduledTransfers';

function ProtectedRoute({ children, roles }) {
  const { auth } = useStore();

  if (auth.isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div className="skeleton" style={{ width: 200, height: 20 }} />
      </div>
    );
  }

  if (!auth.user) {
    return <Navigate to="/login" replace />;
  }

  if (roles && !roles.includes(auth.user.role)) {
    return <Navigate to="/" replace />;
  }

  return children;
}

export default function App() {
  const { fetchMe, theme, fetchNotifications } = useStore();
  const location = useLocation();

  useEffect(() => {
    // Apply saved theme
    const saved = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', saved);

    // Skip auth check on public pages
    const publicPaths = ['/setup', '/login', '/forgot-password', '/reset-password', '/invite/accept'];
    if (publicPaths.some((p) => window.location.pathname.startsWith(p))) {
      useStore.setState({ auth: { user: null, isLoading: false } });
      return;
    }

    fetchMe().then((user) => {
      if (user) fetchNotifications();
    });
  }, []);

  return (
    <>
      <Toast />
      <AnimatePresence mode="wait">
        <Routes location={location}>
          {/* Public routes */}
          <Route path="/setup" element={<Setup />} />
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/invite/accept" element={<InviteAccept />} />

          {/* Protected routes */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="cost-centers" element={<CostCenters />} />
            <Route path="cost-centers/:id" element={<CostCenterDetail />} />
            <Route path="transactions" element={<Transactions />} />
            <Route
              path="payments"
              element={
                <ProtectedRoute roles={['super_admin']}>
                  <Payments />
                </ProtectedRoute>
              }
            />
            <Route path="fund-requests" element={<FundRequests />} />
            <Route
              path="audit-log"
              element={
                <ProtectedRoute roles={['super_admin']}>
                  <AuditLog />
                </ProtectedRoute>
              }
            />
            <Route
              path="reports"
              element={
                <ProtectedRoute roles={['super_admin']}>
                  <Reports />
                </ProtectedRoute>
              }
            />
            <Route
              path="settings"
              element={
                <ProtectedRoute roles={['super_admin']}>
                  <Settings />
                </ProtectedRoute>
              }
            />
            <Route
              path="users"
              element={
                <ProtectedRoute roles={['super_admin']}>
                  <Users />
                </ProtectedRoute>
              }
            />
            <Route
              path="scheduled-transfers"
              element={
                <ProtectedRoute roles={['super_admin']}>
                  <ScheduledTransfers />
                </ProtectedRoute>
              }
            />
            <Route path="profile" element={<Profile />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AnimatePresence>
    </>
  );
}
