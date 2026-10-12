const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');

const json = (message) => (req, res) =>
  res.status(429).json({ success: false, message });

// Credential endpoints: slow down stuffing/brute-force attempts per IP.
// Successful requests do not count, so a legitimate user who logs in is unaffected.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: json('Too many attempts. Please try again in 15 minutes.'),
});

// AI generation costs money per call, so it is capped per user account
// rather than per IP. Mount this AFTER `protect` so req.user exists.
const contentLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  // `ipKeyGenerator` normalises IPv6 into a subnet key; using req.ip raw would
  // let an IPv6 client rotate addresses to get around the limit.
  keyGenerator: (req, res) =>
    req.user ? `user:${req.user._id}` : ipKeyGenerator(req, res),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: json(
    'Generation limit reached (20 per hour). Please try again later.'
  ),
});

// Video uploads are large and fill disk, so they are capped per user account
// too. Mount this AFTER `protect` so req.user exists.
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  keyGenerator: (req, res) =>
    req.user ? `user:${req.user._id}` : ipKeyGenerator(req, res),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: json('Upload limit reached (30 per hour). Please try again later.'),
});

module.exports = { authLimiter, contentLimiter, uploadLimiter };
