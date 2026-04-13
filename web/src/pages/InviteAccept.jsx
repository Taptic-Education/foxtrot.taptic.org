import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import api from '../lib/api';

const schema = z.object({
  name: z.string().min(2, 'Name is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirm: z.string(),
}).refine((d) => d.password === d.confirm, {
  message: 'Passwords do not match',
  path: ['confirm'],
});

const pageVariants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -20 },
};

export default function InviteAccept() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data) => {
    if (!token) {
      setError('Invalid invite link');
      return;
    }
    setIsLoading(true);
    setError('');
    try {
      await api.post('/auth/invite/accept', { token, name: data.name, password: data.password });
      navigate('/login');
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to accept invite. Link may be expired.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        background: 'var(--bg)',
      }}
    >
      <motion.div
        style={{ width: '100%', maxWidth: 400 }}
        initial="initial"
        animate="animate"
        exit="exit"
        variants={pageVariants}
        transition={{ duration: 0.4 }}
      >
        <div style={{ marginBottom: 40 }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '6px', textTransform: 'uppercase', marginBottom: 8 }}>
            FOXTROT
          </div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800 }}>Accept Invite</h1>
          <p style={{ color: 'var(--muted)', marginTop: 8, fontSize: '0.9rem' }}>
            Set up your account to get started.
          </p>
        </div>

        {error && (
          <div style={{ padding: '12px 16px', background: 'rgba(207,34,46,0.1)', borderLeft: '4px solid var(--danger)', marginBottom: 24, fontSize: '0.875rem', color: 'var(--danger)' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="input-group">
            <label className="input-label">Your Name</label>
            <input
              className={`input-field ${errors.name ? 'error' : ''}`}
              {...register('name')}
              placeholder="Jane Doe"
              autoFocus
            />
            {errors.name && <span className="input-error">{errors.name.message}</span>}
          </div>

          <div className="input-group">
            <label className="input-label">Password</label>
            <input
              className={`input-field ${errors.password ? 'error' : ''}`}
              type="password"
              {...register('password')}
              placeholder="••••••••"
            />
            {errors.password && <span className="input-error">{errors.password.message}</span>}
          </div>

          <div className="input-group">
            <label className="input-label">Confirm Password</label>
            <input
              className={`input-field ${errors.confirm ? 'error' : ''}`}
              type="password"
              {...register('confirm')}
              placeholder="••••••••"
            />
            {errors.confirm && <span className="input-error">{errors.confirm.message}</span>}
          </div>

          <button type="submit" className="btn" disabled={isLoading} style={{ width: '100%', justifyContent: 'center' }}>
            {isLoading ? 'Creating account...' : 'Create Account'}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
