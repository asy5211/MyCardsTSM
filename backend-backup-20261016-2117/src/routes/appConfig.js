// What the mobile app needs to know about this server that is not user data.
//
//   GET /api/app-config     {sellerPortalUrl}  where approved sellers manage their business (the seller dashboard website)
//
// The address comes from SELLER_PORTAL_URL when it is set. Otherwise it is built from the address the app used to
// reach this server (same machine, port 5173), which is right when you run the admin site next to the API on your own network.
import { Router } from 'express';
import { config } from '../config.js';

const router = Router();

router.get('/app-config', (req, res) => {
  const host = req.hostname.includes(':') && !req.hostname.startsWith('[') ? `[${req.hostname}]` : req.hostname;
  const base = config.sellerPortalUrl ?? `${req.protocol}://${host}:5173`;
  res.json({ sellerPortalUrl: `${base}/login?as=seller`, sellerPortalIsConfigured: Boolean(config.sellerPortalUrl) });
});

export default router;
