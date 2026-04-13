import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Check, X } from 'lucide-react';
import { useStore } from '../lib/store';
import api from '../lib/api';
import { formatCurrency, formatDate, getStatusBadgeClass } from '../lib/utils';
import Table from '../components/Table';
import Modal from '../components/Modal';
import ConfirmModal from '../components/ConfirmModal';
import { useForm } from 'react-hook-form';

const pageVariants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0 },
};

export default function FundRequests() {
  const { auth, addToast, fetchNotifications } = useStore();
  const [requests, setRequests] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [createModal, setCreateModal] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null); // { request, action: 'approve'|'reject' }
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [costCenters, setCostCenters] = useState([]);

  const { register, handleSubmit, reset, formState: { errors } } = useForm();

  const fetchRequests = async () => {
    try {
      const res = await api.get('/fund-requests?limit=100');
      setRequests(res.data.data || res.data || []);
    } catch {
      addToast('Failed to load fund requests', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
    api.get('/cost-centers').then((r) => setCostCenters(r.data.data || r.data || [])).catch(() => {});
  }, []);

  const onCreateRequest = async (data) => {
    setIsSubmitting(true);
    try {
      await api.post('/fund-requests', {
        costCenterId: data.costCenterId,
        amount: parseFloat(data.amount),
        reason: data.reason,
      });
      addToast('Fund request submitted');
      setCreateModal(false);
      reset();
      fetchRequests();
      fetchNotifications();
    } catch (e) {
      addToast(e.response?.data?.error || 'Failed to submit request', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApproveReject = async () => {
    if (!confirmAction) return;
    setIsSubmitting(true);
    try {
      const endpoint = confirmAction.action === 'approve'
        ? `/fund-requests/${confirmAction.request.id}/approve`
        : `/fund-requests/${confirmAction.request.id}/reject`;
      await api.patch(endpoint);
      addToast(`Request ${confirmAction.action}d`);
      setConfirmAction(null);
      fetchRequests();
      fetchNotifications();
    } catch (e) {
      addToast(e.response?.data?.error || 'Action failed', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const columns = [
    { key: 'createdAt', label: 'Date', render: (v) => formatDate(v) },
    { key: 'costCenter', label: 'Cost Center', render: (v, row) => row.costCenter?.name || '—' },
    { key: 'requestedBy', label: 'Requested By', render: (v, row) => row.requestedBy?.name || '—' },
    { key: 'reason', label: 'Reason' },
    {
      key: 'status', label: 'Status',
      render: (v) => <span className={`badge ${getStatusBadgeClass(v)}`}>{v}</span>,
    },
    {
      key: 'amount', label: 'Amount', isAmount: true, align: 'right',
      render: (v) => <span className="amount">{formatCurrency(v)}</span>,
    },
    ...(auth.user?.role === 'super_admin' ? [{
      key: 'actions', label: '', sortable: false,
      render: (_, row) => row.status === 'PENDING' ? (
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn btn-sm"
            onClick={(e) => { e.stopPropagation(); setConfirmAction({ request: row, action: 'approve' }); }}
          >
            <Check size={12} /> Approve
          </button>
          <button
            className="btn btn-danger btn-sm"
            onClick={(e) => { e.stopPropagation(); setConfirmAction({ request: row, action: 'reject' }); }}
          >
            <X size={12} /> Reject
          </button>
        </div>
      ) : null,
    }] : []),
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
        <h1 className="page-title">Fund Requests</h1>
        {auth.user?.role !== 'super_admin' && (
          <button className="btn" onClick={() => setCreateModal(true)}>
            <Plus size={14} /> New Request
          </button>
        )}
      </div>

      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 48 }} />)}
        </div>
      ) : (
        <Table columns={columns} data={requests} emptyMessage="No fund requests found." />
      )}

      {/* Create Request Modal */}
      <Modal isOpen={createModal} onClose={() => { setCreateModal(false); reset(); }} title="Request Funds">
        <form onSubmit={handleSubmit(onCreateRequest)}>
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
            <label className="input-label">Amount</label>
            <input className="input-field" type="number" step="0.01" min="0.01" {...register('amount', { required: true })} placeholder="0.00" />
          </div>
          <div className="input-group">
            <label className="input-label">Reason</label>
            <textarea className="input-field" {...register('reason', { required: true })} placeholder="Why are funds needed?" />
          </div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-ghost" onClick={() => { setCreateModal(false); reset(); }}>Cancel</button>
            <button type="submit" className="btn" disabled={isSubmitting}>{isSubmitting ? 'Submitting...' : 'Submit Request'}</button>
          </div>
        </form>
      </Modal>

      {/* Approve/Reject Confirm */}
      <ConfirmModal
        isOpen={!!confirmAction}
        onClose={() => setConfirmAction(null)}
        onConfirm={handleApproveReject}
        title={confirmAction?.action === 'approve' ? 'Approve Request' : 'Reject Request'}
        message={`${confirmAction?.action === 'approve' ? 'Approve' : 'Reject'} fund request from ${confirmAction?.request?.requestedBy?.name || 'user'}?`}
        amount={confirmAction?.request?.amount}
        confirmLabel={confirmAction?.action === 'approve' ? 'Approve' : 'Reject'}
        isDanger={confirmAction?.action === 'reject'}
        isLoading={isSubmitting}
      />
    </motion.div>
  );
}
