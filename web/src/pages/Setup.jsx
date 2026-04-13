import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import api from '../lib/api';

const step1Schema = z.object({
  orgName: z.string().min(2, 'Organization name is required'),
  currency: z.enum(['ZAR', 'USD', 'EUR', 'GBP']),
});

const step2Schema = z.object({
  adminName: z.string().min(2, 'Name is required'),
  adminEmail: z.string().email('Invalid email'),
  adminPassword: z.string().min(8, 'Password must be at least 8 characters'),
});

const pageVariants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -20 },
};

export default function Setup() {
  const [step, setStep] = useState(1);
  const [step1Data, setStep1Data] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const form1 = useForm({ resolver: zodResolver(step1Schema), defaultValues: { currency: 'ZAR' } });
  const form2 = useForm({ resolver: zodResolver(step2Schema) });

  const onStep1 = (data) => {
    setStep1Data(data);
    setStep(2);
  };

  const onStep2 = async (data) => {
    setIsLoading(true);
    setError('');
    try {
      await api.post('/setup', {
        orgName: step1Data.orgName,
        currency: step1Data.currency,
        adminName: data.name,
        adminEmail: data.email,
        adminPassword: data.password,
      });
      setStep(3);
    } catch (e) {
      setError(e.response?.data?.error || 'Setup failed');
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
        style={{ width: '100%', maxWidth: 480 }}
        initial="initial"
        animate="animate"
        exit="exit"
        variants={pageVariants}
        transition={{ duration: 0.4 }}
      >
        <div style={{ marginBottom: 40 }}>
          <div
            style={{
              fontSize: '0.7rem',
              fontWeight: 700,
              letterSpacing: '4px',
              textTransform: 'uppercase',
              color: 'var(--muted)',
              marginBottom: 8,
            }}
          >
            FOXTROT SETUP
          </div>
          <h1 style={{ fontSize: '2rem', fontWeight: 800 }}>
            {step === 1 && 'Organisation'}
            {step === 2 && 'Admin Account'}
            {step === 3 && 'Setup Complete'}
          </h1>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            {[1, 2, 3].map((s) => (
              <div
                key={s}
                style={{
                  height: 4,
                  flex: 1,
                  background: s <= step ? 'var(--accent)' : 'var(--border)',
                  transition: 'background 0.3s',
                }}
              />
            ))}
          </div>
        </div>

        {step === 1 && (
          <form onSubmit={form1.handleSubmit(onStep1)}>
            <div className="input-group">
              <label className="input-label">Organisation Name</label>
              <input
                className={`input-field ${form1.formState.errors.orgName ? 'error' : ''}`}
                {...form1.register('orgName')}
                placeholder="Acme Corp"
              />
              {form1.formState.errors.orgName && (
                <span className="input-error">{form1.formState.errors.orgName.message}</span>
              )}
            </div>

            <div className="input-group">
              <label className="input-label">Base Currency</label>
              <select className="input-field" {...form1.register('currency')}>
                <option value="ZAR">ZAR — South African Rand</option>
                <option value="USD">USD — US Dollar</option>
                <option value="EUR">EUR — Euro</option>
                <option value="GBP">GBP — British Pound</option>
              </select>
            </div>

            <button type="submit" className="btn" style={{ width: '100%', justifyContent: 'center' }}>
              Continue →
            </button>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={form2.handleSubmit(onStep2)}>
            {error && (
              <div
                style={{
                  padding: '12px 16px',
                  background: 'rgba(207,34,46,0.1)',
                  borderLeft: '4px solid var(--danger)',
                  marginBottom: 20,
                  fontSize: '0.875rem',
                  color: 'var(--danger)',
                }}
              >
                {error}
              </div>
            )}

            <div className="input-group">
              <label className="input-label">Full Name</label>
              <input
                className={`input-field ${form2.formState.errors.adminName ? 'error' : ''}`}
                {...form2.register('adminName')}
                placeholder="Jane Doe"
              />
              {form2.formState.errors.adminName && (
                <span className="input-error">{form2.formState.errors.adminName.message}</span>
              )}
            </div>

            <div className="input-group">
              <label className="input-label">Email</label>
              <input
                className={`input-field ${form2.formState.errors.adminEmail ? 'error' : ''}`}
                {...form2.register('adminEmail')}
                type="email"
                placeholder="admin@company.com"
              />
              {form2.formState.errors.adminEmail && (
                <span className="input-error">{form2.formState.errors.adminEmail.message}</span>
              )}
            </div>

            <div className="input-group">
              <label className="input-label">Password</label>
              <input
                className={`input-field ${form2.formState.errors.adminPassword ? 'error' : ''}`}
                {...form2.register('adminPassword')}
                type="password"
                placeholder="••••••••"
              />
              {form2.formState.errors.adminPassword && (
                <span className="input-error">{form2.formState.errors.adminPassword.message}</span>
              )}
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <button type="button" className="btn btn-ghost" onClick={() => setStep(1)}>
                ← Back
              </button>
              <button
                type="submit"
                className="btn"
                disabled={isLoading}
                style={{ flex: 1, justifyContent: 'center' }}
              >
                {isLoading ? 'Setting up...' : 'Create Account'}
              </button>
            </div>
          </form>
        )}

        {step === 3 && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '3rem', marginBottom: 16 }}>✓</div>
            <p style={{ color: 'var(--muted)', marginBottom: 32 }}>
              Your Foxtrot workspace is ready. Sign in to get started.
            </p>
            <button className="btn" style={{ width: '100%', justifyContent: 'center' }} onClick={() => navigate('/login')}>
              Go to Login →
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
