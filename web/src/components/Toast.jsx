import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, AlertCircle, AlertTriangle, X } from 'lucide-react';
import { useStore } from '../lib/store';

const icons = {
  success: <CheckCircle2 size={16} color="var(--success)" />,
  error: <AlertCircle size={16} color="var(--danger)" />,
  warning: <AlertTriangle size={16} color="var(--warning)" />,
};

export default function Toast() {
  const { toasts, removeToast } = useStore();

  return (
    <div className="toast-container">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            className={`toast toast-${t.type}`}
            initial={{ opacity: 0, x: 100 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 100 }}
            transition={{ duration: 0.25 }}
          >
            {icons[t.type] || icons.success}
            <span style={{ flex: 1 }}>{t.message}</span>
            <button
              onClick={() => removeToast(t.id)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--muted)',
                padding: 0,
                display: 'flex',
              }}
            >
              <X size={14} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
