const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { authLimiter } = require('./middleware/rateLimit');
const { uploadRoot } = require('./services/mediaService');

// Builds the Express app without connecting to a database or binding a port,
// so tests can mount it directly. See server.js for the runtime entry point.
const app = express();

// ---------- Middleware ----------
app.use(helmet());

// CLIENT_URL is a comma-separated list of allowed origins. A `*` matches any
// run of characters, so `https://my-app-*.vercel.app` covers Vercel preview
// deployments, which each get a unique hostname.
const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim().replace(/\/+$/, ''))
  .filter(Boolean)
  .map((pattern) => {
    if (!pattern.includes('*')) return pattern;
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`^${escaped.replace(/\*/g, '.*')}$`);
  });

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);
// 2mb matches the image cap enforced in the Post model and the editor.
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// ---------- Health Check ----------
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'SocialSync API is running',
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
  });
});

// ---------- Uploaded media ----------
// Files are named with random UUIDs, so their URLs can't be guessed. The SPA
// runs on another origin, and helmet's default same-origin
// Cross-Origin-Resource-Policy would stop its <video> tags loading them.
// express.static supports Range requests, which video seeking needs.
app.use(
  '/uploads',
  (req, res, next) => {
    res.set('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
  },
  express.static(uploadRoot(), { maxAge: '7d', immutable: true, index: false })
);

// ---------- Routes ----------
app.use('/api/auth', authLimiter, require('./routes/auth'));
app.use('/api/posts', require('./routes/posts'));
app.use('/api/media', require('./routes/media'));
app.use('/api/accounts', require('./routes/accounts'));
// The content router applies its own per-user limiter after `protect`.
app.use('/api/content', require('./routes/content'));
app.use('/api/analytics', require('./routes/analytics'));

// ---------- 404 Handler ----------
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// ---------- Global Error Handler ----------
// eslint-disable-next-line no-unused-vars -- Express needs the 4-arg signature
app.use((err, req, res, next) => {
  if (process.env.NODE_ENV !== 'test') {
    console.error('❌ Error:', err.stack || err.message);
  }

  // Translate the Mongoose/Express errors clients can actually cause.
  let status = err.statusCode || 500;
  let message = err.message || 'Server Error';

  if (err.name === 'ValidationError') {
    status = 400;
    message =
      Object.values(err.errors || {})
        .map((e) => e.message)
        .join('; ') || 'Validation failed';
  } else if (err.name === 'CastError') {
    status = 400;
    message = `Invalid value for '${err.path}'`;
  } else if (err.code === 11000) {
    status = 409;
    message = 'That record already exists';
  } else if (err.type === 'entity.too.large') {
    status = 413;
    message = 'Request too large. Images must be under 2MB.';
  }

  // Never leak internals on an unexpected failure in production.
  if (status === 500 && process.env.NODE_ENV === 'production') {
    message = 'Server Error';
  }

  res.status(status).json({ success: false, message });
});

module.exports = app;
