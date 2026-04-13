import React from 'react';
import Modal from './Modal';
import { formatCurrency } from '../lib/utils';

export default function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirm Action',
  message,
  amount,
  currency = 'ZAR',
  confirmLabel = 'Confirm',
  isDanger = false,
  isLoading = false,
}) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      {message && (
        <p style={{ color: 'var(--muted)', marginBottom: 24, fontSize: '0.9rem' }}>{message}</p>
      )}
      {amount !== undefined && (
        <div
          style={{
            textAlign: 'center',
            padding: '32px 0',
            borderTop: '1px solid var(--border)',
            borderBottom: '1px solid var(--border)',
            marginBottom: 24,
          }}
        >
          <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '2px', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 8 }}>
            Amount
          </div>
          <div
            className="amount"
            style={{ fontSize: '2.5rem', fontWeight: 700, letterSpacing: '-1px' }}
          >
            {formatCurrency(amount, currency)}
          </div>
        </div>
      )}
      <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost" onClick={onClose} disabled={isLoading}>
          Cancel
        </button>
        <button
          className={`btn ${isDanger ? 'btn-danger' : ''}`}
          onClick={onConfirm}
          disabled={isLoading}
        >
          {isLoading ? 'Processing...' : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
