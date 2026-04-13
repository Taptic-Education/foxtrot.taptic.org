import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid,
} from 'recharts';
import { RefreshCw, Plus, ArrowLeftRight, TrendingUp } from 'lucide-react';
import { useStore } from '../lib/store';
import api from '../lib/api';
import { formatCurrency, formatRelativeDate, formatDate, getStatusBadgeClass } from '../lib/utils';
import AmountDisplay from '../components/AmountDisplay';
import Table from '../components/Table';
import Modal from '../components/Modal';
import ConfirmModal from '../components/ConfirmModal';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const pageVariants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0 },
};

// ---- Super Admin Dashboard ----
function SuperAdminDashboard() {
  const { auth, addToast } = useStore();
  const [summary, setSummary] = useState(null);
  const [recentTx, setRecentTx] = useState([]);
  const [costCenters, setCostCenters] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [topUpModal, setTopUpModal] = useState(false);
  const [transferModal, setTransferModal] = useState(false);
  const [confirmTopUp, setConfirmTopUp] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [sumRes, txRes, ccRes] = await Promise.all([
        api.get('/dashboard/summary').catch(() => ({ data: {} })),
        api.get('/transactions?limit=20').catch(() => ({ data: { data: [] } })),
        api.get('/cost-centers').catch(() => ({ data: { data: [] } })),
      ]);
      setSummary(sumRes.data);
      setRecentTx(txRes.data.data || txRes.data || []);
      setCostCenters(ccRes.data.data || ccRes.data || []);
      setLastRefresh(new Date());
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const txColumns = [
    { key: 'date', label: 'Date', render: (v) => formatDate(v) },
    { key: 'description', label: 'Description' },
    { key: 'type', label: 'Type', render: (v) => <span className={`badge badge-muted`}>{v}</span> },
    { key: 'costCenter', label: 'Cost Center', render: (v, row) => row.costCenter?.name || '—' },
    {
      key: 'amount', label: 'Amount', isAmount: true, align: 'right',
      render: (v, row) => (
        <span className="amount" style={{ color: parseFloat(v) < 0 ? 'var(--danger)' : 'inherit' }}>
          {formatCurrency(v)}
        </span>
      ),
    },
  ];

  const summaryCards = [
    { label: 'Total Balance', value: summary?.totalBalance, color: 'var(--text)' },
    { label: 'Main Fund', value: summary?.mainFundBalance, color: 'var(--text)' },
    { label: 'Pending Payments', value: summary?.pendingPayments, color: 'var(--warning)' },
    { label: "This Month's Spend", value: summary?.monthlySpend, color: 'var(--danger)' },
  ];

  return (
    <div>
      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 32 }}>
        {summaryCards.map((card, i) => (
          <motion.div
            key={card.label}
            className="card"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07 }}
          >
            <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 12 }}>
              {card.label}
            </div>
            <div style={{ color: card.color }}>
              {isLoading ? (
                <div className="skeleton" style={{ height: 32, width: 140 }} />
              ) : (
                <AmountDisplay amount={card.value || 0} style={{ fontSize: '1.75rem', fontWeight: 700 }} />
              )}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Quick actions */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 32 }}>
        <button className="btn" onClick={() => setTopUpModal(true)}>
          <Plus size={14} /> Top Up Main Fund
        </button>
        <button className="btn btn-ghost" onClick={() => setTransferModal(true)}>
          <ArrowLeftRight size={14} /> New Transfer
        </button>
        <button
          className="btn btn-ghost"
          onClick={() => { setIsLoading(true); fetchData(); }}
          style={{ marginLeft: 'auto' }}
        >
          <RefreshCw size={14} />
          <span style={{ fontSize: '0.7rem', color: 'var(--muted)', marginLeft: 4 }}>
            {formatRelativeDate(lastRefresh)}
          </span>
        </button>
      </div>

      {/* Cost center spend charts */}
      {costCenters.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <h3 style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 16, color: 'var(--muted)' }}>
            Cost Center Balances
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
            {costCenters.slice(0, 6).map((cc) => (
              <div key={cc.id} className="card" style={{ padding: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 2 }}>{cc.name}</div>
                    <span className={`badge ${getStatusBadgeClass(cc.status)}`}>{cc.status}</span>
                  </div>
                  <div className="amount" style={{ fontSize: '1rem', fontWeight: 700 }}>
                    {formatCurrency(cc.balance || 0)}
                  </div>
                </div>
                {cc.monthlySpend && (
                  <ResponsiveContainer width="100%" height={50}>
                    <LineChart data={cc.monthlySpend}>
                      <Line type="monotone" dataKey="amount" stroke="var(--accent)" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent transactions */}
      <div>
        <h3 style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 16, color: 'var(--muted)' }}>
          Recent Activity
        </h3>
        <Table columns={txColumns} data={recentTx} emptyMessage="No recent transactions." />
      </div>

      {/* Top Up Modal */}
      <TopUpModal
        isOpen={topUpModal}
        onClose={() => setTopUpModal(false)}
        onSuccess={() => { fetchData(); addToast('Main fund topped up successfully'); }}
      />

      {/* Transfer Modal */}
      <TransferModal
        isOpen={transferModal}
        costCenters={costCenters}
        onClose={() => setTransferModal(false)}
        onSuccess={() => { fetchData(); addToast('Transfer completed'); }}
      />
    </div>
  );
}

// ---- Cost Center Owner Dashboard ----
function OwnerDashboard() {
  const { auth, addToast } = useStore();
  const [costCenters, setCostCenters] = useState([]);
  const [recentTx, setRecentTx] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [paymentModal, setPaymentModal] = useState(false);
  const [transferModal, setTransferModal] = useState(false);
  const [requestModal, setRequestModal] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [ccRes, txRes] = await Promise.all([
        api.get('/cost-centers/mine').catch(() => api.get('/cost-centers')),
        api.get('/transactions?limit=20').catch(() => ({ data: { data: [] } })),
      ]);
      setCostCenters(ccRes.data.data || ccRes.data || []);
      setRecentTx(txRes.data.data || txRes.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const txColumns = [
    { key: 'date', label: 'Date', render: (v) => formatDate(v) },
    { key: 'description', label: 'Description' },
    { key: 'type', label: 'Type', render: (v) => <span className="badge badge-muted">{v}</span> },
    {
      key: 'amount', label: 'Amount', isAmount: true, align: 'right',
      render: (v) => (
        <span className="amount" style={{ color: parseFloat(v) < 0 ? 'var(--danger)' : 'inherit' }}>
          {formatCurrency(v)}
        </span>
      ),
    },
  ];

  // Monthly spend data (mock shape)
  const monthlyData = recentTx
    .filter((t) => t.type === 'PAYMENT')
    .slice(0, 6)
    .map((t, i) => ({ name: `M${i + 1}`, amount: Math.abs(parseFloat(t.amount) || 0) }));

  return (
    <div>
      {/* Cost center balance cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16, marginBottom: 32 }}>
        {isLoading
          ? [1, 2, 3].map((i) => (
              <div key={i} className="card">
                <div className="skeleton" style={{ height: 14, width: 120, marginBottom: 12 }} />
                <div className="skeleton" style={{ height: 32, width: 160 }} />
              </div>
            ))
          : costCenters.map((cc, i) => (
              <motion.div
                key={cc.id}
                className="card"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.07 }}
              >
                <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8 }}>
                  {cc.name}
                </div>
                <AmountDisplay amount={cc.balance || 0} style={{ fontSize: '1.75rem', fontWeight: 700 }} />
                <div style={{ marginTop: 8 }}>
                  <span className={`badge ${getStatusBadgeClass(cc.status)}`}>{cc.status}</span>
                </div>
              </motion.div>
            ))}
      </div>

      {/* Quick actions */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 32, flexWrap: 'wrap' }}>
        <button className="btn" onClick={() => setPaymentModal(true)}>
          <Plus size={14} /> Record Payment
        </button>
        <button className="btn btn-ghost" onClick={() => setTransferModal(true)}>
          <ArrowLeftRight size={14} /> Transfer Funds
        </button>
        <button className="btn btn-ghost" onClick={() => setRequestModal(true)}>
          <TrendingUp size={14} /> Request Funds
        </button>
      </div>

      {/* Monthly spend chart */}
      {monthlyData.length > 0 && (
        <div className="card" style={{ marginBottom: 32 }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 16 }}>
            Recent Spend
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={monthlyData}>
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 0 }}
                formatter={(v) => formatCurrency(v)}
              />
              <Bar dataKey="amount" fill="var(--accent)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Recent transactions */}
      <div>
        <h3 style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 16, color: 'var(--muted)' }}>
          Recent Transactions
        </h3>
        <Table columns={txColumns} data={recentTx} emptyMessage="No recent transactions." />
      </div>

      <RecordPaymentModal
        isOpen={paymentModal}
        costCenters={costCenters}
        onClose={() => setPaymentModal(false)}
        onSuccess={() => { fetchData(); addToast('Payment recorded'); }}
      />
      <TransferModal
        isOpen={transferModal}
        costCenters={costCenters}
        onClose={() => setTransferModal(false)}
        onSuccess={() => { fetchData(); addToast('Transfer completed'); }}
      />
      <RequestFundsModal
        isOpen={requestModal}
        costCenters={costCenters}
        onClose={() => setRequestModal(false)}
        onSuccess={() => { fetchData(); addToast('Fund request submitted'); }}
      />
    </div>
  );
}

// ---- Modals ----
function TopUpModal({ isOpen, onClose, onSuccess }) {
  const [step, setStep] = useState(1);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { addToast } = useStore();

  const handleConfirm = async () => {
    setIsLoading(true);
    try {
      await api.post('/transactions/top-up', { amount: parseFloat(amount), description });
      onSuccess();
      onClose();
      setStep(1);
      setAmount('');
    } catch (e) {
      addToast(e.response?.data?.error || 'Failed to top up', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Top Up Main Fund">
      {step === 1 ? (
        <div>
          <div className="input-group">
            <label className="input-label">Amount</label>
            <input
              className="input-field"
              type="number"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              autoFocus
            />
          </div>
          <div className="input-group">
            <label className="input-label">Description</label>
            <input
              className="input-field"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Monthly allocation"
            />
          </div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn" onClick={() => setStep(2)} disabled={!amount || parseFloat(amount) <= 0}>
              Review →
            </button>
          </div>
        </div>
      ) : (
        <ConfirmModal
          isOpen={true}
          onClose={() => setStep(1)}
          onConfirm={handleConfirm}
          title="Confirm Top Up"
          message={description || 'Top up main fund'}
          amount={amount}
          confirmLabel="Confirm Top Up"
          isLoading={isLoading}
        />
      )}
    </Modal>
  );
}

const transferSchema = z.object({
  fromCostCenterId: z.string().min(1, 'Required'),
  toCostCenterId: z.string().min(1, 'Required'),
  amount: z.string().refine((v) => parseFloat(v) > 0, 'Amount must be positive'),
  description: z.string().optional(),
});

function TransferModal({ isOpen, costCenters, onClose, onSuccess }) {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const { addToast } = useStore();

  const { register, handleSubmit, watch, formState: { errors }, reset } = useForm({
    resolver: zodResolver(transferSchema),
  });

  const fromId = watch('fromCostCenterId');
  const fromCC = costCenters.find((c) => c.id === fromId);

  const onStep1 = (data) => {
    const fromBalance = parseFloat(fromCC?.balance || 0);
    if (parseFloat(data.amount) > fromBalance) {
      addToast('Amount exceeds available balance', 'error');
      return;
    }
    setFormData(data);
    setStep(2);
  };

  const handleConfirm = async () => {
    setIsLoading(true);
    try {
      await api.post('/transactions/transfer', {
        fromCostCenterId: formData.fromCostCenterId,
        toCostCenterId: formData.toCostCenterId,
        amount: parseFloat(formData.amount),
        description: formData.description,
      });
      onSuccess();
      onClose();
      setStep(1);
      reset();
    } catch (e) {
      addToast(e.response?.data?.error || 'Transfer failed', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Transfer Funds">
      {step === 1 ? (
        <form onSubmit={handleSubmit(onStep1)}>
          <div className="input-group">
            <label className="input-label">From Cost Center</label>
            <select className="input-field" {...register('fromCostCenterId')}>
              <option value="">Select...</option>
              {costCenters.map((c) => (
                <option key={c.id} value={c.id}>{c.name} ({formatCurrency(c.balance || 0)})</option>
              ))}
            </select>
            {errors.fromCostCenterId && <span className="input-error">{errors.fromCostCenterId.message}</span>}
          </div>

          <div className="input-group">
            <label className="input-label">To Cost Center</label>
            <select className="input-field" {...register('toCostCenterId')}>
              <option value="">Select...</option>
              {costCenters.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {errors.toCostCenterId && <span className="input-error">{errors.toCostCenterId.message}</span>}
          </div>

          <div className="input-group">
            <label className="input-label">Amount</label>
            <input className={`input-field ${errors.amount ? 'error' : ''}`} type="number" step="0.01" min="0.01" {...register('amount')} placeholder="0.00" />
            {errors.amount && <span className="input-error">{errors.amount.message}</span>}
            {fromCC && <span style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: 4 }}>Available: {formatCurrency(fromCC.balance || 0)}</span>}
          </div>

          <div className="input-group">
            <label className="input-label">Description (optional)</label>
            <input className="input-field" {...register('description')} placeholder="Reason for transfer" />
          </div>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn">Review →</button>
          </div>
        </form>
      ) : (
        <div>
          <div style={{ textAlign: 'center', padding: '32px 0', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', marginBottom: 24 }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '2px', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 8 }}>Transfer Amount</div>
            <div className="amount" style={{ fontSize: '2.5rem', fontWeight: 700 }}>{formatCurrency(formData.amount)}</div>
            <div style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: 12 }}>
              {costCenters.find(c => c.id === formData.fromCostCenterId)?.name} → {costCenters.find(c => c.id === formData.toCostCenterId)?.name}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost" onClick={() => setStep(1)} disabled={isLoading}>← Edit</button>
            <button className="btn" onClick={handleConfirm} disabled={isLoading}>{isLoading ? 'Processing...' : 'Confirm Transfer'}</button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function RecordPaymentModal({ isOpen, costCenters, onClose, onSuccess }) {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const { addToast } = useStore();

  const { register, handleSubmit, watch, formState: { errors }, reset } = useForm();
  const ccId = watch('costCenterId');
  const cc = costCenters.find((c) => c.id === ccId);

  const onStep1 = (data) => {
    if (parseFloat(data.amount) > parseFloat(cc?.balance || 0)) {
      addToast('Amount exceeds available balance', 'error');
      return;
    }
    setFormData(data);
    setStep(2);
  };

  const handleConfirm = async () => {
    setIsLoading(true);
    try {
      await api.post('/payments', {
        costCenterId: formData.costCenterId,
        amount: parseFloat(formData.amount),
        description: formData.description,
        payee: formData.payee,
      });
      onSuccess();
      onClose();
      setStep(1);
      reset();
    } catch (e) {
      addToast(e.response?.data?.error || 'Failed to record payment', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Record Payment">
      {step === 1 ? (
        <form onSubmit={handleSubmit(onStep1)}>
          <div className="input-group">
            <label className="input-label">Cost Center</label>
            <select className="input-field" {...register('costCenterId', { required: true })}>
              <option value="">Select...</option>
              {costCenters.map((c) => (
                <option key={c.id} value={c.id}>{c.name} ({formatCurrency(c.balance || 0)})</option>
              ))}
            </select>
          </div>
          <div className="input-group">
            <label className="input-label">Payee</label>
            <input className="input-field" {...register('payee', { required: true })} placeholder="Vendor name" />
          </div>
          <div className="input-group">
            <label className="input-label">Amount</label>
            <input className="input-field" type="number" step="0.01" min="0.01" {...register('amount', { required: true })} placeholder="0.00" />
            {cc && <span style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: 4 }}>Available: {formatCurrency(cc.balance || 0)}</span>}
          </div>
          <div className="input-group">
            <label className="input-label">Description</label>
            <input className="input-field" {...register('description', { required: true })} placeholder="What is this payment for?" />
          </div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn">Review →</button>
          </div>
        </form>
      ) : (
        <div>
          <div style={{ textAlign: 'center', padding: '32px 0', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', marginBottom: 24 }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '2px', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 8 }}>Payment Amount</div>
            <div className="amount" style={{ fontSize: '2.5rem', fontWeight: 700 }}>{formatCurrency(formData?.amount)}</div>
            <div style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: 8 }}>To: {formData?.payee}</div>
          </div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost" onClick={() => setStep(1)} disabled={isLoading}>← Edit</button>
            <button className="btn" onClick={handleConfirm} disabled={isLoading}>{isLoading ? 'Processing...' : 'Confirm Payment'}</button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function RequestFundsModal({ isOpen, costCenters, onClose, onSuccess }) {
  const [isLoading, setIsLoading] = useState(false);
  const { addToast } = useStore();
  const { register, handleSubmit, reset, formState: { errors } } = useForm();

  const onSubmit = async (data) => {
    setIsLoading(true);
    try {
      await api.post('/fund-requests', {
        costCenterId: data.costCenterId,
        amount: parseFloat(data.amount),
        reason: data.reason,
      });
      onSuccess();
      onClose();
      reset();
    } catch (e) {
      addToast(e.response?.data?.error || 'Failed to submit request', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Request Funds">
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="input-group">
          <label className="input-label">Cost Center</label>
          <select className="input-field" {...register('costCenterId', { required: true })}>
            <option value="">Select...</option>
            {costCenters.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div className="input-group">
          <label className="input-label">Amount Requested</label>
          <input className="input-field" type="number" step="0.01" min="0.01" {...register('amount', { required: true })} placeholder="0.00" />
        </div>
        <div className="input-group">
          <label className="input-label">Reason</label>
          <textarea className="input-field" {...register('reason', { required: true })} placeholder="Explain why funds are needed..." />
        </div>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn" disabled={isLoading}>{isLoading ? 'Submitting...' : 'Submit Request'}</button>
        </div>
      </form>
    </Modal>
  );
}

// ---- Main Dashboard component ----
export default function Dashboard() {
  const { auth } = useStore();

  return (
    <motion.div
      initial="initial"
      animate="animate"
      exit="exit"
      variants={pageVariants}
      transition={{ duration: 0.4 }}
    >
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <div style={{ fontSize: '0.75rem', color: 'var(--muted)', fontWeight: 600, letterSpacing: '1px' }}>
          {auth.user?.name}
        </div>
      </div>

      {auth.user?.role === 'super_admin' ? <SuperAdminDashboard /> : <OwnerDashboard />}
    </motion.div>
  );
}
