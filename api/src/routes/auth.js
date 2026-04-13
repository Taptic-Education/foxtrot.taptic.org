const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const prisma = require('../lib/prisma');
const { sendPasswordResetEmail, sendInviteEmail } = require('../lib/email');
const { logAudit } = require('../lib/audit');
const { authMiddleware, getClientIp } = require('../middleware/auth');
const { getMicrosoftConfig } = require('../lib/microsoftAuth');

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { error: 'Too many attempts, please try again later' }
});

function generateTokens(user) {
  const accessToken = jwt.sign(
    { id: user.id, email: user.email, role: user.role, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '15m' }
  );
  const refreshToken = crypto.randomBytes(64).toString('hex');
  return { accessToken, refreshToken };
}

function setTokenCookies(res, accessToken, refreshToken) {
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie('access_token', accessToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'strict' : 'lax',
    maxAge: 15 * 60 * 1000
  });
  res.cookie('refresh_token', refreshToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'strict' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/api/auth/refresh'
  });
}

// POST /api/auth/login
router.post('/login', authLimiter, async (req, res) => {
  const schema = z.object({
    email: z.string().email(),
    password: z.string().min(1)
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });

  const { email, password } = parsed.data;

  try {
    // Check if SSO-only mode is enabled
    const forceSso = await prisma.setting.findUnique({ where: { key: 'force_sso_only' } });
    if (forceSso?.value === 'true') {
      return res.status(403).json({ error: 'Password login is disabled. Please use Microsoft SSO to sign in.' });
    }

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user || !user.isActive) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const { accessToken, refreshToken } = generateTokens(user);

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await prisma.refreshToken.create({
      data: { userId: user.id, token: refreshToken, expiresAt }
    });

    setTokenCookies(res, accessToken, refreshToken);

    await logAudit(user.id, 'LOGIN', 'user', user.id, { email }, getClientIp(req));

    res.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/logout
router.post('/logout', authMiddleware, async (req, res) => {
  try {
    const refreshToken = req.cookies.refresh_token;
    if (refreshToken) {
      await prisma.refreshToken.deleteMany({ where: { token: refreshToken } });
    }
    res.clearCookie('access_token');
    res.clearCookie('refresh_token', { path: '/api/auth/refresh' });
    await logAudit(req.user.id, 'LOGOUT', 'user', req.user.id, {}, getClientIp(req));
    res.json({ message: 'Logged out' });
  } catch (err) {
    console.error('Logout error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/refresh
router.post('/refresh', async (req, res) => {
  try {
    const refreshToken = req.cookies.refresh_token;
    if (!refreshToken) return res.status(401).json({ error: 'No refresh token' });

    const stored = await prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true }
    });

    if (!stored || stored.expiresAt < new Date() || !stored.user.isActive) {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    await prisma.refreshToken.delete({ where: { id: stored.id } });

    const { accessToken, refreshToken: newRefreshToken } = generateTokens(stored.user);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await prisma.refreshToken.create({
      data: { userId: stored.user.id, token: newRefreshToken, expiresAt }
    });

    setTokenCookies(res, accessToken, newRefreshToken);
    res.json({ message: 'Token refreshed' });
  } catch (err) {
    console.error('Refresh error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', authLimiter, async (req, res) => {
  const schema = z.object({ email: z.string().email() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid email' });

  try {
    const user = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });

    if (user && user.isActive) {
      const token = crypto.randomBytes(32).toString('hex');
      await prisma.user.update({
        where: { id: user.id },
        data: { resetToken: token, resetExpiry: new Date(Date.now() + 60 * 60 * 1000) }
      });
      const resetLink = `${process.env.APP_URL}/reset-password?token=${token}`;
      await sendPasswordResetEmail(user.email, resetLink);
    }

    res.json({ message: 'If that email exists, a reset link has been sent' });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/reset-password
router.post('/reset-password', async (req, res) => {
  const schema = z.object({
    token: z.string().min(1),
    password: z.string().min(8)
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });

  try {
    const user = await prisma.user.findFirst({
      where: { resetToken: parsed.data.token, resetExpiry: { gt: new Date() } }
    });

    if (!user) return res.status(400).json({ error: 'Invalid or expired token' });

    const hash = await bcrypt.hash(parsed.data.password, 12);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: hash, resetToken: null, resetExpiry: null }
    });

    await logAudit(user.id, 'PASSWORD_RESET', 'user', user.id, {}, getClientIp(req));
    res.json({ message: 'Password reset successfully' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/auth/me
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: {
        costCenterOwners: {
          include: { costCenter: { select: { id: true, name: true, balance: true, status: true } } }
        }
      }
    });
    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      isActive: user.isActive,
      costCenters: user.costCenterOwners.map(o => o.costCenter),
      createdAt: user.createdAt
    });
  } catch (err) {
    console.error('Get me error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/invite/accept
router.post('/invite/accept', async (req, res) => {
  const schema = z.object({
    token: z.string().min(1),
    password: z.string().min(8),
    name: z.string().min(1)
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });

  try {
    const user = await prisma.user.findFirst({
      where: { inviteToken: parsed.data.token, inviteExpiry: { gt: new Date() } }
    });

    if (!user) return res.status(400).json({ error: 'Invalid or expired invite token' });

    const hash = await bcrypt.hash(parsed.data.password, 12);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: hash, name: parsed.data.name, inviteToken: null, inviteExpiry: null, isActive: true }
    });

    res.json({ message: 'Account set up successfully' });
  } catch (err) {
    console.error('Accept invite error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/logout-all
router.post('/logout-all', authMiddleware, async (req, res) => {
  try {
    await prisma.refreshToken.deleteMany({ where: { userId: req.user.id } });
    res.clearCookie('access_token');
    res.clearCookie('refresh_token', { path: '/api/auth/refresh' });
    res.json({ message: 'Logged out from all devices' });
  } catch (err) {
    console.error('Logout all error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/auth/microsoft - redirect to Microsoft OAuth
router.get('/microsoft', async (req, res) => {
  try {
    const msConfig = await getMicrosoftConfig();
    if (!msConfig.isConfigured) {
      return res.status(400).json({ error: 'Microsoft SSO is not configured. Ask your admin to set it up in Settings.' });
    }

    const state = crypto.randomBytes(16).toString('hex');
    const redirectUri = `${process.env.APP_URL}/api/auth/microsoft/callback`;
    const authorizeUrl = `https://login.microsoftonline.com/${msConfig.tenantId}/oauth2/v2.0/authorize`
      + `?client_id=${encodeURIComponent(msConfig.clientId)}`
      + `&response_type=code`
      + `&redirect_uri=${encodeURIComponent(redirectUri)}`
      + `&response_mode=query`
      + `&scope=${encodeURIComponent('openid profile email User.Read')}`
      + `&state=${state}`;

    res.redirect(authorizeUrl);
  } catch (err) {
    console.error('Microsoft auth redirect error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/auth/microsoft/callback - handle Microsoft OAuth callback
router.get('/microsoft/callback', async (req, res) => {
  const { code, error: msError } = req.query;

  if (msError || !code) {
    return res.redirect(`${process.env.APP_URL || ''}/login?error=microsoft_auth_failed`);
  }

  try {
    const msConfig = await getMicrosoftConfig();
    if (!msConfig.isConfigured) {
      return res.redirect(`${process.env.APP_URL || ''}/login?error=microsoft_not_configured`);
    }

    const redirectUri = `${process.env.APP_URL}/api/auth/microsoft/callback`;

    // Exchange code for tokens
    const tokenRes = await fetch(`https://login.microsoftonline.com/${msConfig.tenantId}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: msConfig.clientId,
        client_secret: msConfig.clientSecret,
        code,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        scope: 'openid profile email User.Read'
      })
    });

    if (!tokenRes.ok) {
      console.error('Microsoft token exchange failed:', await tokenRes.text());
      return res.redirect(`${process.env.APP_URL || ''}/login?error=microsoft_token_failed`);
    }

    const tokenData = await tokenRes.json();

    // Fetch user profile
    const profileRes = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });

    if (!profileRes.ok) {
      console.error('Microsoft profile fetch failed:', await profileRes.text());
      return res.redirect(`${process.env.APP_URL || ''}/login?error=microsoft_profile_failed`);
    }

    const profile = await profileRes.json();
    const email = (profile.mail || profile.userPrincipalName || '').toLowerCase();
    const name = profile.displayName || email;
    const microsoftId = profile.id;

    if (!email) {
      return res.redirect(`${process.env.APP_URL || ''}/login?error=microsoft_no_email`);
    }

    // Find or match user
    let user = await prisma.user.findFirst({
      where: { OR: [{ microsoftId }, { email }] }
    });

    if (!user) {
      return res.redirect(`${process.env.APP_URL || ''}/login?error=microsoft_no_account`);
    }

    if (!user.isActive) {
      return res.redirect(`${process.env.APP_URL || ''}/login?error=account_disabled`);
    }

    // Link Microsoft ID if not already linked
    if (!user.microsoftId) {
      await prisma.user.update({ where: { id: user.id }, data: { microsoftId } });
    }

    // Issue tokens
    const { accessToken, refreshToken } = generateTokens(user);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await prisma.refreshToken.create({
      data: { userId: user.id, token: refreshToken, expiresAt }
    });

    setTokenCookies(res, accessToken, refreshToken);

    await logAudit(user.id, 'LOGIN_MICROSOFT', 'user', user.id, { email, microsoftId }, getClientIp(req));

    // Redirect to the app
    res.redirect(process.env.APP_URL || '/');
  } catch (err) {
    console.error('Microsoft callback error:', err);
    res.redirect(`${process.env.APP_URL || ''}/login?error=microsoft_auth_error`);
  }
});

// PUT /api/auth/profile - update own profile
router.put('/profile', authMiddleware, async (req, res) => {
  const schema = z.object({
    name: z.string().min(1).optional(),
    email: z.string().email().optional()
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });

  try {
    const updateData = {};
    if (parsed.data.name) updateData.name = parsed.data.name;
    if (parsed.data.email) {
      const existing = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
      if (existing && existing.id !== req.user.id) {
        return res.status(409).json({ error: 'Email already in use' });
      }
      updateData.email = parsed.data.email.toLowerCase();
    }

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: updateData,
      select: { id: true, email: true, name: true, role: true }
    });

    await logAudit(req.user.id, 'PROFILE_UPDATED', 'user', req.user.id, updateData, getClientIp(req));
    res.json(user);
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/auth/password - change own password
router.put('/password', authMiddleware, async (req, res) => {
  const schema = z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8)
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });

  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const valid = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

    const hash = await bcrypt.hash(parsed.data.newPassword, 12);
    await prisma.user.update({
      where: { id: req.user.id },
      data: { passwordHash: hash }
    });

    await logAudit(req.user.id, 'PASSWORD_CHANGED', 'user', req.user.id, {}, getClientIp(req));
    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/auth/microsoft/status - check if Microsoft SSO is configured
router.get('/microsoft/status', async (req, res) => {
  try {
    const msConfig = await getMicrosoftConfig();
    const forceSso = await prisma.setting.findUnique({ where: { key: 'force_sso_only' } });
    res.json({ configured: msConfig.isConfigured, forceSsoOnly: forceSso?.value === 'true' });
  } catch (err) {
    res.json({ configured: false, forceSsoOnly: false });
  }
});

module.exports = router;
