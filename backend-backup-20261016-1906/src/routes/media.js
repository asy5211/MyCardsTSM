// Serves product photos to the admin site and the mobile app. Only the "products" folder is
// public; seller-application documents sit in a different folder and are never reachable here.
import { join } from 'node:path';
import express from 'express';
import { config } from '../config.js';

const router = express.Router();

router.use(
  '/products',
  (req, res, next) => {
    // helmet's default blocks other origins from showing our pictures; the admin site (another port) must.
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
  },
  express.static(join(config.uploadDir, 'products'), {
    index: false,
    dotfiles: 'ignore',
    redirect: false,
    maxAge: '7d', // file names are random per upload, so a cached copy never goes stale
    immutable: true,
  }),
);

export default router;
