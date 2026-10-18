import { randomUUID } from 'node:crypto';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { config } from './config.js';
import { errorHandler, notFoundHandler } from './errors.js';
import { logger } from './logger.js';
import authRoutes from './routes/auth.js';
import catalogRoutes from './routes/catalog.js';
import healthRoutes from './routes/health.js';
import mediaRoutes from './routes/media.js';
import meRoutes from './routes/me.js';
import sellerApplicationRoutes from './routes/sellerApplications.js';
import sellerPortalRoutes from './routes/sellerPortal.js';
import staffCatalogRoutes from './routes/staffCatalog.js';
import staffInsightsRoutes from './routes/staffInsights.js';
import staffMarketplaceRoutes from './routes/staffMarketplace.js';
import staffPayoutRoutes from './routes/staffPayouts.js';
import staffRoutes from './routes/staff.js';
import staffSellerApplicationRoutes from './routes/staffSellerApplications.js';

function requestLogger(req, res, next) {
  req.id = randomUUID();
  res.setHeader('X-Request-Id', req.id);
  const started = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    logger.info(`${req.method} ${req.originalUrl} -> ${res.statusCode} (${ms.toFixed(0)} ms)`);
  });
  next();
}

export function buildApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: config.corsOrigins }));
  app.use(express.json({ limit: '100kb' }));
  app.use(requestLogger);

  // Brute-force protection for anything that checks or resets a password.
  const authLimiter = config.isTest
    ? (req, res, next) => next()
    : rateLimit({ windowMs: 15 * 60 * 1000, limit: 50, standardHeaders: 'draft-7', legacyHeaders: false });

  app.use(healthRoutes);
  app.use('/api/auth', authLimiter, authRoutes);
  app.use('/api/staff/login', authLimiter);
  app.use('/api/staff/seller-applications', staffSellerApplicationRoutes);
  app.use('/api/staff', staffCatalogRoutes);
  app.use('/api/staff', staffMarketplaceRoutes);
  app.use('/api/staff', staffPayoutRoutes);
  app.use('/api/staff', staffInsightsRoutes);
  app.use('/api/staff', staffRoutes);
  app.use('/api/seller', sellerPortalRoutes);
  app.use('/media', mediaRoutes);
  app.use('/api/me/seller-application', sellerApplicationRoutes);
  app.use('/api/me', meRoutes);
  app.use('/api', catalogRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
