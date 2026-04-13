import { create } from 'zustand';
import api from './api';

export const useStore = create((set, get) => ({
  // Auth
  auth: {
    user: null,
    isLoading: true,
  },
  login: async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    set((state) => ({ auth: { ...state.auth, user: res.data.user } }));
    return res.data.user;
  },
  logout: async () => {
    await api.post('/auth/logout').catch(() => {});
    set((state) => ({ auth: { ...state.auth, user: null } }));
    window.location.href = '/login';
  },
  fetchMe: async () => {
    try {
      const res = await api.get('/auth/me');
      set((state) => ({ auth: { user: res.data, isLoading: false } }));
      return res.data;
    } catch {
      set((state) => ({ auth: { ...state.auth, user: null, isLoading: false } }));
      return null;
    }
  },

  // Theme
  theme: typeof window !== 'undefined'
    ? (localStorage.getItem('theme') || 'light')
    : 'light',
  toggleTheme: () => {
    const next = get().theme === 'light' ? 'dark' : 'light';
    localStorage.setItem('theme', next);
    document.documentElement.setAttribute('data-theme', next);
    set({ theme: next });
  },

  // Toasts
  toasts: [],
  addToast: (message, type = 'success') => {
    const id = Date.now() + Math.random();
    set((state) => ({ toasts: [...state.toasts, { id, message, type }] }));
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
    }, 4000);
  },
  removeToast: (id) => {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
  },

  // Notifications
  notifications: {
    pendingPayments: 0,
    pendingRequests: 0,
  },
  fetchNotifications: async () => {
    try {
      const [payments, requests] = await Promise.all([
        api.get('/payments?status=pending&limit=1').catch(() => ({ data: { total: 0 } })),
        api.get('/fund-requests?status=pending&limit=1').catch(() => ({ data: { total: 0 } })),
      ]);
      set({
        notifications: {
          pendingPayments: payments.data.total || 0,
          pendingRequests: requests.data.total || 0,
        },
      });
    } catch {
      // silent fail
    }
  },
}));
