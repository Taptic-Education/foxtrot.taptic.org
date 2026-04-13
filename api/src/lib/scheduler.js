const prisma = require('./prisma');

function getNextRunDate(frequency, fromDate) {
  const next = new Date(fromDate);
  switch (frequency) {
    case 'daily':
      next.setDate(next.getDate() + 1);
      break;
    case 'weekly':
      next.setDate(next.getDate() + 7);
      break;
    case 'monthly':
      next.setMonth(next.getMonth() + 1);
      break;
  }
  return next;
}

async function getCurrency() {
  const s = await prisma.setting.findUnique({ where: { key: 'org_currency' } });
  return s?.value || 'ZAR';
}

async function executeScheduledTransfers() {
  const now = new Date();
  const due = await prisma.scheduledTransfer.findMany({
    where: {
      isActive: true,
      nextRunAt: { lte: now },
    },
    include: {
      fromCostCenter: true,
      toCostCenter: true,
    },
  });

  if (due.length === 0) return;

  const currency = await getCurrency();

  for (const st of due) {
    try {
      const fromBalance = Number(st.fromCostCenter.balance);
      const amount = Number(st.amount);

      if (fromBalance < amount) {
        console.log(`[Scheduler] Skipping transfer ${st.id}: insufficient balance (${fromBalance} < ${amount})`);
        continue;
      }

      await prisma.$transaction(async (tx) => {
        await tx.costCenter.update({
          where: { id: st.fromCostCenterId },
          data: { balance: { decrement: amount } },
        });
        await tx.costCenter.update({
          where: { id: st.toCostCenterId },
          data: { balance: { increment: amount } },
        });
        await tx.transaction.create({
          data: {
            type: 'transfer',
            amount,
            currency,
            fromCostCenterId: st.fromCostCenterId,
            toCostCenterId: st.toCostCenterId,
            description: `[Scheduled] ${st.description}`,
            status: 'completed',
            createdBy: st.createdBy,
          },
        });
      });

      const nextRun = getNextRunDate(st.frequency, st.nextRunAt);
      await prisma.scheduledTransfer.update({
        where: { id: st.id },
        data: { nextRunAt: nextRun },
      });

      console.log(`[Scheduler] Executed transfer ${st.id}: ${amount} from ${st.fromCostCenter.name} to ${st.toCostCenter.name}`);
    } catch (err) {
      console.error(`[Scheduler] Failed transfer ${st.id}:`, err);
    }
  }
}

let intervalId = null;

function startScheduler() {
  // Run every 60 seconds
  intervalId = setInterval(executeScheduledTransfers, 60 * 1000);
  // Run once on start
  executeScheduledTransfers();
  console.log('[Scheduler] Started scheduled transfers checker');
}

function stopScheduler() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

module.exports = { startScheduler, stopScheduler, executeScheduledTransfers };
