const prisma = require('./prisma');

/**
 * Read Microsoft SSO configuration from the database settings,
 * falling back to environment variables for backwards compatibility.
 */
async function getMicrosoftConfig() {
  const keys = ['microsoft_client_id', 'microsoft_client_secret', 'microsoft_tenant_id'];
  const rows = await prisma.setting.findMany({ where: { key: { in: keys } } });
  const map = {};
  for (const row of rows) {
    map[row.key] = row.value;
  }

  const clientId = map.microsoft_client_id || process.env.MICROSOFT_CLIENT_ID || '';
  const clientSecret = map.microsoft_client_secret || process.env.MICROSOFT_CLIENT_SECRET || '';
  const tenantId = map.microsoft_tenant_id || process.env.MICROSOFT_TENANT_ID || '';

  const isConfigured = !!(clientId && clientSecret && tenantId);

  return { clientId, clientSecret, tenantId, isConfigured };
}

module.exports = { getMicrosoftConfig };
