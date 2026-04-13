import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useStore } from '../lib/store';
import api from '../lib/api';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const pageVariants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0 },
};

const profileSchema = z.object({
  name: z.string().min(2, 'Name is required'),
  email: z.string().email('Invalid email'),
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
  confirm: z.string(),
}).refine((d) => d.newPassword === d.confirm, {
  message: 'Passwords do not match',
  path: ['confirm'],
});

export default function Profile() {
  const { auth, addToast } = useStore();
  const [isSaving, setIsSaving] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const profileForm = useForm({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: auth.user?.name || '',
      email: auth.user?.email || '',
    },
  });

  const passwordForm = useForm({
    resolver: zodResolver(passwordSchema),
  });

  const onSaveProfile = async (data) => {
    setIsSaving(true);
    try {
      await api.put('/auth/profile', data);
      addToast('Profile updated');
    } catch (e) {
      addToast(e.response?.data?.error || 'Failed to update profile', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const onChangePassword = async (data) => {
    setIsChangingPassword(true);
    try {
      await api.put('/auth/password', {
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      });
      addToast('Password updated');
      passwordForm.reset();
    } catch (e) {
      addToast(e.response?.data?.error || 'Failed to update password', 'error');
    } finally {
      setIsChangingPassword(false);
    }
  };

  return (
    <motion.div
      initial="initial"
      animate="animate"
      exit="exit"
      variants={pageVariants}
      transition={{ duration: 0.4 }}
    >
      <div className="page-header">
        <h1 className="page-title">Profile</h1>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 32, maxWidth: 900 }}>
        {/* Profile Info */}
        <div>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 20, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
            Account Info
          </div>

          <div style={{ marginBottom: 16 }}>
            <span className="badge badge-muted">{auth.user?.role?.replace('_', ' ')}</span>
          </div>

          <form onSubmit={profileForm.handleSubmit(onSaveProfile)}>
            <div className="input-group">
              <label className="input-label">Full Name</label>
              <input
                className={`input-field ${profileForm.formState.errors.name ? 'error' : ''}`}
                {...profileForm.register('name')}
              />
              {profileForm.formState.errors.name && (
                <span className="input-error">{profileForm.formState.errors.name.message}</span>
              )}
            </div>

            <div className="input-group">
              <label className="input-label">Email</label>
              <input
                className={`input-field ${profileForm.formState.errors.email ? 'error' : ''}`}
                type="email"
                {...profileForm.register('email')}
              />
              {profileForm.formState.errors.email && (
                <span className="input-error">{profileForm.formState.errors.email.message}</span>
              )}
            </div>

            <button type="submit" className="btn" disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save Profile'}
            </button>
          </form>
        </div>

        {/* Change Password */}
        <div>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 20, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
            Change Password
          </div>

          <form onSubmit={passwordForm.handleSubmit(onChangePassword)}>
            <div className="input-group">
              <label className="input-label">Current Password</label>
              <input
                className={`input-field ${passwordForm.formState.errors.currentPassword ? 'error' : ''}`}
                type="password"
                {...passwordForm.register('currentPassword')}
                placeholder="••••••••"
              />
              {passwordForm.formState.errors.currentPassword && (
                <span className="input-error">{passwordForm.formState.errors.currentPassword.message}</span>
              )}
            </div>

            <div className="input-group">
              <label className="input-label">New Password</label>
              <input
                className={`input-field ${passwordForm.formState.errors.newPassword ? 'error' : ''}`}
                type="password"
                {...passwordForm.register('newPassword')}
                placeholder="••••••••"
              />
              {passwordForm.formState.errors.newPassword && (
                <span className="input-error">{passwordForm.formState.errors.newPassword.message}</span>
              )}
            </div>

            <div className="input-group">
              <label className="input-label">Confirm New Password</label>
              <input
                className={`input-field ${passwordForm.formState.errors.confirm ? 'error' : ''}`}
                type="password"
                {...passwordForm.register('confirm')}
                placeholder="••••••••"
              />
              {passwordForm.formState.errors.confirm && (
                <span className="input-error">{passwordForm.formState.errors.confirm.message}</span>
              )}
            </div>

            <button type="submit" className="btn" disabled={isChangingPassword}>
              {isChangingPassword ? 'Updating...' : 'Change Password'}
            </button>
          </form>
        </div>
      </div>

      {/* Cost Centers */}
      {auth.user?.costCenters && auth.user.costCenters.length > 0 && (
        <div style={{ marginTop: 40 }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 16 }}>
            Assigned Cost Centers
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {auth.user.costCenters.map((cc) => (
              <div key={cc.id} className="card" style={{ padding: '10px 16px', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 700 }}>{cc.name || cc.costCenter?.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}
