const express = require('express');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const { logAudit } = require('../lib/audit');
const { authMiddleware, superAdminOnly, getClientIp } = require('../middleware/auth');
const { writeLimiter } = require('../middleware/security');
const { sendEmail, emailTemplate } = require('../lib/email');

const router = express.Router();

const DEFAULT_SETTINGS = {
  org_name: 'Foxtrot',
  org_currency: 'ZAR',
  resend_api_key: '',
  resend_from_email: '',
  microsoft_client_id: '',
  microsoft_client_secret: '',
  microsoft_tenant_id: '',
  notify_on_payment: 'true',
  notify_on_fund_request: 'true',
  notify_on_transfer: 'true',
  notify_low_balance: 'true',
  low_balance_threshold: '0'
};

// GET /api/settings - get all settings (super_admin only)
router.get('/', authMiddleware, superAdminOnly, async (req, res) => {
  try {
    const rows = await prisma.setting.findMany();
    const settings = { ...DEFAULT_SETTINGS };
    for (const row of rows) {
      settings[row.key] = row.value;
    }
    // Mask sensitive values — send a flag indicating if they are set
    const maskedSettings = { ...settings };
    if (maskedSettings.resend_api_key) {
      maskedSettings.resend_api_key_set = true;
      maskedSettings.resend_api_key = '';
    }
    if (maskedSettings.microsoft_client_secret) {
      maskedSettings.microsoft_client_secret_set = true;
      maskedSettings.microsoft_client_secret = '';
    }
    res.json(maskedSettings);
  } catch (err) {
    console.error('Get settings error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/settings - update settings (super_admin only)
router.patch('/', authMiddleware, superAdminOnly, writeLimiter, async (req, res) => {
  const schema = z.object({
    org_name: z.string().min(1).optional(),
    org_currency: z.string().min(1).optional(),
    resend_api_key: z.string().optional(),
    resend_from_email: z.string().email().optional().or(z.literal('')),
    microsoft_client_id: z.string().optional(),
    microsoft_client_secret: z.string().optional(),
    microsoft_tenant_id: z.string().optional(),
    notify_on_payment: z.enum(['true', 'false']).optional(),
    notify_on_fund_request: z.enum(['true', 'false']).optional(),
    notify_on_transfer: z.enum(['true', 'false']).optional(),
    notify_low_balance: z.enum(['true', 'false']).optional(),
    low_balance_threshold: z.string().optional()
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });

  try {
    const updates = Object.entries(parsed.data).filter(([key, v]) => {
      if (v === undefined) return false;
      // Don't overwrite secrets with empty string (means "unchanged" from the masked UI)
      if ((key === 'resend_api_key' || key === 'microsoft_client_secret') && v === '') return false;
      return true;
    });

    for (const [key, value] of updates) {
      await prisma.setting.upsert({
        where: { key },
        update: { value: String(value), updatedBy: req.user.id },
        create: { key, value: String(value), updatedBy: req.user.id }
      });
    }

    const rows = await prisma.setting.findMany();
    const settings = { ...DEFAULT_SETTINGS };
    for (const row of rows) {
      settings[row.key] = row.value;
    }

    await logAudit(req.user.id, 'SETTINGS_UPDATED', 'settings', null,
      { keys: updates.map(([k]) => k) }, getClientIp(req));

    res.json(settings);
  } catch (err) {
    console.error('Update settings error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/settings/test-email (super_admin only)
router.post('/test-email', authMiddleware, superAdminOnly, async (req, res) => {
  const schema = z.object({ to: z.string().email().optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid email address' });

  try {
    // Default to the logged-in user's email
    const to = parsed.data.to || req.user.email;
    const orgNameSetting = await prisma.setting.findUnique({ where: { key: 'org_name' } });
    const orgName = orgNameSetting?.value || 'Foxtrot';

    const html = emailTemplate(
      orgName,
      'Test Email',
      `<p>This is a test email from <strong>${orgName}</strong> via Foxtrot. If you received this, your email configuration is working correctly.</p>`,
      null,
      null
    );

    const sent = await sendEmail(to, `Test email from ${orgName}`, html);
    if (!sent) {
      return res.status(400).json({ error: 'Failed to send email. Check your Resend API key and from email configuration.' });
    }

    res.json({ message: 'Test email sent successfully' });
  } catch (err) {
    console.error('Test email error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
