const express = require('express');
const prisma = require('../lib/prisma');
const { authMiddleware } = require('../middleware/auth');
const { startOfMonth, endOfMonth } = require('../lib/dateUtils');

const router = express.Router();

// GET /api/dashboard/summary
router.get('/summary', authMiddleware, async (req, res) => {
  try {
    const now = new Date();
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);

    if (req.user.role === 'super_admin') {
      const [costCenters, pendingPayments, monthlySpend] = await Promise.all([
        prisma.costCenter.findMany({
          where: { status: 'active' },
          select: { id: true, balance: true, isMainFund: true, name: true }
        }),
        prisma.payment.count({ where: { bankPaid: false } }),
        prisma.transaction.aggregate({
          where: {
            type: 'payment',
            createdAt: { gte: monthStart, lte: monthEnd }
          },
          _sum: { amount: true }
        })
      ]);

      const totalBalance = costCenters.reduce((sum, cc) => sum + Number(cc.balance), 0);
      const mainFund = costCenters.find(cc => cc.isMainFund);

      // Pending fund requests
      const pendingRequests = await prisma.fundRequest.count({ where: { status: 'pending' } });

      res.json({
        totalBalance,
        mainFundBalance: mainFund ? Number(mainFund.balance) : 0,
        pendingPayments,
        pendingRequests,
        monthlySpend: Number(monthlySpend._sum.amount) || 0,
        costCenterCount: costCenters.filter(cc => !cc.isMainFund).length
      });
    } else {
      // Cost center owner
      const owned = await prisma.costCenterOwner.findMany({
        where: { userId: req.user.id },
        include: {
          costCenter: {
            select: { id: true, name: true, balance: true, status: true }
          }
        }
      });

      const ccIds = owned.map(o => o.costCenterId);

      const monthlySpend = await prisma.transaction.aggregate({
        where: {
          type: 'payment',
          fromCostCenterId: { in: ccIds },
          createdAt: { gte: monthStart, lte: monthEnd }
        },
        _sum: { amount: true }
      });

      res.json({
        costCenters: owned.map(o => o.costCenter),
        totalBalance: owned.reduce((sum, o) => sum + Number(o.costCenter.balance), 0),
        monthlySpend: Number(monthlySpend._sum.amount) || 0
      });
    }
  } catch (err) {
    console.error('Dashboard summary error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
