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

module.exports = router;
