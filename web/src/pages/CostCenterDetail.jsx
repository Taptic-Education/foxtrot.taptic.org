import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Plus, UserPlus } from 'lucide-react';
import { useStore } from '../lib/store';
import api from '../lib/api';
import { formatCurrency, formatDate, getStatusBadgeClass } from '../lib/utils';
import Table from '../components/Table';
import AmountDisplay from '../components/AmountDisplay';
import Modal from '../components/Modal';
import { useForm } from 'react-hook-form';

const pageVariants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0 },
};

export default function CostCenterDetail() {
  const { id } = useParams();
  const { auth, addToast } = useStore();
  const navigate = useNavigate();
  const [cc, setCc] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [addOwnerModal, setAddOwnerModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [typeFilter, setTypeFilter] = useState('');
  const [users, setUsers] = useState([]);

  const { register, handleSubmit, reset } = useForm();

  const fetchData = async () => {
    try {
      const [ccRes, txRes] = await Promise.all([
        api.get(`/cost-centers/${id}`),
        api.get(`/cost-centers/${id}/transactions?limit=50`),
      ]);
      setCc(ccRes.data);
      const rawTx = txRes.data.data || txRes.data || [];
      setTransactions(rawTx.map(t => ({
        ...t,
        date: t.createdAt,
        costCenter: t.fromCostCenter || t.toCostCenter,
      })));
    } catch (e) {
      addToast('Failed to load cost center', 'error');
      navigate('/cost-centers');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await api.get('/users');
      setUsers(res.data.data || res.data || []);
    } catch {}
  };

  useEffect(() => {
    fetchData();
    if (auth.user?.role === 'super_admin') fetchUsers();
  }, [id]);

  const onAddOwner = async (data) => {
    setIsSubmitting(true);
    try {
      await api.post(`/cost-centers/${id}/owners`, { userId: data.userId });
      addToast('Owner added');
      setAddOwnerModal(false);
      reset();
      fetchData();
    } catch (e) {
      addToast(e.response?.data?.error || 'Failed to add owner', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const txColumns = [
    { key: 'date', label: 'Date', render: (v) => formatDate(v) },
    { key: 'description', label: 'Description' },
    { key: 'type', label: 'Type', render: (v) => <span className="badge badge-muted">{v}</span> },
    { key: 'reference', label: 'Reference' },
    {
      key: 'amount', label: 'Amount', isAmount: true, align: 'right',
      render: (v) => (
        <span className="amount" style={{ color: parseFloat(v) < 0 ? 'var(--danger)' : 'inherit' }}>
          {formatCurrency(v)}
        </span>
      ),
    },
  ];

  const filtered = typeFilter ? transactions.filter((t) => t.type === typeFilter) : transactions;

  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {[1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 80 }} />)}
      </div>
    );
  }

  return (
    <motion.div
      initial="initial"
      animate="animate"
      exit="exit"
      variants={pageVariants}
      transition={{ duration: 0.4 }}
    >
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => navigate('/cost-centers')}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <ArrowLeft size={14} />
          </button>
          <h1 className="page-title">{cc?.name}</h1>
          {cc?.status && (
            <span className={`badge ${getStatusBadgeClass(cc.status)}`}>{cc.status}</span>
          )}
        </div>
        {auth.user?.role === 'super_admin' && (
          <button className="btn" onClick={() => setAddOwnerModal(true)}>
            <UserPlus size={14} /> Add Owner
          </button>
        )}
      </div>

      {/* Balance + info */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 32 }}>
        <div className="card">
          <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8 }}>
            Balance
          </div>
          <AmountDisplay amount={cc?.balance || 0} style={{ fontSize: '2rem', fontWeight: 700 }} />
        </div>

        {cc?.description && (
          <div className="card">
            <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8 }}>
              Description
            </div>
            <div style={{ fontSize: '0.9rem' }}>{cc.description}</div>
          </div>
        )}

        <div className="card">
          <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8 }}>
            Owners
          </div>
          {cc?.owners?.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {cc.owners.map((o) => (
                <div key={o.id} style={{ fontSize: '0.875rem', fontWeight: 600 }}>{o.user?.name || o.name}</div>
              ))}
            </div>
          ) : (
            <div style={{ color: 'var(--muted)', fontSize: '0.875rem' }}>No owners assigned</div>
          )}
        </div>
      </div>

      {/* Transaction filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
        <span style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--muted)' }}>
          Transactions
        </span>
        <select
          className="input-field"
          style={{ width: 160, marginBottom: 0 }}
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
        >
          <option value="">All Types</option>
          <option value="top_up">Top Up</option>
          <option value="transfer">Transfer</option>
          <option value="payment">Payment</option>
          <option value="adjustment">Adjustment</option>
        </select>
      </div>

      <Table columns={txColumns} data={filtered} emptyMessage="No transactions found." />

      {/* Add Owner Modal */}
      <Modal isOpen={addOwnerModal} onClose={() => { setAddOwnerModal(false); reset(); }} title="Add Owner">
        <form onSubmit={handleSubmit(onAddOwner)}>
          <div className="input-group">
            <label className="input-label">User</label>
            <select className="input-field" {...register('userId', { required: true })}>
              <option value="">Select user...</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-ghost" onClick={() => { setAddOwnerModal(false); reset(); }}>Cancel</button>
            <button type="submit" className="btn" disabled={isSubmitting}>{isSubmitting ? 'Adding...' : 'Add Owner'}</button>
          </div>
        </form>
      </Modal>
    </motion.div>
  );
}
