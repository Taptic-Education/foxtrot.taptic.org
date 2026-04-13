import React, { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import api from '../lib/api';

const schema = z.object({
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

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const navigate = useNavigate();

  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data) => {
    if (!token) {
      setError('Invalid reset link');
      return;
    }
    setIsLoading(true);
    setError('');
    try {
      await api.post('/auth/reset-password', { token, password: data.password });
      setDone(true);
      setTimeout(() => navigate('/login'), 2000);
    } catch (e) {
      setError(e.response?.data?.error || 'Reset failed. Link may be expired.');
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
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800 }}>New Password</h1>
        </div>

        {done ? (
          <div style={{ padding: '20px', borderLeft: '4px solid var(--success)', background: 'rgba(26,127,55,0.1)' }}>
            <p style={{ fontWeight: 600 }}>Password updated!</p>
            <p style={{ color: 'var(--muted)', fontSize: '0.875rem', marginTop: 4 }}>Redirecting to login...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)}>
            {error && (
              <div style={{ padding: '12px 16px', background: 'rgba(207,34,46,0.1)', borderLeft: '4px solid var(--danger)', marginBottom: 24, fontSize: '0.875rem', color: 'var(--danger)' }}>
                {error}
              </div>
            )}

            <div className="input-group">
              <label className="input-label">New Password</label>
              <input
                className={`input-field ${errors.password ? 'error' : ''}`}
                type="password"
                {...register('password')}
                placeholder="••••••••"
                autoFocus
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
              {isLoading ? 'Updating...' : 'Update Password'}
            </button>
          </form>
        )}
      </motion.div>
    </div>
  );
}
