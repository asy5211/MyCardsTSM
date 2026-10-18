// A seller manages their own listings in the seller portal. An admin manages TSM's own featured listings on the admin site.
// The two screens are the same code; this says which API and which words each one uses.
import { sellerApi, staffApi } from './api.js';

export const SELLER_SCOPE = {
  kind: 'seller',
  api: sellerApi,
  base: '/api/seller',
  home: '/seller/listings',
  storeName: null, // the signed-in seller's own store name is used
};

export const FEATURED_SCOPE = {
  kind: 'featured',
  api: staffApi,
  base: '/api/staff/featured',
  home: '/staff/featured',
  storeName: 'TSM',
};
