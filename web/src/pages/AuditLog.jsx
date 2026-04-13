import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useStore } from '../lib/store';
import api from '../lib/api';
import { formatDate } from '../lib/utils';
import Table from '../components/Table';

const pageVariants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0 },
};

export default function AuditLog() {
  const { addToast } = useStore();
  const [logs, setLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (actionFilter) params.set('action', actionFilter);
      if (userFilter) params.set('userId', userFilter);
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      params.set('limit', '200');

      const res = await api.get(`/audit-log?${params}`);
      setLogs(res.data.data || res.data || []);
    } catch (e) {
      addToast('Failed to load audit log', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchLogs(); }, [actionFilter, userFilter, startDate, endDate]);

  const columns = [
    { key: 'createdAt', label: 'Timestamp', render: (v) => formatDate(v) },
    { key: 'action', label: 'Action', render: (v) => <span className="badge badge-muted">{v}</span> },
    { key: 'actor', label: 'Actor', render: (v, row) => row.actor?.name || row.actorId || '—' },
    { key: 'entity', label: 'Entity', render: (v, row) => `${row.entityType || ''} ${row.entityId || ''}`.trim() || '—' },
    {
      key: 'details', label: 'Details',
      render: (v) => v ? (
        <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--muted)' }}>
          {typeof v === 'string' ? v : JSON.stringify(v).slice(0, 80)}
        </span>
      ) : '—',
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
        <h1 className="page-title">Audit Log</h1>
        <span style={{ fontSize: '0.75rem', color: 'var(--muted)', fontWeight: 600, letterSpacing: '1px' }}>
          IMMUTABLE TRAIL
        </span>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ minWidth: 180 }}>
          <div className="input-label" style={{ marginBottom: 4 }}>Action</div>
          <input
            className="input-field"
            style={{ marginBottom: 0, width: '100%' }}
            placeholder="e.g. CREATE_PAYMENT"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
          />
        </div>
        <div>
          <div className="input-label" style={{ marginBottom: 4 }}>From</div>
          <input type="date" className="input-field" style={{ marginBottom: 0, width: 140 }} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div>
          <div className="input-label" style={{ marginBottom: 4 }}>To</div>
          <input type="date" className="input-field" style={{ marginBottom: 0, width: 140 }} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => { setActionFilter(''); setUserFilter(''); setStartDate(''); setEndDate(''); }}>
          Clear
        </button>
      </div>

      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[1, 2, 3, 4, 5].map((i) => <div key={i} className="skeleton" style={{ height: 48 }} />)}
        </div>
      ) : (
        <Table columns={columns} data={logs} emptyMessage="No audit entries found." />
      )}
    </motion.div>
  );
}
