require('dotenv').config();
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create Super Admins
  const adminHash = await bcrypt.hash('Admin123!', 12);
  const admin1 = await prisma.user.upsert({
    where: { email: 'admin@foxtrot.org' },
    update: {},
    create: {
      email: 'admin@foxtrot.org',
      passwordHash: adminHash,
      name: 'System Admin',
      role: 'super_admin',
      isActive: true
    }
  });

  const admin2 = await prisma.user.upsert({
    where: { email: 'finance@foxtrot.org' },
    update: {},
    create: {
      email: 'finance@foxtrot.org',
      passwordHash: adminHash,
      name: 'Finance Admin',
      role: 'super_admin',
      isActive: true
    }
  });

  // Create Cost Center Owners
  const ownerHash = await bcrypt.hash('Owner123!', 12);
  const owner1 = await prisma.user.upsert({
    where: { email: 'marketing@foxtrot.org' },
    update: {},
    create: {
      email: 'marketing@foxtrot.org',
      passwordHash: ownerHash,
      name: 'Marketing Manager',
      role: 'cost_center_owner',
      isActive: true,
      invitedBy: admin1.id
    }
  });

  const owner2 = await prisma.user.upsert({
    where: { email: 'engineering@foxtrot.org' },
    update: {},
    create: {
      email: 'engineering@foxtrot.org',
      passwordHash: ownerHash,
      name: 'Engineering Lead',
      role: 'cost_center_owner',
      isActive: true,
      invitedBy: admin1.id
    }
  });

  const owner3 = await prisma.user.upsert({
    where: { email: 'operations@foxtrot.org' },
    update: {},
    create: {
      email: 'operations@foxtrot.org',
      passwordHash: ownerHash,
      name: 'Operations Manager',
      role: 'cost_center_owner',
      isActive: true,
      invitedBy: admin1.id
    }
  });

  // Create Cost Centers
  const mainFund = await prisma.costCenter.upsert({
    where: { id: 'main-fund-seed-id-0000-000000000001' },
    update: {},
    create: {
      id: 'main-fund-seed-id-0000-000000000001',
      name: 'Main Fund',
      description: 'Primary organizational fund',
      balance: 500000,
      isMainFund: true,
      lowBalanceThreshold: 50000
    }
  });

  const marketing = await prisma.costCenter.upsert({
    where: { id: 'marketing-seed-id-0000-000000000002' },
    update: {},
    create: {
      id: 'marketing-seed-id-0000-000000000002',
      name: 'Marketing',
      description: 'Marketing department cost center',
      balance: 50000,
      lowBalanceThreshold: 5000
    }
  });

  const engineering = await prisma.costCenter.upsert({
    where: { id: 'engineering-seed-id-000-000000000003' },
    update: {},
    create: {
      id: 'engineering-seed-id-000-000000000003',
      name: 'Engineering',
      description: 'Engineering department cost center',
      balance: 75000,
      lowBalanceThreshold: 10000
    }
  });

  const operations = await prisma.costCenter.upsert({
    where: { id: 'operations-seed-id-0000-000000000004' },
    update: {},
    create: {
      id: 'operations-seed-id-0000-000000000004',
      name: 'Operations',
      description: 'Operations department cost center',
      balance: 30000,
      lowBalanceThreshold: 5000
    }
  });

  // Assign owners
  await prisma.costCenterOwner.upsert({
    where: { costCenterId_userId: { costCenterId: marketing.id, userId: owner1.id } },
    update: {},
    create: { costCenterId: marketing.id, userId: owner1.id, assignedBy: admin1.id }
  });

  await prisma.costCenterOwner.upsert({
    where: { costCenterId_userId: { costCenterId: engineering.id, userId: owner2.id } },
    update: {},
    create: { costCenterId: engineering.id, userId: owner2.id, assignedBy: admin1.id }
  });

  await prisma.costCenterOwner.upsert({
    where: { costCenterId_userId: { costCenterId: operations.id, userId: owner3.id } },
    update: {},
    create: { costCenterId: operations.id, userId: owner3.id, assignedBy: admin1.id }
  });

  // Create default settings
  const settings = [
    { key: 'org_name', value: 'Foxtrot' },
    { key: 'org_currency', value: 'ZAR' },
    { key: 'notify_on_payment', value: 'true' },
    { key: 'notify_on_fund_request', value: 'true' },
    { key: 'notify_on_transfer', value: 'true' },
    { key: 'notify_low_balance', value: 'true' },
    { key: 'low_balance_threshold', value: '0' }
  ];

  for (const s of settings) {
    await prisma.setting.upsert({
      where: { key: s.key },
      update: {},
      create: { key: s.key, value: s.value, updatedBy: admin1.id }
    });
  }

  // Create sample transactions
  const txBase = {
    currency: 'ZAR',
    status: 'completed',
    createdBy: admin1.id
  };

  const now = new Date();
  const months = [2, 1, 0]; // months ago

  const transactions = [];

  for (const m of months) {
    const d = new Date(now);
    d.setMonth(d.getMonth() - m);

    const topUp = await prisma.transaction.create({
      data: {
        ...txBase,
        type: 'top_up',
        amount: 100000,
        toCostCenterId: mainFund.id,
        description: `Monthly budget allocation`,
        createdAt: d
      }
    });
    transactions.push(topUp);

    const transfer1 = await prisma.transaction.create({
      data: {
        ...txBase,
        type: 'transfer',
        amount: 30000,
        fromCostCenterId: mainFund.id,
        toCostCenterId: marketing.id,
        description: `Marketing budget transfer`,
        createdAt: d
      }
    });
    transactions.push(transfer1);

    const transfer2 = await prisma.transaction.create({
      data: {
        ...txBase,
        type: 'transfer',
        amount: 40000,
        fromCostCenterId: mainFund.id,
        toCostCenterId: engineering.id,
        description: `Engineering budget transfer`,
        createdAt: d
      }
    });
    transactions.push(transfer2);
  }

  // Create payments
  const payment1Tx = await prisma.transaction.create({
    data: {
      ...txBase,
      type: 'payment',
      amount: 15000,
      fromCostCenterId: marketing.id,
      description: 'Digital advertising campaign - Q1',
      reference: 'INV-2024-001'
    }
  });
  await prisma.payment.create({
    data: {
      transactionId: payment1Tx.id,
      bankPaid: true,
      bankPaidAt: new Date(),
      bankPaidBy: admin1.id,
      notes: 'Paid via bank transfer'
    }
  });

  const payment2Tx = await prisma.transaction.create({
    data: {
      ...txBase,
      type: 'payment',
      amount: 8500,
      fromCostCenterId: engineering.id,
      description: 'AWS infrastructure costs - March',
      reference: 'AWS-2024-03'
    }
  });
  await prisma.payment.create({
    data: {
      transactionId: payment2Tx.id,
      bankPaid: true,
      bankPaidAt: new Date(),
      bankPaidBy: admin2.id,
      notes: 'Auto-charged'
    }
  });

  const payment3Tx = await prisma.transaction.create({
    data: {
      ...txBase,
      type: 'payment',
      amount: 5200,
      fromCostCenterId: operations.id,
      description: 'Office supplies and utilities',
      reference: 'OPS-2024-Q1'
    }
  });
  await prisma.payment.create({
    data: {
      transactionId: payment3Tx.id,
      bankPaid: false,
      notes: 'Pending bank confirmation'
    }
  });

  // Create a pending fund request
  await prisma.fundRequest.create({
    data: {
      costCenterId: marketing.id,
      requestedBy: owner1.id,
      amount: 25000,
      justification: 'Additional budget needed for Q2 product launch campaign. Campaign includes social media advertising, influencer partnerships, and event sponsorship.',
      urgency: 'high',
      status: 'pending'
    }
  });

  console.log('Seeding completed!');
  console.log('\nSeed credentials:');
  console.log('Super Admin 1: admin@foxtrot.org / Admin123!');
  console.log('Super Admin 2: finance@foxtrot.org / Admin123!');
  console.log('Marketing Owner: marketing@foxtrot.org / Owner123!');
  console.log('Engineering Owner: engineering@foxtrot.org / Owner123!');
  console.log('Operations Owner: operations@foxtrot.org / Owner123!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
