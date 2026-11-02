import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { config } from './config';
import routes from './routes';
import { errorHandler } from './middleware/errorHandler';
import { enforcePrivateNetwork } from './middleware/networkSecurity';
import { startRetentionJob } from './jobs/retentionJob';

// Global BigInt JSON serialization support
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

const app = express();

// ── Security ─────────────────────────────────────────────────
app.use(helmet());
app.use(
  cors({
    origin: config.frontendUrl,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-key', 'x-admin-passcode'],
  })
);
app.use(enforcePrivateNetwork);

// ── Rate Limiting ────────────────────────────────────────────
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});
app.use(generalLimiter);

// Stricter limit for auth-related endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many authentication attempts' },
});

// ── Body Parsing ─────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Logging & Performance Monitoring ────────────────────────
app.use((req, res, next) => {
  const start = performance.now();

  const originalWriteHead = res.writeHead.bind(res);
  (res as any).writeHead = function (...args: any[]) {
    const duration = performance.now() - start;
    try {
      res.setHeader('X-Response-Time', `${duration.toFixed(2)}ms`);
    } catch {}
    return (originalWriteHead as any)(...args);
  };

  res.on('finish', () => {
    const duration = performance.now() - start;
    if (req.originalUrl?.startsWith('/api')) {
      const sanitizedUrl = req.originalUrl.split('?')[0];
      console.log(`[PERF] ${req.method} ${sanitizedUrl} ${res.statusCode} - ${duration.toFixed(2)} ms`);
    }
  });

  next();
});

app.use(morgan('short'));

// ── Health Check ─────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── API Routes ───────────────────────────────────────────────
app.use('/api', routes);

// ── Error Handler ────────────────────────────────────────────
app.use(errorHandler);

// ── Start Server ─────────────────────────────────────────────
const PORT = config.port;

app.listen(PORT, () => {
  console.log(`\n🚀 MDMS Backend running on http://localhost:${PORT}`);
  console.log(`   Frontend URL: ${config.frontendUrl}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}\n`);

  // Start background jobs with cluster awareness and distributed lock
  const shouldRunScheduler =
    process.env.ENABLE_RETENTION_SCHEDULER === 'true' ||
    (process.env.ENABLE_RETENTION_SCHEDULER !== 'false' &&
      (process.env.NODE_APP_INSTANCE === undefined || process.env.NODE_APP_INSTANCE === '0'));

  if (shouldRunScheduler) {
    startRetentionJob();
  } else {
    console.log('ℹ️ Retention scheduler disabled on this cluster instance (Standby)');
  }
});

export default app;
