const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const prisma = require('../lib/prisma');

const router = express.Router();

// GET /api/setup/status - check if setup is needed
router.get('/status', async (req, res) => {
  try {
    const userCount = await prisma.user.count();
    res.json({ needsSetup: userCount === 0 });
  } catch (err) {
    console.error('Setup status error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/setup - initial setup
router.post('/', async (req, res) => {
  const schema = z.object({
    orgName: z.string().min(1),
    adminEmail: z.string().email(),
    adminPassword: z.string().min(8),
    adminName: z.string().min(1),
    currency: z.string().default('ZAR')
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });

  try {
    const userCount = await prisma.user.count();
    if (userCount > 0) {
      return res.status(409).json({ error: 'Setup has already been completed' });
    }

    const { orgName, adminEmail, adminPassword, adminName, currency } = parsed.data;

    const passwordHash = await bcrypt.hash(adminPassword, 12);

    await prisma.$transaction(async (tx) => {
      const admin = await tx.user.create({
        data: {
          email: adminEmail.toLowerCase(),
          passwordHash,
          name: adminName,
          role: 'super_admin',
          isActive: true
        }
      });

      await tx.costCenter.create({
        data: {
          name: 'Main Fund',
          description: 'Primary organizational fund',
          isMainFund: true,
          balance: 0
        }
      });

      await tx.setting.createMany({
        data: [
          { key: 'org_name', value: orgName, updatedBy: admin.id },
          { key: 'org_currency', value: currency, updatedBy: admin.id },
          { key: 'notify_on_payment', value: 'true', updatedBy: admin.id },
          { key: 'notify_on_fund_request', value: 'true', updatedBy: admin.id },
          { key: 'notify_on_transfer', value: 'true', updatedBy: admin.id },
          { key: 'notify_low_balance', value: 'true', updatedBy: admin.id },
          { key: 'low_balance_threshold', value: '0', updatedBy: admin.id }
        ]
      });
    });

    res.status(201).json({ message: 'Setup completed successfully' });
  } catch (err) {
    console.error('Setup error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
