import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { UserPlus, UserX } from 'lucide-react';
import { useStore } from '../lib/store';
import api from '../lib/api';
import { formatDate, getStatusBadgeClass } from '../lib/utils';
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

const inviteSchema = z.object({
  email: z.string().email('Invalid email'),
  name: z.string().min(2, 'Name is required'),
  role: z.enum(['SUPER_ADMIN', 'COST_CENTER_OWNER']),
});

export default function Users() {
  const { addToast } = useStore();
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [inviteModal, setInviteModal] = useState(false);
  const [deactivateUser, setDeactivateUser] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    resolver: zodResolver(inviteSchema),
    defaultValues: { role: 'COST_CENTER_OWNER' },
  });

  const fetchUsers = async () => {
    try {
      const res = await api.get('/users');
      setUsers(res.data.data || res.data || []);
    } catch {
      addToast('Failed to load users', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  const onInvite = async (data) => {
    setIsSubmitting(true);
    try {
      await api.post('/users/invite', data);
      addToast(`Invite sent to ${data.email}`);
      setInviteModal(false);
      reset();
      fetchUsers();
    } catch (e) {
      addToast(e.response?.data?.error || 'Failed to send invite', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const onDeactivate = async () => {
    setIsSubmitting(true);
    try {
      await api.patch(`/users/${deactivateUser.id}/deactivate`);
      addToast('User deactivated');
      setDeactivateUser(null);
      fetchUsers();
    } catch (e) {
      addToast(e.response?.data?.error || 'Failed to deactivate user', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const columns = [
    { key: 'name', label: 'Name' },
    { key: 'email', label: 'Email' },
    {
      key: 'role', label: 'Role',
      render: (v) => (
        <span className="badge badge-muted">{v?.replace('_', ' ')}</span>
      ),
    },
    {
      key: 'status', label: 'Status',
      render: (v) => <span className={`badge ${getStatusBadgeClass(v || 'active')}`}>{v || 'active'}</span>,
    },
    { key: 'createdAt', label: 'Joined', render: (v) => formatDate(v) },
    {
      key: 'actions', label: '', sortable: false,
      render: (_, row) => row.status !== 'inactive' ? (
        <button
          className="btn btn-danger btn-sm"
          onClick={(e) => { e.stopPropagation(); setDeactivateUser(row); }}
        >
          <UserX size={12} /> Deactivate
        </button>
      ) : <span className="badge badge-muted">Inactive</span>,
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
        <h1 className="page-title">Users</h1>
        <button className="btn" onClick={() => setInviteModal(true)}>
          <UserPlus size={14} /> Invite User
        </button>
      </div>

      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 48 }} />)}
        </div>
      ) : (
        <Table columns={columns} data={users} emptyMessage="No users found." />
      )}

      {/* Invite Modal */}
      <Modal isOpen={inviteModal} onClose={() => { setInviteModal(false); reset(); }} title="Invite User">
        <form onSubmit={handleSubmit(onInvite)}>
          <div className="input-group">
            <label className="input-label">Name</label>
            <input
              className={`input-field ${errors.name ? 'error' : ''}`}
              {...register('name')}
              placeholder="Jane Doe"
              autoFocus
            />
            {errors.name && <span className="input-error">{errors.name.message}</span>}
          </div>

          <div className="input-group">
            <label className="input-label">Email</label>
            <input
              className={`input-field ${errors.email ? 'error' : ''}`}
              type="email"
              {...register('email')}
              placeholder="jane@company.com"
            />
            {errors.email && <span className="input-error">{errors.email.message}</span>}
          </div>

          <div className="input-group">
            <label className="input-label">Role</label>
            <select className="input-field" {...register('role')}>
              <option value="COST_CENTER_OWNER">Cost Center Owner</option>
              <option value="SUPER_ADMIN">Super Admin</option>
            </select>
          </div>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-ghost" onClick={() => { setInviteModal(false); reset(); }}>Cancel</button>
            <button type="submit" className="btn" disabled={isSubmitting}>{isSubmitting ? 'Sending...' : 'Send Invite'}</button>
          </div>
        </form>
      </Modal>

      {/* Deactivate Confirm */}
      <ConfirmModal
        isOpen={!!deactivateUser}
        onClose={() => setDeactivateUser(null)}
        onConfirm={onDeactivate}
        title="Deactivate User"
        message={`Deactivate ${deactivateUser?.name}? They will no longer be able to sign in.`}
        confirmLabel="Deactivate"
        isDanger
        isLoading={isSubmitting}
      />
    </motion.div>
  );
}
