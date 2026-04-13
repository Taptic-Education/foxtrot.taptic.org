const express = require('express');
const prisma = require('../lib/prisma');
const { authMiddleware, superAdminOnly } = require('../middleware/auth');

const router = express.Router();

// GET /api/audit-log - list audit log (super_admin only)
router.get('/', authMiddleware, superAdminOnly, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const where = {};
    if (req.query.userId) where.userId = req.query.userId;
    if (req.query.action) where.action = { contains: req.query.action, mode: 'insensitive' };
    if (req.query.entityType) where.entityType = req.query.entityType;

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, email: true } }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      }),
      prisma.auditLog.count({ where })
    ]);

    res.json({
      data: logs,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    });
  } catch (err) {
    console.error('List audit log error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
