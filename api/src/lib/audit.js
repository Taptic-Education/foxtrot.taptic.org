const prisma = require('./prisma');

async function logAudit(userId, action, entityType, entityId, details, ipAddress) {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        entityType,
        entityId,
        details,
        ipAddress
      }
    });
  } catch (err) {
    console.error('Audit log error:', err);
  }
}

module.exports = { logAudit };
