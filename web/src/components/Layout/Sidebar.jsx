import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  LayoutDashboard,
  Building2,
  ArrowLeftRight,
  CreditCard,
  GitPullRequest,
  ScrollText,
  BarChart3,
  Settings,
  Users,
  User,
  LogOut,
  Sun,
  Moon,
  Menu,
  X,
} from 'lucide-react';
import { useStore } from '../../lib/store';

const navItems = (role, notifications) => {
  const items = [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard, exact: true },
    { to: '/cost-centers', label: 'Cost Centers', icon: Building2 },
    { to: '/transactions', label: 'Transactions', icon: ArrowLeftRight },
    { to: '/fund-requests', label: 'Fund Requests', icon: GitPullRequest, badge: notifications.pendingRequests },
  ];

  if (role === 'super_admin') {
    items.push(
      { to: '/payments', label: 'Payments', icon: CreditCard, badge: notifications.pendingPayments },
      { to: '/reports', label: 'Reports', icon: BarChart3 },
      { to: '/audit-log', label: 'Audit Log', icon: ScrollText },
      { to: '/users', label: 'Users', icon: Users },
      { to: '/settings', label: 'Settings', icon: Settings },
    );
  }

  items.push({ to: '/profile', label: 'Profile', icon: User });

  return items;
};

const sidebarVariants = {
  hidden: { x: -280 },
  visible: {
    x: 0,
    transition: { type: 'tween', duration: 0.3 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, x: -20 },
  visible: (i) => ({
    opacity: 1,
    x: 0,
    transition: { delay: i * 0.05, duration: 0.3 },
  }),
};

export default function Sidebar() {
  const { auth, logout, theme, toggleTheme, notifications } = useStore();
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();

  const items = navItems(auth.user?.role, notifications);

  const handleLogout = async () => {
    await logout();
  };

  const SidebarContent = () => (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={sidebarVariants}
      style={{
        width: 'var(--sidebar-width)',
        height: '100vh',
        position: 'fixed',
        top: 0,
        left: 0,
        background: 'var(--card-bg)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 100,
        overflowY: 'auto',
      }}
    >
      {/* Logo */}
      <div
        style={{
          padding: '24px 24px 20px',
          borderBottom: '2px solid var(--accent)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div
          style={{
            fontWeight: 800,
            fontSize: '1.25rem',
            letterSpacing: '4px',
            textTransform: 'uppercase',
          }}
        >
          FOXTROT
        </div>
        <button
          onClick={() => setMobileOpen(false)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text)', display: 'none' }}
          className="mobile-close-btn"
        >
          <X size={20} />
        </button>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '16px 0' }}>
        {items.map((item, i) => (
          <motion.div key={item.to} custom={i} variants={itemVariants} initial="hidden" animate="visible">
            <NavLink
              to={item.to}
              end={item.exact}
              onClick={() => setMobileOpen(false)}
              style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 24px',
                fontSize: '0.85rem',
                fontWeight: 600,
                letterSpacing: '0.5px',
                textTransform: 'uppercase',
                color: isActive ? 'var(--accent)' : 'var(--muted)',
                background: isActive ? 'var(--hover)' : 'transparent',
                borderLeft: isActive ? '4px solid var(--accent)' : '4px solid transparent',
                textDecoration: 'none',
                transition: 'all 0.15s',
                position: 'relative',
              })}
            >
              <item.icon size={16} />
              <span>{item.label}</span>
              {item.badge > 0 && (
                <span
                  style={{
                    marginLeft: 'auto',
                    background: 'var(--danger)',
                    color: '#fff',
                    fontSize: '0.65rem',
                    fontWeight: 700,
                    padding: '2px 6px',
                    minWidth: 20,
                    textAlign: 'center',
                  }}
                >
                  {item.badge > 99 ? '99+' : item.badge}
                </span>
              )}
            </NavLink>
          </motion.div>
        ))}
      </nav>

      {/* Bottom */}
      <div
        style={{
          padding: '16px 24px',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--muted)',
            fontSize: '0.8rem',
            fontWeight: 600,
            letterSpacing: '0.5px',
            textTransform: 'uppercase',
            padding: '6px 0',
          }}
        >
          {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
          {theme === 'light' ? 'Dark Mode' : 'Light Mode'}
        </button>

        {/* User info */}
        {auth.user && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 700 }}>{auth.user.name}</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>
              {auth.user.role?.replace('_', ' ')}
            </div>
          </div>
        )}

        <button
          onClick={handleLogout}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--danger)',
            fontSize: '0.8rem',
            fontWeight: 700,
            letterSpacing: '1px',
            textTransform: 'uppercase',
            padding: '6px 0',
          }}
        >
          <LogOut size={14} />
          Logout
        </button>
      </div>
    </motion.div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <div className="desktop-sidebar">
        <SidebarContent />
      </div>

      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(true)}
        style={{
          position: 'fixed',
          top: 16,
          left: 16,
          zIndex: 200,
          background: 'var(--accent)',
          color: 'var(--bg)',
          border: 'none',
          padding: '10px',
          cursor: 'pointer',
          display: 'none',
        }}
        className="mobile-menu-btn"
      >
        <Menu size={20} />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 99,
            display: 'none',
          }}
          className="mobile-overlay"
        />
      )}

      {mobileOpen && (
        <div className="mobile-sidebar">
          <SidebarContent />
        </div>
      )}

      <style>{`
        @media (max-width: 768px) {
          .desktop-sidebar { display: none; }
          .mobile-menu-btn { display: flex !important; }
          .mobile-overlay { display: block !important; }
          .mobile-sidebar { display: block; }
          .mobile-close-btn { display: flex !important; }
        }
        @media (min-width: 769px) {
          .mobile-sidebar { display: none; }
          .mobile-menu-btn { display: none !important; }
        }
      `}</style>
    </>
  );
}
