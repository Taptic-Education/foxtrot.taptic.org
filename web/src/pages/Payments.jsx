import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { useStore } from '../lib/store';
import api from '../lib/api';
import { formatCurrency, formatDate, getStatusBadgeClass } from '../lib/utils';
import Table from '../components/Table';
import ConfirmModal from '../components/ConfirmModal';

const pageVariants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0 },
};

export default function Payments() {
  const { addToast, fetchNotifications } = useStore();
  const [payments, setPayments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [ccFilter, setCcFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [costCenters, setCostCenters] = useState([]);
  const [confirmPayment, setConfirmPayment] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchPayments = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (ccFilter) params.set('costCenterId', ccFilter);
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      params.set('limit', '100');

      const res = await api.get(`/payments?${params}`);
      setPayments(res.data.data || res.data || []);
    } catch (e) {
      addToast('Failed to load payments', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    api.get('/cost-centers').then((res) => setCostCenters(res.data.data || res.data || [])).catch(() => {});
  }, []);

  useEffect(() => { fetchPayments(); }, [statusFilter, ccFilter, startDate, endDate]);

  const markAsPaid = async () => {
    setIsSubmitting(true);
    try {
      await api.patch(`/payments/${confirmPayment.id}/paid`);
      addToast('Payment marked as paid');
      setConfirmPayment(null);
      fetchPayments();
      fetchNotifications();
    } catch (e) {
      addToast(e.response?.data?.error || 'Failed to update payment', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const columns = [
    { key: 'date', label: 'Date', render: (v) => formatDate(v) },
    { key: 'payee', label: 'Payee' },
    { key: 'description', label: 'Description' },
    { key: 'costCenter', label: 'Cost Center', render: (v, row) => row.costCenter?.name || '—' },
    {
      key: 'status', label: 'Status',
      render: (v) => <span className={`badge ${getStatusBadgeClass(v)}`}>{v}</span>,
    },
    {
      key: 'amount', label: 'Amount', isAmount: true, align: 'right',
      render: (v) => <span className="amount">{formatCurrency(v)}</span>,
    },
    {
      key: 'actions', label: '', sortable: false,
      render: (_, row) => row.status === 'PENDING' ? (
        <button
          className="btn btn-sm"
          onClick={(e) => { e.stopPropagation(); setConfirmPayment(row); }}
        >
          <Check size={12} /> Mark Paid
        </button>
      ) : null,
    },
  ];

  return (
    <motion.div
      initial="initial"
      animate="animate"
      exit="exit"
      variants={pageVariants}
      transition={{ duration: 0.4 }}
    >
      <div className="page-header">
        <h1 className="page-title">Payments Ledger</h1>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ minWidth: 160 }}>
          <div className="input-label" style={{ marginBottom: 4 }}>Status</div>
          <select className="input-field" style={{ marginBottom: 0 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All Statuses</option>
            <option value="PENDING">Pending</option>
            <option value="PAID">Paid</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>

        <div style={{ minWidth: 200 }}>
          <div className="input-label" style={{ marginBottom: 4 }}>Cost Center</div>
          <select className="input-field" style={{ marginBottom: 0 }} value={ccFilter} onChange={(e) => setCcFilter(e.target.value)}>
            <option value="">All</option>
            {costCenters.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div>
          <div className="input-label" style={{ marginBottom: 4 }}>From</div>
          <input type="date" className="input-field" style={{ marginBottom: 0, width: 140 }} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>

        <div>
          <div className="input-label" style={{ marginBottom: 4 }}>To</div>
          <input type="date" className="input-field" style={{ marginBottom: 0, width: 140 }} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>

        <button className="btn btn-ghost btn-sm" onClick={() => { setStatusFilter(''); setCcFilter(''); setStartDate(''); setEndDate(''); }}>
          Clear
        </button>
      </div>

      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 48 }} />)}
        </div>
      ) : (
        <Table columns={columns} data={payments} emptyMessage="No payments found." />
      )}

      <ConfirmModal
        isOpen={!!confirmPayment}
        onClose={() => setConfirmPayment(null)}
        onConfirm={markAsPaid}
        title="Confirm Payment"
        message={`Mark payment to ${confirmPayment?.payee} as paid?`}
        amount={confirmPayment?.amount}
        confirmLabel="Mark as Paid"
        isLoading={isSubmitting}
      />
    </motion.div>
  );
}
