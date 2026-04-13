const express = require('express');
const { json2csv } = require('json-2-csv');
const prisma = require('../lib/prisma');
const { authMiddleware, superAdminOnly } = require('../middleware/auth');

const router = express.Router();

async function getCurrency() {
  const s = await prisma.setting.findUnique({ where: { key: 'org_currency' } });
  return s?.value || 'ZAR';
}

// GET /api/reports/monthly-summary
router.get('/monthly-summary', authMiddleware, async (req, res) => {
  try {
    const year = parseInt(req.query.year) || new Date().getFullYear();

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

    where.createdAt = {
      gte: new Date(`${year}-01-01T00:00:00.000Z`),
      lt: new Date(`${year + 1}-01-01T00:00:00.000Z`)
    };

    const transactions = await prisma.transaction.findMany({
      where,
      select: { type: true, amount: true, createdAt: true }
    });

    const months = {};
    for (let m = 1; m <= 12; m++) {
      const key = `${year}-${String(m).padStart(2, '0')}`;
      months[key] = { month: key, top_up: 0, transfer: 0, payment: 0, adjustment: 0, total: 0 };
    }

    for (const tx of transactions) {
      const d = new Date(tx.createdAt);
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      if (months[key]) {
        months[key][tx.type] += Number(tx.amount);
        months[key].total += Number(tx.amount);
      }
    }

    const currency = await getCurrency();

    res.json({
      year,
      currency,
      data: Object.values(months)
    });
  } catch (err) {
    console.error('Monthly summary error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/reports/cost-center-comparison
router.get('/cost-center-comparison', authMiddleware, async (req, res) => {
  try {
    const now = new Date();
    const year = parseInt(req.query.year) || now.getUTCFullYear();
    const month = parseInt(req.query.month) || now.getUTCMonth() + 1;

    const startDate = new Date(`${year}-${String(month).padStart(2, '0')}-01T00:00:00.000Z`);
    const endDate = new Date(startDate);
    endDate.setUTCMonth(endDate.getUTCMonth() + 1);

    const where = {
      createdAt: { gte: startDate, lt: endDate }
    };

    if (req.user.role !== 'super_admin') {
      const owned = await prisma.costCenterOwner.findMany({
        where: { userId: req.user.id },
        select: { costCenterId: true }
      });
      const ids = owned.map(o => o.costCenterId);
      where.fromCostCenterId = { in: ids };
    }

    const costCenters = await prisma.costCenter.findMany({
      where: req.user.role !== 'super_admin' ? {
        owners: { some: { userId: req.user.id } }
      } : {},
      select: { id: true, name: true, balance: true }
    });

    const payments = await prisma.transaction.groupBy({
      by: ['fromCostCenterId'],
      where: { ...where, type: 'payment' },
      _sum: { amount: true }
    });

    const transfers = await prisma.transaction.groupBy({
      by: ['fromCostCenterId'],
      where: { ...where, type: 'transfer' },
      _sum: { amount: true }
    });

    const paymentMap = {};
    for (const p of payments) {
      if (p.fromCostCenterId) paymentMap[p.fromCostCenterId] = Number(p._sum.amount) || 0;
    }
    const transferMap = {};
    for (const t of transfers) {
      if (t.fromCostCenterId) transferMap[t.fromCostCenterId] = Number(t._sum.amount) || 0;
    }

    const currency = await getCurrency();

    res.json({
      year,
      month,
      currency,
      data: costCenters.map(cc => ({
        id: cc.id,
        name: cc.name,
        balance: Number(cc.balance),
        payments: paymentMap[cc.id] || 0,
        transfers: transferMap[cc.id] || 0,
        totalSpend: (paymentMap[cc.id] || 0) + (transferMap[cc.id] || 0)
      }))
    });
  } catch (err) {
    console.error('Cost center comparison error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/reports/export
router.get('/export', authMiddleware, superAdminOnly, async (req, res) => {
  try {
    const where = {};
    if (req.query.type) where.type = req.query.type;
    if (req.query.from) where.createdAt = { ...where.createdAt, gte: new Date(req.query.from) };
    if (req.query.to) where.createdAt = { ...where.createdAt, lte: new Date(req.query.to) };

    const transactions = await prisma.transaction.findMany({
      where,
      include: {
        fromCostCenter: { select: { name: true } },
        toCostCenter: { select: { name: true } },
        creator: { select: { name: true, email: true } },
        payment: true
      },
      orderBy: { createdAt: 'desc' }
    });

    const rows = transactions.map(tx => ({
      id: tx.id,
      type: tx.type,
      amount: Number(tx.amount),
      currency: tx.currency,
      from_cost_center: tx.fromCostCenter?.name || '',
      to_cost_center: tx.toCostCenter?.name || '',
      description: tx.description,
      reference: tx.reference || '',
      status: tx.status,
      created_by: tx.creator?.name || tx.creator?.email || '',
      created_at: tx.createdAt.toISOString(),
      bank_paid: tx.payment ? (tx.payment.bankPaid ? 'Yes' : 'No') : '',
      bank_paid_at: tx.payment?.bankPaidAt ? new Date(tx.payment.bankPaidAt).toISOString() : ''
    }));

    const csv = await json2csv(rows);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="transactions-${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csv);
  } catch (err) {
    console.error('Export error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
