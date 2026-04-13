const express = require('express');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const { logAudit } = require('../lib/audit');
const { authMiddleware, superAdminOnly, getClientIp } = require('../middleware/auth');

const router = express.Router();

// GET /api/cost-centers - list cost centers
router.get('/', authMiddleware, async (req, res) => {
  try {
    const where = {};
    if (req.user.role !== 'super_admin') {
      const owned = await prisma.costCenterOwner.findMany({
        where: { userId: req.user.id },
        select: { costCenterId: true }
      });
      where.id = { in: owned.map(o => o.costCenterId) };
    }

    if (req.query.status) {
      where.status = req.query.status;
    }

    const costCenters = await prisma.costCenter.findMany({
      where,
      include: {
        owners: {
          include: {
            user: { select: { id: true, name: true, email: true } }
          }
        }
      },
      orderBy: [{ isMainFund: 'desc' }, { name: 'asc' }]
    });

    res.json(costCenters);
  } catch (err) {
    console.error('List cost centers error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/cost-centers - create cost center (super_admin only)
router.post('/', authMiddleware, superAdminOnly, async (req, res) => {
  const schema = z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    isMainFund: z.boolean().default(false),
    lowBalanceThreshold: z.number().min(0).default(0),
    ownerIds: z.array(z.string()).optional()
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });

  try {
    const { ownerIds, ...data } = parsed.data;

    const costCenter = await prisma.costCenter.create({
      data: {
        ...data,
        owners: ownerIds && ownerIds.length > 0 ? {
          create: ownerIds.map(userId => ({
            userId,
            assignedBy: req.user.id
          }))
        } : undefined
      },
      include: {
        owners: {
          include: { user: { select: { id: true, name: true, email: true } } }
        }
      }
    });

    await logAudit(req.user.id, 'COST_CENTER_CREATED', 'cost_center', costCenter.id, { name: costCenter.name }, getClientIp(req));

    res.status(201).json(costCenter);
  } catch (err) {
    console.error('Create cost center error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/cost-centers/:id - get cost center detail
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const costCenter = await prisma.costCenter.findUnique({
      where: { id: req.params.id },
      include: {
        owners: {
          include: { user: { select: { id: true, name: true, email: true } } }
        }
      }
    });

    if (!costCenter) return res.status(404).json({ error: 'Cost center not found' });

    if (req.user.role !== 'super_admin') {
      const isOwner = costCenter.owners.some(o => o.userId === req.user.id);
      if (!isOwner) return res.status(403).json({ error: 'Forbidden' });
    }

    res.json(costCenter);
  } catch (err) {
    console.error('Get cost center error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/cost-centers/:id - update cost center (super_admin only)
router.patch('/:id', authMiddleware, superAdminOnly, async (req, res) => {
  const schema = z.object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    status: z.enum(['active', 'archived']).optional(),
    lowBalanceThreshold: z.number().min(0).optional(),
    isMainFund: z.boolean().optional(),
    ownerIds: z.array(z.string()).optional()
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });

  try {
    const existing = await prisma.costCenter.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Cost center not found' });

    const { ownerIds, ...updateData } = parsed.data;

    const costCenter = await prisma.costCenter.update({
      where: { id: req.params.id },
      data: updateData,
      include: {
        owners: {
          include: { user: { select: { id: true, name: true, email: true } } }
        }
      }
    });

    if (ownerIds !== undefined) {
      await prisma.costCenterOwner.deleteMany({ where: { costCenterId: req.params.id } });
      if (ownerIds.length > 0) {
        await prisma.costCenterOwner.createMany({
          data: ownerIds.map(userId => ({
            costCenterId: req.params.id,
            userId,
            assignedBy: req.user.id
          })),
          skipDuplicates: true
        });
      }
    }

    await logAudit(req.user.id, 'COST_CENTER_UPDATED', 'cost_center', req.params.id, parsed.data, getClientIp(req));

    const refreshed = await prisma.costCenter.findUnique({
      where: { id: req.params.id },
      include: {
        owners: {
          include: { user: { select: { id: true, name: true, email: true } } }
        }
      }
    });

    res.json(refreshed);
  } catch (err) {
    console.error('Update cost center error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/cost-centers/:id/transactions - get transactions for a cost center
router.get('/:id/transactions', authMiddleware, async (req, res) => {
  try {
    const costCenter = await prisma.costCenter.findUnique({ where: { id: req.params.id } });
    if (!costCenter) return res.status(404).json({ error: 'Cost center not found' });

    if (req.user.role !== 'super_admin') {
      const isOwner = await prisma.costCenterOwner.findFirst({
        where: { costCenterId: req.params.id, userId: req.user.id }
      });
      if (!isOwner) return res.status(403).json({ error: 'Forbidden' });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const where = {
      OR: [
        { fromCostCenterId: req.params.id },
        { toCostCenterId: req.params.id }
      ]
    };

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
    console.error('Get cost center transactions error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
