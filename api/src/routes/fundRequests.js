const express = require('express');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const { logAudit } = require('../lib/audit');
const { authMiddleware, superAdminOnly, getClientIp } = require('../middleware/auth');
const { writeLimiter } = require('../middleware/security');
const { sendFundRequestEmail, sendFundRequestReviewedEmail } = require('../lib/email');

const router = express.Router();

async function getSetting(key) {
  const s = await prisma.setting.findUnique({ where: { key } });
  return s?.value;
}

async function getCurrency() {
  return (await getSetting('org_currency')) || 'ZAR';
}

// GET /api/fund-requests - list fund requests
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
      where.OR = [
        { requestedBy: req.user.id },
        { costCenterId: { in: owned.map(o => o.costCenterId) } }
      ];
    }

    if (req.query.status) where.status = req.query.status;
    if (req.query.costCenterId) where.costCenterId = req.query.costCenterId;

    const [requests, total] = await Promise.all([
      prisma.fundRequest.findMany({
        where,
        include: {
          costCenter: { select: { id: true, name: true } },
          requester: { select: { id: true, name: true, email: true } },
          reviewer: { select: { id: true, name: true } },
          resultingTransaction: true
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      }),
      prisma.fundRequest.count({ where })
    ]);

    res.json({
      data: requests,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    });
  } catch (err) {
    console.error('List fund requests error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/fund-requests - submit a fund request
router.post('/', authMiddleware, writeLimiter, async (req, res) => {
  const schema = z.object({
    costCenterId: z.string().min(1),
    amount: z.number().positive(),
    justification: z.string().min(1),
    urgency: z.enum(['low', 'medium', 'high']).default('medium'),
    beneficiaryName: z.string().min(1).optional(),
    beneficiaryBank: z.string().min(1).optional(),
    beneficiaryAccount: z.string().min(1).optional(),
    beneficiaryRef: z.string().optional()
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });

  try {
    const { costCenterId, amount, justification, urgency, beneficiaryName, beneficiaryBank, beneficiaryAccount, beneficiaryRef } = parsed.data;

    if (req.user.role !== 'super_admin') {
      const isOwner = await prisma.costCenterOwner.findFirst({
        where: { costCenterId, userId: req.user.id }
      });
      if (!isOwner) return res.status(403).json({ error: 'Forbidden: not an owner of this cost center' });
    }

    const costCenter = await prisma.costCenter.findUnique({ where: { id: costCenterId } });
    if (!costCenter) return res.status(404).json({ error: 'Cost center not found' });

    const requester = await prisma.user.findUnique({ where: { id: req.user.id } });

    const request = await prisma.fundRequest.create({
      data: {
        costCenterId,
        requestedBy: req.user.id,
        amount,
        justification,
        urgency,
        beneficiaryName: beneficiaryName || null,
        beneficiaryBank: beneficiaryBank || null,
        beneficiaryAccount: beneficiaryAccount || null,
        beneficiaryRef: beneficiaryRef || null
      },
      include: {
        costCenter: { select: { id: true, name: true } },
        requester: { select: { id: true, name: true, email: true } }
      }
    });

    const notifyFundRequest = await getSetting('notify_on_fund_request');
    if (notifyFundRequest !== 'false') {
      const currency = await getCurrency();
      const admins = await prisma.user.findMany({
        where: { role: 'super_admin', isActive: true },
        select: { email: true }
      });
      for (const admin of admins) {
        await sendFundRequestEmail(admin.email, requester?.name || req.user.email, costCenter.name, amount, currency, urgency);
      }
    }

    await logAudit(req.user.id, 'FUND_REQUEST_SUBMITTED', 'fund_request', request.id,
      { amount, costCenterId, urgency }, getClientIp(req));

    res.status(201).json(request);
  } catch (err) {
    console.error('Submit fund request error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/fund-requests/:id/approve (super_admin only)
router.patch('/:id/approve', authMiddleware, superAdminOnly, writeLimiter, async (req, res) => {
  const schema = z.object({
    reviewNote: z.string().optional(),
    transferFromCostCenterId: z.string().optional()
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });

  try {
    const request = await prisma.fundRequest.findUnique({
      where: { id: req.params.id },
      include: {
        costCenter: true,
        requester: { select: { email: true, name: true } }
      }
    });

    if (!request) return res.status(404).json({ error: 'Fund request not found' });
    if (request.status !== 'pending') return res.status(400).json({ error: 'Request is not pending' });

    const currency = await getCurrency();
    const { reviewNote, transferFromCostCenterId } = parsed.data;

    let resultingTransactionId = null;

    if (transferFromCostCenterId) {
      const fromCenter = await prisma.costCenter.findUnique({ where: { id: transferFromCostCenterId } });
      if (!fromCenter) return res.status(404).json({ error: 'Source cost center not found' });
      if (Number(fromCenter.balance) < Number(request.amount)) {
        return res.status(400).json({ error: 'Insufficient balance in source cost center' });
      }

      const txResult = await prisma.$transaction(async (tx) => {
        await tx.costCenter.update({
          where: { id: transferFromCostCenterId },
          data: { balance: { decrement: Number(request.amount) } }
        });
        await tx.costCenter.update({
          where: { id: request.costCenterId },
          data: { balance: { increment: Number(request.amount) } }
        });
        return tx.transaction.create({
          data: {
            type: 'transfer',
            amount: Number(request.amount),
            currency,
            fromCostCenterId: transferFromCostCenterId,
            toCostCenterId: request.costCenterId,
            description: `Fund request approved: ${request.justification}`,
            status: 'completed',
            createdBy: req.user.id
          }
        });
      });
      resultingTransactionId = txResult.id;
    }

    const updated = await prisma.fundRequest.update({
      where: { id: req.params.id },
      data: {
        status: 'approved',
        reviewedBy: req.user.id,
        reviewNote,
        resultingTransactionId
      },
      include: {
        costCenter: { select: { id: true, name: true } },
        requester: { select: { id: true, name: true, email: true } },
        reviewer: { select: { id: true, name: true } },
        resultingTransaction: true
      }
    });

    const reviewer = await prisma.user.findUnique({ where: { id: req.user.id }, select: { name: true } });
    await sendFundRequestReviewedEmail(request.requester.email, 'approved', Number(request.amount), currency, reviewNote, reviewer?.name || 'Admin');

    await logAudit(req.user.id, 'FUND_REQUEST_APPROVED', 'fund_request', req.params.id,
      { amount: request.amount, costCenterId: request.costCenterId }, getClientIp(req));

    res.json(updated);
  } catch (err) {
    console.error('Approve fund request error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/fund-requests/:id/reject (super_admin only)
router.patch('/:id/reject', authMiddleware, superAdminOnly, writeLimiter, async (req, res) => {
  const schema = z.object({
    reviewNote: z.string().min(1)
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Review note is required when rejecting' });

  try {
    const request = await prisma.fundRequest.findUnique({
      where: { id: req.params.id },
      include: {
        requester: { select: { email: true } }
      }
    });

    if (!request) return res.status(404).json({ error: 'Fund request not found' });
    if (request.status !== 'pending') return res.status(400).json({ error: 'Request is not pending' });

    const currency = await getCurrency();

    const updated = await prisma.fundRequest.update({
      where: { id: req.params.id },
      data: {
        status: 'rejected',
        reviewedBy: req.user.id,
        reviewNote: parsed.data.reviewNote
      },
      include: {
        costCenter: { select: { id: true, name: true } },
        requester: { select: { id: true, name: true, email: true } },
        reviewer: { select: { id: true, name: true } }
      }
    });

    const reviewer = await prisma.user.findUnique({ where: { id: req.user.id }, select: { name: true } });
    await sendFundRequestReviewedEmail(request.requester.email, 'rejected', Number(request.amount), currency, parsed.data.reviewNote, reviewer?.name || 'Admin');

    await logAudit(req.user.id, 'FUND_REQUEST_REJECTED', 'fund_request', req.params.id,
      { reviewNote: parsed.data.reviewNote }, getClientIp(req));

    res.json(updated);
  } catch (err) {
    console.error('Reject fund request error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
