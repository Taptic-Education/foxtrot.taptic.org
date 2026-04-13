const rateLimit = require('express-rate-limit');

/**
 * CSRF protection via Origin/Referer header verification.
 * Skips safe methods (GET, HEAD, OPTIONS) and public unauthenticated endpoints.
 * For state-changing requests, the Origin must match APP_URL.
 */
const PUBLIC_PATHS = [
  '/api/auth/login',
  '/api/auth/refresh',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/auth/invite/accept',
  '/api/setup',
  '/api/setup/status',
  '/api/health'
];

function csrfProtection(req, res, next) {
  const safe = ['GET', 'HEAD', 'OPTIONS'];
  if (safe.includes(req.method)) return next();

  const isPublic = PUBLIC_PATHS.some(p => req.path === p || req.originalUrl.startsWith(p));
  if (isPublic) return next();

  const allowedOrigin = process.env.APP_URL || 'http://localhost:5173';
  const origin = req.headers.origin || req.headers.referer || '';

  if (!origin.startsWith(allowedOrigin)) {
    return res.status(403).json({ error: 'CSRF check failed' });
  }

  next();
}

/**
 * General API rate limiter — 200 requests per minute per IP.
 */
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down' }
});

/**
 * Tighter limiter for write operations — 60 requests per minute per IP.
 */
const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down' }
});

module.exports = { csrfProtection, apiLimiter, writeLimiter };
