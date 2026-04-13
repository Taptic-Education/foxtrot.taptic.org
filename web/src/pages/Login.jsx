import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useStore } from '../lib/store';
import api from '../lib/api';

const schema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(1, 'Password is required'),
});

const pageVariants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -20 },
};

export default function Login() {
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [msConfigured, setMsConfigured] = useState(false);
  const [forceSsoOnly, setForceSsoOnly] = useState(false);
  const { login, fetchNotifications } = useStore();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    // Check if Microsoft SSO is available
    api.get('/auth/microsoft/status')
      .then((res) => {
        setMsConfigured(res.data?.configured === true);
        setForceSsoOnly(res.data?.forceSsoOnly === true);
      })
      .catch(() => {});

    // Show error from Microsoft redirect
    const msError = searchParams.get('error');
    if (msError) {
      const messages = {
        microsoft_auth_failed: 'Microsoft authentication failed. Please try again.',
        microsoft_not_configured: 'Microsoft SSO is not configured. Contact your admin.',
        microsoft_token_failed: 'Could not verify Microsoft credentials. Please try again.',
        microsoft_profile_failed: 'Could not retrieve your Microsoft profile.',
        microsoft_no_email: 'No email found on your Microsoft account.',
        microsoft_no_account: 'No Foxtrot account matches your Microsoft email. Ask your admin to invite you first.',
        account_disabled: 'Your account has been disabled.',
        microsoft_auth_error: 'An unexpected error occurred during Microsoft sign-in.',
      };
      setError(messages[msError] || 'Authentication failed.');
    }
  }, [searchParams]);

  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data) => {
    setIsLoading(true);
    setError('');
    try {
      await login(data.email, data.password);
      await fetchNotifications();
      navigate('/');
    } catch (e) {
      setError(e.response?.data?.error || 'Invalid email or password');
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
        <div style={{ marginBottom: 48 }}>
          <div
            style={{
              fontSize: '1.5rem',
              fontWeight: 800,
              letterSpacing: '6px',
              textTransform: 'uppercase',
              marginBottom: 8,
            }}
          >
            FOXTROT
          </div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800 }}>Sign in</h1>
        </div>

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

        <form onSubmit={handleSubmit(onSubmit)}>
          {!forceSsoOnly && (
            <>
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

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 24, marginTop: -12 }}>
                <Link to="/forgot-password" style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                  Forgot password?
                </Link>
              </div>

              <button
                type="submit"
                className="btn"
                disabled={isLoading}
                style={{ width: '100%', justifyContent: 'center', marginBottom: 16 }}
              >
                {isLoading ? 'Signing in...' : 'Sign In'}
              </button>
            </>
          )}

          {forceSsoOnly && (
            <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: 16, textAlign: 'center' }}>
              Your organisation requires Microsoft SSO to sign in.
            </p>
          )}

          <button
            type="button"
            className="btn btn-ghost"
            style={{ width: '100%', justifyContent: 'center', display: msConfigured ? 'flex' : 'none' }}
            onClick={() => window.location.href = '/api/auth/microsoft'}
          >
            Sign in with Microsoft
          </button>
        </form>
      </motion.div>
    </div>
  );
}
