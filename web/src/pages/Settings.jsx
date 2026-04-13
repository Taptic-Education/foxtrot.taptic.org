import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Send, ShieldCheck } from 'lucide-react';
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

const sectionHeadingStyle = {
  fontSize: '0.75rem',
  fontWeight: 700,
  letterSpacing: '2px',
  textTransform: 'uppercase',
  color: 'var(--muted)',
  marginBottom: 16,
  paddingBottom: 8,
  borderBottom: '1px solid var(--border)',
};

const schema = z.object({
  org_name: z.string().min(1, 'Required'),
  org_currency: z.enum(['ZAR', 'USD', 'EUR', 'GBP']),
  resend_api_key: z.string().optional(),
  resend_from_email: z.string().email('Invalid email').optional().or(z.literal('')),
  microsoft_client_id: z.string().optional(),
  microsoft_client_secret: z.string().optional(),
  microsoft_tenant_id: z.string().optional(),
  force_sso_only: z.boolean().optional(),
  notify_on_payment: z.boolean().optional(),
  notify_on_fund_request: z.boolean().optional(),
  notify_on_transfer: z.boolean().optional(),
  notify_low_balance: z.boolean().optional(),
  low_balance_threshold: z.string().optional(),
});

export default function Settings() {
  const { addToast } = useStore();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTestingEmail, setIsTestingEmail] = useState(false);
  const [resendKeySet, setResendKeySet] = useState(false);
  const [msSecretSet, setMsSecretSet] = useState(false);

  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      org_currency: 'ZAR',
      force_sso_only: false,
      notify_on_payment: true,
      notify_on_fund_request: true,
      notify_on_transfer: true,
      notify_low_balance: false,
    },
  });

  useEffect(() => {
    api.get('/settings')
      .then((res) => {
        const d = res.data;
        setResendKeySet(!!d.resend_api_key_set);
        setMsSecretSet(!!d.microsoft_client_secret_set);
        reset({
          org_name: d.org_name || '',
          org_currency: d.org_currency || 'ZAR',
          resend_api_key: '', // always blank — masked on server
          resend_from_email: d.resend_from_email || '',
          microsoft_client_id: d.microsoft_client_id || '',
          microsoft_client_secret: '', // always blank — masked on server
          microsoft_tenant_id: d.microsoft_tenant_id || '',
          force_sso_only: d.force_sso_only === 'true',
          notify_on_payment: d.notify_on_payment === 'true',
          notify_on_fund_request: d.notify_on_fund_request === 'true',
          notify_on_transfer: d.notify_on_transfer === 'true',
          notify_low_balance: d.notify_low_balance === 'true',
          low_balance_threshold: d.low_balance_threshold || '',
        });
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  const onSubmit = async (data) => {
    setIsSaving(true);
    try {
      // Convert booleans to string 'true'/'false' for the backend
      const payload = {
        org_name: data.org_name,
        org_currency: data.org_currency,
        resend_api_key: data.resend_api_key || '',
        resend_from_email: data.resend_from_email || '',
        microsoft_client_id: data.microsoft_client_id || '',
        microsoft_client_secret: data.microsoft_client_secret || '',
        microsoft_tenant_id: data.microsoft_tenant_id || '',
        force_sso_only: data.force_sso_only ? 'true' : 'false',
        notify_on_payment: data.notify_on_payment ? 'true' : 'false',
        notify_on_fund_request: data.notify_on_fund_request ? 'true' : 'false',
        notify_on_transfer: data.notify_on_transfer ? 'true' : 'false',
        notify_low_balance: data.notify_low_balance ? 'true' : 'false',
        low_balance_threshold: data.low_balance_threshold || '0',
      };
      await api.patch('/settings', payload);
      // Update hints about what's set
      if (data.resend_api_key) setResendKeySet(true);
      if (data.microsoft_client_secret) setMsSecretSet(true);
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
      await api.post('/settings/test-email', {});
      addToast('Test email sent — check your inbox');
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
        {/* ── Organisation ── */}
        <div style={{ marginBottom: 32 }}>
          <div style={sectionHeadingStyle}>Organisation</div>

          <div className="input-group">
            <label className="input-label">Organisation Name</label>
            <input className={`input-field ${errors.org_name ? 'error' : ''}`} {...register('org_name')} />
            {errors.org_name && <span className="input-error">{errors.org_name.message}</span>}
          </div>

          <div className="input-group">
            <label className="input-label">Base Currency</label>
            <select className="input-field" {...register('org_currency')}>
              <option value="ZAR">ZAR — South African Rand</option>
              <option value="USD">USD — US Dollar</option>
              <option value="EUR">EUR — Euro</option>
              <option value="GBP">GBP — British Pound</option>
            </select>
          </div>
        </div>

        {/* ── Email (Resend) ── */}
        <div style={{ marginBottom: 32 }}>
          <div style={sectionHeadingStyle}>Email (Resend)</div>

          <div className="input-group">
            <label className="input-label">
              Resend API Key
              {resendKeySet && <span style={{ color: 'var(--success)', marginLeft: 8, fontSize: '0.65rem' }}>✓ SET</span>}
            </label>
            <input
              className="input-field"
              type="password"
              {...register('resend_api_key')}
              placeholder={resendKeySet ? '••••••••  (leave blank to keep current)' : 're_xxxxxxxxxxxx'}
            />
          </div>

          <div className="input-group">
            <label className="input-label">From Email Address</label>
            <input
              className={`input-field ${errors.resend_from_email ? 'error' : ''}`}
              type="email"
              {...register('resend_from_email')}
              placeholder="foxtrot@yourdomain.com"
            />
            {errors.resend_from_email && <span className="input-error">{errors.resend_from_email.message}</span>}
          </div>

          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={testEmail}
            disabled={isTestingEmail}
          >
            <Send size={12} /> {isTestingEmail ? 'Sending...' : 'Send Test Email'}
          </button>
          <span style={{ marginLeft: 12, fontSize: '0.8rem', color: 'var(--muted)' }}>
            Sends to your account email
          </span>
        </div>

        {/* ── Microsoft SSO ── */}
        <div style={{ marginBottom: 32 }}>
          <div style={sectionHeadingStyle}>
            <ShieldCheck size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
            Microsoft SSO (optional)
          </div>
          <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: 16, lineHeight: 1.5 }}>
            Register an app in{' '}
            <a href="https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps" target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>
              Azure Portal → App Registrations
            </a>{' '}
            and set the redirect URI to <code style={{ background: 'var(--card-bg)', padding: '2px 6px', fontFamily: 'monospace', fontSize: '0.75rem' }}>
              {window.location.origin}/api/auth/microsoft/callback
            </code>
          </p>

          <div className="input-group">
            <label className="input-label">Client ID</label>
            <input
              className="input-field"
              {...register('microsoft_client_id')}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            />
          </div>

          <div className="input-group">
            <label className="input-label">
              Client Secret
              {msSecretSet && <span style={{ color: 'var(--success)', marginLeft: 8, fontSize: '0.65rem' }}>✓ SET</span>}
            </label>
            <input
              className="input-field"
              type="password"
              {...register('microsoft_client_secret')}
              placeholder={msSecretSet ? '••••••••  (leave blank to keep current)' : 'Enter client secret'}
            />
          </div>

          <div className="input-group">
            <label className="input-label">Tenant ID</label>
            <input
              className="input-field"
              {...register('microsoft_tenant_id')}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx or common"
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 }}>
            <input
              type="checkbox"
              id="force_sso_only"
              {...register('force_sso_only')}
              style={{ width: 16, height: 16, cursor: 'pointer' }}
            />
            <label htmlFor="force_sso_only" style={{ fontSize: '0.9rem', cursor: 'pointer' }}>
              Force SSO only (disable password login)
            </label>
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: 4, marginLeft: 28 }}>
            When enabled, users must sign in with Microsoft. Invite accept &amp; password reset still work.
          </p>
        </div>

        {/* ── Notifications ── */}
        <div style={{ marginBottom: 32 }}>
          <div style={sectionHeadingStyle}>Notifications</div>

          {[
            { key: 'notify_on_payment', label: 'Notify admins on new payment' },
            { key: 'notify_on_fund_request', label: 'Notify admins on fund request' },
            { key: 'notify_on_transfer', label: 'Notify owners on incoming transfer' },
            { key: 'notify_low_balance', label: 'Notify owners on low balance' },
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
              {...register('low_balance_threshold')}
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
