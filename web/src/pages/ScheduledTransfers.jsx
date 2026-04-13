import React, { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Plus, Pause, Play, Trash2 } from 'lucide-react';
import { useStore } from '../lib/store';
import api from '../lib/api';
import { formatCurrency, formatDate } from '../lib/utils';
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

const createSchema = z.object({
  fromCostCenterId: z.string().min(1, 'Required'),
  toCostCenterId: z.string().min(1, 'Required'),
  amount: z.string().refine((v) => parseFloat(v) > 0, 'Must be positive'),
  description: z.string().min(1, 'Required'),
  frequency: z.enum(['daily', 'weekly', 'monthly']),
  nextRunAt: z.string().min(1, 'Required'),
});

export default function ScheduledTransfers() {
  const { addToast } = useStore();
  const [transfers, setTransfers] = useState([]);
  const [costCenters, setCostCenters] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [createModal, setCreateModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    resolver: zodResolver(createSchema),
    defaultValues: { frequency: 'monthly' },
  });

  const fetchData = useCallback(async () => {
    try {
      const [stRes, ccRes] = await Promise.all([
        api.get('/scheduled-transfers'),
        api.get('/cost-centers'),
      ]);
      setTransfers(stRes.data.data || stRes.data || []);
      setCostCenters(ccRes.data.data || ccRes.data || []);
    } catch {
      addToast('Failed to load scheduled transfers', 'error');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const onCreate = async (data) => {
    setIsSubmitting(true);
    try {
      await api.post('/scheduled-transfers', {
        fromCostCenterId: data.fromCostCenterId,
        toCostCenterId: data.toCostCenterId,
        amount: parseFloat(data.amount),
        description: data.description,
        frequency: data.frequency,
        nextRunAt: data.nextRunAt,
      });
      addToast('Scheduled transfer created');
      setCreateModal(false);
      reset();
      fetchData();
    } catch (e) {
      addToast(e.response?.data?.error || 'Failed to create', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleActive = async (transfer) => {
    try {
      await api.patch(`/scheduled-transfers/${transfer.id}`, { isActive: !transfer.isActive });
      addToast(transfer.isActive ? 'Paused' : 'Resumed');
      fetchData();
    } catch (e) {
      addToast(e.response?.data?.error || 'Failed to update', 'error');
    }
  };

  const onDelete = async () => {
    setIsSubmitting(true);
    try {
      await api.delete(`/scheduled-transfers/${deleteTarget.id}`);
      addToast('Deleted');
      setDeleteTarget(null);
      fetchData();
    } catch (e) {
      addToast(e.response?.data?.error || 'Failed to delete', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const columns = [
    {
      key: 'fromCostCenter', label: 'From',
      render: (v) => v?.name || '—',
    },
    {
      key: 'toCostCenter', label: 'To',
      render: (v) => v?.name || '—',
    },
    {
      key: 'amount', label: 'Amount', align: 'right',
      render: (v) => <span className="amount">{formatCurrency(v)}</span>,
    },
    { key: 'description', label: 'Description' },
    {
      key: 'frequency', label: 'Frequency',
      render: (v) => <span className="badge badge-muted">{v}</span>,
    },
    {
      key: 'nextRunAt', label: 'Next Run',
      render: (v) => formatDate(v),
    },
    {
      key: 'isActive', label: 'Status',
      render: (v) => (
        <span className={`badge ${v ? 'badge-success' : 'badge-muted'}`}>
          {v ? 'Active' : 'Paused'}
        </span>
      ),
    },
    {
      key: 'actions', label: '', sortable: false,
      render: (_, row) => (
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); toggleActive(row); }}>
            {row.isActive ? <Pause size={12} /> : <Play size={12} />}
          </button>
          <button className="btn btn-danger btn-sm" onClick={(e) => { e.stopPropagation(); setDeleteTarget(row); }}>
            <Trash2 size={12} />
          </button>
        </div>
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
        <h1 className="page-title">Scheduled Transfers</h1>
        <button className="btn" onClick={() => setCreateModal(true)}>
          <Plus size={14} /> New Schedule
        </button>
      </div>

      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 48 }} />)}
        </div>
      ) : (
        <Table columns={columns} data={transfers} emptyMessage="No scheduled transfers." />
      )}

      {/* Create Modal */}
      <Modal isOpen={createModal} onClose={() => { setCreateModal(false); reset(); }} title="New Scheduled Transfer">
        <form onSubmit={handleSubmit(onCreate)}>
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
          </div>

          <div className="input-group">
            <label className="input-label">Description</label>
            <input className={`input-field ${errors.description ? 'error' : ''}`} {...register('description')} placeholder="Monthly allocation" />
            {errors.description && <span className="input-error">{errors.description.message}</span>}
          </div>

          <div className="input-group">
            <label className="input-label">Frequency</label>
            <select className="input-field" {...register('frequency')}>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>

          <div className="input-group">
            <label className="input-label">First Run Date</label>
            <input className={`input-field ${errors.nextRunAt ? 'error' : ''}`} type="datetime-local" {...register('nextRunAt')} />
            {errors.nextRunAt && <span className="input-error">{errors.nextRunAt.message}</span>}
          </div>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-ghost" onClick={() => { setCreateModal(false); reset(); }}>Cancel</button>
            <button type="submit" className="btn" disabled={isSubmitting}>{isSubmitting ? 'Creating...' : 'Create Schedule'}</button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirm */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={onDelete}
        title="Delete Scheduled Transfer"
        message={`Delete the scheduled transfer "${deleteTarget?.description}"? This cannot be undone.`}
        confirmLabel="Delete"
        isDanger
        isLoading={isSubmitting}
      />
    </motion.div>
  );
}
