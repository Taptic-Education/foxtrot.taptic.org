const express = require('express');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const { logAudit } = require('../lib/audit');
const { authMiddleware, superAdminOnly, getClientIp } = require('../middleware/auth');
const { writeLimiter } = require('../middleware/security');

const router = express.Router();

// GET /api/scheduled-transfers - list scheduled transfers
router.get('/', authMiddleware, superAdminOnly, async (req, res) => {
  try {
    const transfers = await prisma.scheduledTransfer.findMany({
      include: {
        fromCostCenter: { select: { id: true, name: true } },
        toCostCenter: { select: { id: true, name: true } },
        creator: { select: { id: true, name: true } },
      },
      orderBy: { nextRunAt: 'asc' },
    });
    res.json(transfers);
  } catch (err) {
    console.error('List scheduled transfers error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/scheduled-transfers - create scheduled transfer
router.post('/', authMiddleware, superAdminOnly, writeLimiter, async (req, res) => {
  const schema = z.object({
    fromCostCenterId: z.string().min(1),
    toCostCenterId: z.string().min(1),
    amount: z.number().positive(),
    description: z.string().min(1),
    frequency: z.enum(['daily', 'weekly', 'monthly']),
    nextRunAt: z.string().refine((v) => !isNaN(Date.parse(v)), 'Invalid date'),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });

  try {
    const { fromCostCenterId, toCostCenterId, amount, description, frequency, nextRunAt } = parsed.data;

    if (fromCostCenterId === toCostCenterId) {
      return res.status(400).json({ error: 'Source and destination must be different' });
    }

    const [from, to] = await Promise.all([
      prisma.costCenter.findUnique({ where: { id: fromCostCenterId } }),
      prisma.costCenter.findUnique({ where: { id: toCostCenterId } }),
    ]);
    if (!from || !to) return res.status(404).json({ error: 'Cost center not found' });

    const transfer = await prisma.scheduledTransfer.create({
      data: {
        fromCostCenterId,
        toCostCenterId,
        amount,
        description,
        frequency,
        nextRunAt: new Date(nextRunAt),
        createdBy: req.user.id,
      },
      include: {
        fromCostCenter: { select: { id: true, name: true } },
        toCostCenter: { select: { id: true, name: true } },
        creator: { select: { id: true, name: true } },
      },
    });

    await logAudit(req.user.id, 'SCHEDULED_TRANSFER_CREATED', 'scheduled_transfer', transfer.id,
      { fromCostCenterId, toCostCenterId, amount, frequency }, getClientIp(req));

    res.status(201).json(transfer);
  } catch (err) {
    console.error('Create scheduled transfer error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/scheduled-transfers/:id - update (toggle active, change params)
router.patch('/:id', authMiddleware, superAdminOnly, writeLimiter, async (req, res) => {
  const schema = z.object({
    amount: z.number().positive().optional(),
    description: z.string().min(1).optional(),
    frequency: z.enum(['daily', 'weekly', 'monthly']).optional(),
    nextRunAt: z.string().refine((v) => !isNaN(Date.parse(v)), 'Invalid date').optional(),
    isActive: z.boolean().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });

  try {
    const existing = await prisma.scheduledTransfer.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Scheduled transfer not found' });

    const updateData = {};
    if (parsed.data.amount !== undefined) updateData.amount = parsed.data.amount;
    if (parsed.data.description !== undefined) updateData.description = parsed.data.description;
    if (parsed.data.frequency !== undefined) updateData.frequency = parsed.data.frequency;
    if (parsed.data.nextRunAt !== undefined) updateData.nextRunAt = new Date(parsed.data.nextRunAt);
    if (parsed.data.isActive !== undefined) updateData.isActive = parsed.data.isActive;

    const transfer = await prisma.scheduledTransfer.update({
      where: { id: req.params.id },
      data: updateData,
      include: {
        fromCostCenter: { select: { id: true, name: true } },
        toCostCenter: { select: { id: true, name: true } },
        creator: { select: { id: true, name: true } },
      },
    });

    await logAudit(req.user.id, 'SCHEDULED_TRANSFER_UPDATED', 'scheduled_transfer', transfer.id,
      updateData, getClientIp(req));

    res.json(transfer);
  } catch (err) {
    console.error('Update scheduled transfer error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/scheduled-transfers/:id - delete
router.delete('/:id', authMiddleware, superAdminOnly, writeLimiter, async (req, res) => {
  try {
    const existing = await prisma.scheduledTransfer.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Scheduled transfer not found' });

    await prisma.scheduledTransfer.delete({ where: { id: req.params.id } });

    await logAudit(req.user.id, 'SCHEDULED_TRANSFER_DELETED', 'scheduled_transfer', req.params.id,
      {}, getClientIp(req));

    res.json({ message: 'Scheduled transfer deleted' });
  } catch (err) {
    console.error('Delete scheduled transfer error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
