const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');

function authMiddleware(req, res, next) {
  const token = req.cookies?.access_token || req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function superAdminOnly(req, res, next) {
  if (req.user?.role !== 'super_admin') {
    return res.status(403).json({ error: 'Forbidden: Super Admin access required' });
  }
  next();
}

function getClientIp(req) {
  return req.headers['cf-connecting-ip'] ||
    req.headers['x-forwarded-for']?.split(',')[0] ||
    req.socket.remoteAddress ||
    'unknown';
}

module.exports = { authMiddleware, superAdminOnly, getClientIp };
