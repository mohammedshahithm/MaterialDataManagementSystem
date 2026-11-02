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

// Trust reverse proxy (Vercel edge, Nginx, etc.)
app.set('trust proxy', 1);

// ── Security & CORS ──────────────────────────────────────────
const isAllowedOrigin = (origin: string | undefined): boolean => {
  // Allow non-browser requests, same-origin calls, and internal Vercel rewrites
  if (!origin) return true;
  if (
    origin === config.frontendUrl ||
    origin === 'http://localhost:5173' ||
    origin === 'http://localhost:3000' ||
    origin === 'http://localhost:3001'
  ) {
    return true;
  }
  // Allow all Vercel deployment and preview URLs
  if (origin.endsWith('.vercel.app')) {
    return true;
  }
  // Allow comma-separated origins from FRONTEND_URL if configured
  if (config.frontendUrl.includes(',')) {
    const list = config.frontendUrl.split(',').map((s) => s.trim());
    if (list.includes(origin)) return true;
  }
  return false;
};

app.use(helmet());
app.use(
  cors({
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) {
        callback(null, true);
      } else {
        // Fallback for company intranet / custom internal factory origins
        callback(null, true);
      }
    },
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

// ── Server Execution (Local vs. Serverless) ─────────────────
const PORT = config.port;

if (!process.env.VERCEL) {
  // Traditional long-running server (local development, Docker, VPS)
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
} else {
  // Serverless execution (Vercel Functions): persistent node-cron is disabled.
  // Scheduled retention checks are triggered via Vercel Cron at /api/cron/retention.
  console.log('⚡ MDMS Backend initialized in Vercel Serverless Function mode');
}

export default app;
