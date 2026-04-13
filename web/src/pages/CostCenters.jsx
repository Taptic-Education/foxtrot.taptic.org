import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { useStore } from '../lib/store';
import api from '../lib/api';
import { formatCurrency, formatDate, getStatusBadgeClass } from '../lib/utils';
import Table from '../components/Table';
import Modal from '../components/Modal';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const pageVariants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0 },
};

const schema = z.object({
  name: z.string().min(2, 'Name is required'),
  description: z.string().optional(),
  currency: z.string().optional(),
});

export default function CostCenters() {
  const { auth, addToast } = useStore();
  const [costCenters, setCostCenters] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [createModal, setCreateModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();

  const { register, handleSubmit, formState: { errors }, reset } = useForm({
    resolver: zodResolver(schema),
  });

  const fetchCostCenters = async () => {
    try {
      const res = await api.get('/cost-centers');
      setCostCenters(res.data.data || res.data || []);
    } catch (e) {
      addToast('Failed to load cost centers', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchCostCenters(); }, []);

  const onSubmit = async (data) => {
    setIsSubmitting(true);
    try {
      await api.post('/cost-centers', data);
      addToast('Cost center created');
      setCreateModal(false);
      reset();
      fetchCostCenters();
    } catch (e) {
      addToast(e.response?.data?.error || 'Failed to create cost center', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const columns = [
    { key: 'name', label: 'Name' },
    {
      key: 'balance', label: 'Balance', isAmount: true, align: 'right',
      render: (v) => <span className="amount">{formatCurrency(v || 0)}</span>,
    },
    {
      key: 'status', label: 'Status',
      render: (v) => <span className={`badge ${getStatusBadgeClass(v)}`}>{v}</span>,
    },
    {
      key: 'owners', label: 'Owners',
      render: (v, row) => row._count?.owners || row.owners?.length || 0,
    },
    {
      key: 'createdAt', label: 'Created',
      render: (v) => formatDate(v),
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
        <h1 className="page-title">Cost Centers</h1>
        {auth.user?.role === 'SUPER_ADMIN' && (
          <button className="btn" onClick={() => setCreateModal(true)}>
            <Plus size={14} /> New Cost Center
          </button>
        )}
      </div>

      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton" style={{ height: 48 }} />
          ))}
        </div>
      ) : (
        <Table
          columns={columns}
          data={costCenters}
          onRowClick={(row) => navigate(`/cost-centers/${row.id}`)}
          emptyMessage="No cost centers found."
        />
      )}

      <Modal isOpen={createModal} onClose={() => { setCreateModal(false); reset(); }} title="New Cost Center">
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="input-group">
            <label className="input-label">Name</label>
            <input
              className={`input-field ${errors.name ? 'error' : ''}`}
              {...register('name')}
              placeholder="e.g. Marketing"
              autoFocus
            />
            {errors.name && <span className="input-error">{errors.name.message}</span>}
          </div>

          <div className="input-group">
            <label className="input-label">Description (optional)</label>
            <textarea className="input-field" {...register('description')} placeholder="Brief description..." />
          </div>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-ghost" onClick={() => { setCreateModal(false); reset(); }}>
              Cancel
            </button>
            <button type="submit" className="btn" disabled={isSubmitting}>
              {isSubmitting ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </Modal>
    </motion.div>
  );
}
