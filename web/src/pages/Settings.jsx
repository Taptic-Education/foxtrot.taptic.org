import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Send } from 'lucide-react';
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

const schema = z.object({
  orgName: z.string().min(1, 'Required'),
  currency: z.enum(['ZAR', 'USD', 'EUR', 'GBP']),
  resendApiKey: z.string().optional(),
  notifyOnPayment: z.boolean().optional(),
  notifyOnRequest: z.boolean().optional(),
  notifyOnLowBalance: z.boolean().optional(),
  lowBalanceThreshold: z.string().optional(),
});

export default function Settings() {
  const { addToast } = useStore();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTestingEmail, setIsTestingEmail] = useState(false);

  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { currency: 'ZAR', notifyOnPayment: true, notifyOnRequest: true, notifyOnLowBalance: false },
  });

  useEffect(() => {
    api.get('/settings')
      .then((res) => {
        reset({
          orgName: res.data.orgName || '',
          currency: res.data.currency || 'ZAR',
          resendApiKey: res.data.resendApiKey || '',
          notifyOnPayment: res.data.notifyOnPayment ?? true,
          notifyOnRequest: res.data.notifyOnRequest ?? true,
          notifyOnLowBalance: res.data.notifyOnLowBalance ?? false,
          lowBalanceThreshold: res.data.lowBalanceThreshold?.toString() || '',
        });
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  const onSubmit = async (data) => {
    setIsSaving(true);
    try {
      await api.put('/settings', {
        ...data,
        lowBalanceThreshold: data.lowBalanceThreshold ? parseFloat(data.lowBalanceThreshold) : undefined,
      });
      addToast('Settings saved');
    } catch (e) {
      addToast(e.response?.data?.error || 'Failed to save settings', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const testEmail = async () => {
    setIsTestingEmail(true);
    try {
      await api.post('/settings/test-email');
      addToast('Test email sent');
    } catch (e) {
      addToast(e.response?.data?.error || 'Failed to send test email', 'error');
    } finally {
      setIsTestingEmail(false);
    }
  };

  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 600 }}>
        {[1, 2, 3, 4].map((i) => <div key={i} className="skeleton" style={{ height: 60 }} />)}
      </div>
    );
  }

  return (
    <motion.div
      initial="initial"
      animate="animate"
      exit="exit"
      variants={pageVariants}
      transition={{ duration: 0.4 }}
    >
      <div className="page-header">
        <h1 className="page-title">Settings</h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} style={{ maxWidth: 560 }}>
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 16, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
            Organisation
          </div>

          <div className="input-group">
            <label className="input-label">Organisation Name</label>
            <input className={`input-field ${errors.orgName ? 'error' : ''}`} {...register('orgName')} />
            {errors.orgName && <span className="input-error">{errors.orgName.message}</span>}
          </div>

          <div className="input-group">
            <label className="input-label">Base Currency</label>
            <select className="input-field" {...register('currency')}>
              <option value="ZAR">ZAR — South African Rand</option>
              <option value="USD">USD — US Dollar</option>
              <option value="EUR">EUR — Euro</option>
              <option value="GBP">GBP — British Pound</option>
            </select>
          </div>
        </div>

        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 16, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
            Email (Resend)
          </div>

          <div className="input-group">
            <label className="input-label">Resend API Key</label>
            <input
              className="input-field"
              type="password"
              {...register('resendApiKey')}
              placeholder="re_••••••••"
            />
          </div>

          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={testEmail}
            disabled={isTestingEmail}
          >
            <Send size={12} /> {isTestingEmail ? 'Sending...' : 'Send Test Email'}
          </button>
        </div>

        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 16, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
            Notifications
          </div>

          {[
            { key: 'notifyOnPayment', label: 'Notify on new payment' },
            { key: 'notifyOnRequest', label: 'Notify on fund request' },
            { key: 'notifyOnLowBalance', label: 'Notify on low balance' },
          ].map((item) => (
            <div key={item.key} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <input
                type="checkbox"
                id={item.key}
                {...register(item.key)}
                style={{ width: 16, height: 16, cursor: 'pointer' }}
              />
              <label htmlFor={item.key} style={{ fontSize: '0.9rem', cursor: 'pointer' }}>{item.label}</label>
            </div>
          ))}

          <div className="input-group">
            <label className="input-label">Low Balance Threshold</label>
            <input
              className="input-field"
              type="number"
              step="0.01"
              min="0"
              {...register('lowBalanceThreshold')}
              placeholder="e.g. 1000"
            />
          </div>
        </div>

        <button type="submit" className="btn" disabled={isSaving}>
          {isSaving ? 'Saving...' : 'Save Settings'}
        </button>
      </form>
    </motion.div>
  );
}
