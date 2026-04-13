import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useStore } from '../lib/store';
import api from '../lib/api';
import { formatCurrency, formatDate, getStatusBadgeClass } from '../lib/utils';
import Table from '../components/Table';

const pageVariants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0 },
};

export default function Transactions() {
  const { addToast } = useStore();
  const [transactions, setTransactions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('');
  const [ccFilter, setCcFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [costCenters, setCostCenters] = useState([]);

  const fetchTransactions = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (typeFilter) params.set('type', typeFilter);
      if (ccFilter) params.set('costCenterId', ccFilter);
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      params.set('limit', '100');

      const res = await api.get(`/transactions?${params}`);
      setTransactions(res.data.data || res.data || []);
    } catch (e) {
      addToast('Failed to load transactions', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchCostCenters = async () => {
    try {
      const res = await api.get('/cost-centers');
      setCostCenters(res.data.data || res.data || []);
    } catch {}
  };

  useEffect(() => {
    fetchCostCenters();
  }, []);

  useEffect(() => {
    fetchTransactions();
  }, [typeFilter, ccFilter, startDate, endDate]);

  const columns = [
    { key: 'date', label: 'Date', render: (v) => formatDate(v) },
    { key: 'description', label: 'Description' },
    { key: 'type', label: 'Type', render: (v) => <span className="badge badge-muted">{v}</span> },
    { key: 'costCenter', label: 'Cost Center', render: (v, row) => row.costCenter?.name || '—' },
    { key: 'reference', label: 'Reference', render: (v) => v || '—' },
    {
      key: 'amount', label: 'Amount', isAmount: true, align: 'right',
      render: (v) => (
        <span className="amount" style={{ color: parseFloat(v) < 0 ? 'var(--danger)' : 'var(--success)' }}>
          {formatCurrency(v)}
        </span>
      ),
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
        <h1 className="page-title">Transactions</h1>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ minWidth: 160 }}>
          <div className="input-label" style={{ marginBottom: 4 }}>Type</div>
          <select className="input-field" style={{ marginBottom: 0 }} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="">All Types</option>
            <option value="TOPUP">Top Up</option>
            <option value="TRANSFER">Transfer</option>
            <option value="PAYMENT">Payment</option>
            <option value="ADJUSTMENT">Adjustment</option>
          </select>
        </div>

        <div style={{ minWidth: 200 }}>
          <div className="input-label" style={{ marginBottom: 4 }}>Cost Center</div>
          <select className="input-field" style={{ marginBottom: 0 }} value={ccFilter} onChange={(e) => setCcFilter(e.target.value)}>
            <option value="">All Cost Centers</option>
            {costCenters.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div>
          <div className="input-label" style={{ marginBottom: 4 }}>From</div>
          <input
            type="date"
            className="input-field"
            style={{ marginBottom: 0, width: 140 }}
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>

        <div>
          <div className="input-label" style={{ marginBottom: 4 }}>To</div>
          <input
            type="date"
            className="input-field"
            style={{ marginBottom: 0, width: 140 }}
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>

        <button
          className="btn btn-ghost btn-sm"
          onClick={() => { setTypeFilter(''); setCcFilter(''); setStartDate(''); setEndDate(''); }}
        >
          Clear Filters
        </button>
      </div>

      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[1, 2, 3, 4, 5].map((i) => <div key={i} className="skeleton" style={{ height: 48 }} />)}
        </div>
      ) : (
        <Table columns={columns} data={transactions} emptyMessage="No transactions found." />
      )}
    </motion.div>
  );
}
