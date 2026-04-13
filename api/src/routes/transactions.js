const express = require('express');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const { logAudit } = require('../lib/audit');
const { authMiddleware, superAdminOnly, getClientIp } = require('../middleware/auth');
const { writeLimiter } = require('../middleware/security');
const { sendFundsTransferredEmail, sendPaymentRecordedEmail, sendLowBalanceEmail } = require('../lib/email');

const router = express.Router();

async function getCurrency() {
  const s = await prisma.setting.findUnique({ where: { key: 'org_currency' } });
  return s?.value || 'ZAR';
}

async function getSetting(key) {
  const s = await prisma.setting.findUnique({ where: { key } });
  return s?.value;
}

async function checkAndNotifyLowBalance(costCenter) {
  const threshold = Number(costCenter.lowBalanceThreshold);
  if (threshold <= 0) return;
  const balance = Number(costCenter.balance);
  if (balance < threshold) {
    const notifyEnabled = await getSetting('notify_low_balance');
    if (notifyEnabled === 'false') return;

    const owners = await prisma.costCenterOwner.findMany({
      where: { costCenterId: costCenter.id },
      include: { user: { select: { email: true } } }
    });
    const currency = await getCurrency();
    for (const owner of owners) {
      await sendLowBalanceEmail(owner.user.email, costCenter.name, balance, threshold, currency);
    }
  }
}

// POST /api/transactions/top-up (super_admin only)
router.post('/top-up', authMiddleware, superAdminOnly, writeLimiter, async (req, res) => {
  const schema = z.object({
    toCostCenterId: z.string().min(1),
    amount: z.number().positive(),
    description: z.string().min(1),
    reference: z.string().optional()
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });

  try {
    const { toCostCenterId, amount, description, reference } = parsed.data;
    const currency = await getCurrency();

    const costCenter = await prisma.costCenter.findUnique({ where: { id: toCostCenterId } });
    if (!costCenter) return res.status(404).json({ error: 'Cost center not found' });

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.costCenter.update({
        where: { id: toCostCenterId },
        data: { balance: { increment: amount } }
      });

      const transaction = await tx.transaction.create({
        data: {
          type: 'top_up',
          amount,
          currency,
          toCostCenterId,
          description,
          reference,
          status: 'completed',
          createdBy: req.user.id
        },
        include: {
          toCostCenter: { select: { id: true, name: true } },
          creator: { select: { id: true, name: true } }
        }
      });

      return { transaction, updatedCenter: updated };
    });

    await checkAndNotifyLowBalance(result.updatedCenter);
    await logAudit(req.user.id, 'TOP_UP', 'transaction', result.transaction.id,
      { amount, toCostCenterId, description }, getClientIp(req));

    res.status(201).json(result.transaction);
  } catch (err) {
    console.error('Top-up error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/transactions/transfer
router.post('/transfer', authMiddleware, writeLimiter, async (req, res) => {
  const schema = z.object({
    fromCostCenterId: z.string().min(1),
    toCostCenterId: z.string().min(1),
    amount: z.number().positive(),
    description: z.string().min(1),
    reference: z.string().optional()
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });

  const { fromCostCenterId, toCostCenterId, amount, description, reference } = parsed.data;

  if (fromCostCenterId === toCostCenterId) {
    return res.status(400).json({ error: 'Cannot transfer to the same cost center' });
  }

  try {
    if (req.user.role !== 'super_admin') {
      const isOwner = await prisma.costCenterOwner.findFirst({
        where: { costCenterId: fromCostCenterId, userId: req.user.id }
      });
      if (!isOwner) return res.status(403).json({ error: 'Forbidden: not an owner of the source cost center' });
    }

    const fromCenter = await prisma.costCenter.findUnique({ where: { id: fromCostCenterId } });
    if (!fromCenter) return res.status(404).json({ error: 'Source cost center not found' });
    if (Number(fromCenter.balance) < amount) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    const toCenter = await prisma.costCenter.findUnique({ where: { id: toCostCenterId } });
    if (!toCenter) return res.status(404).json({ error: 'Destination cost center not found' });

    const currency = await getCurrency();

    const result = await prisma.$transaction(async (tx) => {
      const updatedFrom = await tx.costCenter.update({
        where: { id: fromCostCenterId },
        data: { balance: { decrement: amount } }
      });

      const updatedTo = await tx.costCenter.update({
        where: { id: toCostCenterId },
        data: { balance: { increment: amount } }
      });

      const transaction = await tx.transaction.create({
        data: {
          type: 'transfer',
          amount,
          currency,
          fromCostCenterId,
          toCostCenterId,
          description,
          reference,
          status: 'completed',
          createdBy: req.user.id
        },
        include: {
          fromCostCenter: { select: { id: true, name: true } },
          toCostCenter: { select: { id: true, name: true } },
          creator: { select: { id: true, name: true } }
        }
      });

      return { transaction, updatedFrom, updatedTo };
    });

    const notifyTransfer = await getSetting('notify_on_transfer');
    if (notifyTransfer !== 'false') {
      const toOwners = await prisma.costCenterOwner.findMany({
        where: { costCenterId: toCostCenterId },
        include: { user: { select: { email: true } } }
      });
      for (const owner of toOwners) {
        await sendFundsTransferredEmail(owner.user.email, amount, currency, toCenter.name, fromCenter.name);
      }
    }

    await checkAndNotifyLowBalance(result.updatedFrom);

    await logAudit(req.user.id, 'TRANSFER', 'transaction', result.transaction.id,
      { amount, fromCostCenterId, toCostCenterId, description }, getClientIp(req));

    res.status(201).json(result.transaction);
  } catch (err) {
    console.error('Transfer error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/transactions/payment
router.post('/payment', authMiddleware, writeLimiter, async (req, res) => {
  const schema = z.object({
    fromCostCenterId: z.string().min(1),
    amount: z.number().positive(),
    description: z.string().min(1),
    reference: z.string().optional(),
    notes: z.string().optional()
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });

  const { fromCostCenterId, amount, description, reference, notes } = parsed.data;

  try {
    if (req.user.role !== 'super_admin') {
      const isOwner = await prisma.costCenterOwner.findFirst({
        where: { costCenterId: fromCostCenterId, userId: req.user.id }
      });
      if (!isOwner) return res.status(403).json({ error: 'Forbidden: not an owner of this cost center' });
    }

    const fromCenter = await prisma.costCenter.findUnique({ where: { id: fromCostCenterId } });
    if (!fromCenter) return res.status(404).json({ error: 'Cost center not found' });
    if (Number(fromCenter.balance) < amount) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    const currency = await getCurrency();
    const creator = await prisma.user.findUnique({ where: { id: req.user.id }, select: { name: true } });

    const result = await prisma.$transaction(async (tx) => {
      const updatedFrom = await tx.costCenter.update({
        where: { id: fromCostCenterId },
        data: { balance: { decrement: amount } }
      });

      const transaction = await tx.transaction.create({
        data: {
          type: 'payment',
          amount,
          currency,
          fromCostCenterId,
          description,
          reference,
          status: 'completed',
          createdBy: req.user.id
        }
      });

      const payment = await tx.payment.create({
        data: {
          transactionId: transaction.id,
          notes
        }
      });

      return { transaction, payment, updatedFrom };
    });

    const notifyPayment = await getSetting('notify_on_payment');
    if (notifyPayment !== 'false') {
      const admins = await prisma.user.findMany({
        where: { role: 'super_admin', isActive: true },
        select: { email: true }
      });
      for (const admin of admins) {
        await sendPaymentRecordedEmail(admin.email, amount, currency, fromCenter.name, description, creator?.name || req.user.email);
      }
    }

    await checkAndNotifyLowBalance(result.updatedFrom);

    await logAudit(req.user.id, 'PAYMENT_RECORDED', 'transaction', result.transaction.id,
      { amount, fromCostCenterId, description }, getClientIp(req));

    const full = await prisma.transaction.findUnique({
      where: { id: result.transaction.id },
      include: {
        fromCostCenter: { select: { id: true, name: true } },
        creator: { select: { id: true, name: true } },
        payment: true
      }
    });

    res.status(201).json(full);
  } catch (err) {
    console.error('Payment error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/transactions - list transactions
router.get('/', authMiddleware, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const where = {};

    if (req.user.role !== 'super_admin') {
      const owned = await prisma.costCenterOwner.findMany({
        where: { userId: req.user.id },
        select: { costCenterId: true }
      });
      const ids = owned.map(o => o.costCenterId);
      where.OR = [
        { fromCostCenterId: { in: ids } },
        { toCostCenterId: { in: ids } }
      ];
    }

    if (req.query.type) where.type = req.query.type;
    if (req.query.status) where.status = req.query.status;
    if (req.query.costCenterId) {
      where.OR = [
        { fromCostCenterId: req.query.costCenterId },
        { toCostCenterId: req.query.costCenterId }
      ];
    }

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        include: {
          creator: { select: { id: true, name: true } },
          fromCostCenter: { select: { id: true, name: true } },
          toCostCenter: { select: { id: true, name: true } },
          payment: true
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      }),
      prisma.transaction.count({ where })
    ]);

    res.json({
      data: transactions,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    });
  } catch (err) {
    console.error('List transactions error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/transactions/:id - get transaction detail
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const transaction = await prisma.transaction.findUnique({
      where: { id: req.params.id },
      include: {
        creator: { select: { id: true, name: true, email: true } },
        fromCostCenter: { select: { id: true, name: true } },
        toCostCenter: { select: { id: true, name: true } },
        payment: { include: { paidByUser: { select: { id: true, name: true } } } },
        fundRequest: true
      }
    });

    if (!transaction) return res.status(404).json({ error: 'Transaction not found' });

    if (req.user.role !== 'super_admin') {
      const owned = await prisma.costCenterOwner.findMany({
        where: { userId: req.user.id },
        select: { costCenterId: true }
      });
      const ids = owned.map(o => o.costCenterId);
      const hasAccess = (transaction.fromCostCenterId && ids.includes(transaction.fromCostCenterId)) ||
        (transaction.toCostCenterId && ids.includes(transaction.toCostCenterId));
      if (!hasAccess) return res.status(403).json({ error: 'Forbidden' });
    }

    res.json(transaction);
  } catch (err) {
    console.error('Get transaction error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
