const { Resend } = require('resend');
const prisma = require('./prisma');

async function getResendClient() {
  const setting = await prisma.setting.findUnique({ where: { key: 'resend_api_key' } });
  const apiKey = setting?.value || process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  return new Resend(apiKey);
}

async function getOrgName() {
  const setting = await prisma.setting.findUnique({ where: { key: 'org_name' } });
  return setting?.value || 'Foxtrot';
}

async function getFromEmail() {
  const setting = await prisma.setting.findUnique({ where: { key: 'resend_from_email' } });
  return setting?.value || process.env.RESEND_FROM_EMAIL || 'foxtrot@example.com';
}

function emailTemplate(orgName, title, content, actionUrl, actionLabel) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background: #fff; color: #0a0a0a; margin: 0; padding: 0; }
  .container { max-width: 560px; margin: 48px auto; padding: 0 24px; }
  .header { border-bottom: 2px solid #0a0a0a; padding-bottom: 16px; margin-bottom: 32px; }
  .org { font-size: 11px; font-weight: 700; letter-spacing: 3px; text-transform: uppercase; color: #666; }
  .title { font-size: 24px; font-weight: 800; letter-spacing: -0.5px; margin: 8px 0 0; }
  .body { font-size: 16px; line-height: 1.6; color: #0a0a0a; }
  .btn { display: inline-block; background: #0a0a0a; color: #fff !important; padding: 12px 24px; text-decoration: none; font-size: 13px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; margin-top: 24px; }
  .footer { margin-top: 48px; padding-top: 16px; border-top: 1px solid #e0e0e0; font-size: 12px; color: #666; }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <div class="org">${orgName}</div>
    <div class="title">${title}</div>
  </div>
  <div class="body">${content}</div>
  ${actionUrl ? `<a href="${actionUrl}" class="btn">${actionLabel || 'View'}</a>` : ''}
  <div class="footer">This is an automated message from ${orgName}. Do not reply to this email.</div>
</div>
</body>
</html>`;
}

async function sendEmail(to, subject, html) {
  const resend = await getResendClient();
  if (!resend) {
    console.log(`[Email skipped - no API key] To: ${to}, Subject: ${subject}`);
    return false;
  }
  const from = await getFromEmail();
  try {
    await resend.emails.send({ from, to, subject, html });
    return true;
  } catch (err) {
    console.error('Email send error:', err);
    return false;
  }
}

async function sendInviteEmail(to, inviteLink, inviterName) {
  const orgName = await getOrgName();
  const html = emailTemplate(
    orgName,
    'You\'ve been invited',
    `<p>${inviterName} has invited you to join ${orgName} on Foxtrot, the cost center management system.</p><p>Click the button below to set up your account. This link expires in 48 hours.</p>`,
    inviteLink,
    'Set Up Account'
  );
  return sendEmail(to, `You've been invited to ${orgName} on Foxtrot`, html);
}

async function sendPasswordResetEmail(to, resetLink) {
  const orgName = await getOrgName();
  const html = emailTemplate(
    orgName,
    'Reset Your Password',
    `<p>You requested a password reset. Click the button below to create a new password. This link expires in 1 hour.</p><p>If you didn't request this, you can safely ignore this email.</p>`,
    resetLink,
    'Reset Password'
  );
  return sendEmail(to, 'Reset your Foxtrot password', html);
}

async function sendFundsTransferredEmail(to, amount, currency, costCenterName, fromCenterName) {
  const orgName = await getOrgName();
  const html = emailTemplate(
    orgName,
    'Funds Transferred to Your Cost Center',
    `<p><strong>${currency} ${Number(amount).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</strong> has been transferred from <strong>${fromCenterName}</strong> to your cost center <strong>${costCenterName}</strong>.</p>`,
    process.env.APP_URL,
    'View Dashboard'
  );
  return sendEmail(to, `Funds transferred to ${costCenterName}`, html);
}

async function sendPaymentRecordedEmail(to, amount, currency, costCenterName, description, recordedBy) {
  const orgName = await getOrgName();
  const html = emailTemplate(
    orgName,
    'Payment Recorded',
    `<p>A payment of <strong>${currency} ${Number(amount).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</strong> has been recorded by <strong>${recordedBy}</strong> from cost center <strong>${costCenterName}</strong>.</p><p>Description: ${description}</p>`,
    `${process.env.APP_URL}/payments`,
    'View Payments'
  );
  return sendEmail(to, `Payment recorded: ${currency} ${Number(amount).toFixed(2)} from ${costCenterName}`, html);
}

async function sendFundRequestEmail(to, requesterName, costCenterName, amount, currency, urgency) {
  const orgName = await getOrgName();
  const html = emailTemplate(
    orgName,
    'Fund Request Submitted',
    `<p><strong>${requesterName}</strong> has requested <strong>${currency} ${Number(amount).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</strong> for cost center <strong>${costCenterName}</strong>.</p><p>Urgency: <strong>${urgency.toUpperCase()}</strong></p>`,
    `${process.env.APP_URL}/fund-requests`,
    'Review Request'
  );
  return sendEmail(to, `Fund request: ${currency} ${Number(amount).toFixed(2)} from ${costCenterName}`, html);
}

async function sendFundRequestReviewedEmail(to, status, amount, currency, note, reviewerName) {
  const orgName = await getOrgName();
  const approved = status === 'approved';
  const html = emailTemplate(
    orgName,
    `Fund Request ${approved ? 'Approved' : 'Rejected'}`,
    `<p>Your fund request for <strong>${currency} ${Number(amount).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</strong> has been <strong>${status}</strong> by ${reviewerName}.</p>${note ? `<p>Note: ${note}</p>` : ''}`,
    `${process.env.APP_URL}/fund-requests`,
    'View Details'
  );
  return sendEmail(to, `Fund request ${status}`, html);
}

async function sendLowBalanceEmail(to, costCenterName, balance, threshold, currency) {
  const orgName = await getOrgName();
  const html = emailTemplate(
    orgName,
    'Low Balance Warning',
    `<p>The balance for cost center <strong>${costCenterName}</strong> has fallen below the threshold of <strong>${currency} ${Number(threshold).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</strong>.</p><p>Current balance: <strong>${currency} ${Number(balance).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</strong></p>`,
    `${process.env.APP_URL}/cost-centers`,
    'View Cost Centers'
  );
  return sendEmail(to, `Low balance warning: ${costCenterName}`, html);
}

module.exports = {
  sendEmail,
  sendInviteEmail,
  sendPasswordResetEmail,
  sendFundsTransferredEmail,
  sendPaymentRecordedEmail,
  sendFundRequestEmail,
  sendFundRequestReviewedEmail,
  sendLowBalanceEmail,
  emailTemplate
};
