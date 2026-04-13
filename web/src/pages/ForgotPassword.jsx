import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import api from '../lib/api';

const schema = z.object({ email: z.string().email('Invalid email') });

const pageVariants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -20 },
};

export default function ForgotPassword() {
  const [sent, setSent] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data) => {
    setIsLoading(true);
    setError('');
    try {
      await api.post('/auth/forgot-password', data);
      setSent(true);
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to send reset email');
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
          <Link to="/login" style={{ fontSize: '0.8rem', color: 'var(--muted)', display: 'block', marginBottom: 24 }}>
            ← Back to login
          </Link>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800 }}>Reset Password</h1>
          <p style={{ color: 'var(--muted)', marginTop: 8, fontSize: '0.9rem' }}>
            Enter your email and we'll send you a reset link.
          </p>
        </div>

        {sent ? (
          <div
            style={{
              padding: '20px',
              borderLeft: '4px solid var(--success)',
              background: 'rgba(26,127,55,0.1)',
            }}
          >
            <p style={{ fontWeight: 600 }}>Check your email</p>
            <p style={{ color: 'var(--muted)', fontSize: '0.875rem', marginTop: 4 }}>
              If that address is registered, you'll receive a reset link shortly.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)}>
            {error && (
              <div
                style={{
                  padding: '12px 16px',
                  background: 'rgba(207,34,46,0.1)',
                  borderLeft: '4px solid var(--danger)',
                  marginBottom: 24,
                  fontSize: '0.875rem',
                  color: 'var(--danger)',
                }}
              >
                {error}
              </div>
            )}

            <div className="input-group">
              <label className="input-label">Email</label>
              <input
                className={`input-field ${errors.email ? 'error' : ''}`}
                type="email"
                {...register('email')}
                placeholder="you@company.com"
                autoFocus
              />
              {errors.email && <span className="input-error">{errors.email.message}</span>}
            </div>

            <button
              type="submit"
              className="btn"
              disabled={isLoading}
              style={{ width: '100%', justifyContent: 'center' }}
            >
              {isLoading ? 'Sending...' : 'Send Reset Link'}
            </button>
          </form>
        )}
      </motion.div>
    </div>
  );
}
