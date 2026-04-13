const express = require('express');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const { logAudit } = require('../lib/audit');
const { authMiddleware, superAdminOnly, getClientIp } = require('../middleware/auth');
const { writeLimiter } = require('../middleware/security');

const router = express.Router();

// GET /api/payments - list all payments (super_admin only)
router.get('/', authMiddleware, superAdminOnly, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const where = {};
    if (req.query.bankPaid !== undefined) {
      where.bankPaid = req.query.bankPaid === 'true';
    }

    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        include: {
          transaction: {
            include: {
              fromCostCenter: { select: { id: true, name: true } },
              creator: { select: { id: true, name: true } }
            }
          },
          paidByUser: { select: { id: true, name: true } }
        },
        orderBy: { transaction: { createdAt: 'desc' } },
        skip,
        take: limit
      }),
      prisma.payment.count({ where })
    ]);

    res.json({
      data: payments,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    });
  } catch (err) {
    console.error('List payments error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/payments/:id/mark-paid - mark payment as paid from bank (super_admin only)
router.patch('/:id/mark-paid', authMiddleware, superAdminOnly, writeLimiter, async (req, res) => {
  const schema = z.object({
    notes: z.string().optional()
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });

  try {
    const payment = await prisma.payment.findUnique({
      where: { id: req.params.id },
      include: { transaction: true }
    });

    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    if (payment.bankPaid) return res.status(400).json({ error: 'Payment already marked as paid' });

    const updated = await prisma.payment.update({
      where: { id: req.params.id },
      data: {
        bankPaid: true,
        bankPaidAt: new Date(),
        bankPaidBy: req.user.id,
        notes: parsed.data.notes
      },
      include: {
        transaction: {
          include: {
            fromCostCenter: { select: { id: true, name: true } },
            creator: { select: { id: true, name: true } }
          }
        },
        paidByUser: { select: { id: true, name: true } }
      }
    });

    await logAudit(req.user.id, 'PAYMENT_BANK_PAID', 'payment', req.params.id,
      { transactionId: payment.transactionId }, getClientIp(req));

    res.json(updated);
  } catch (err) {
    console.error('Mark paid error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
