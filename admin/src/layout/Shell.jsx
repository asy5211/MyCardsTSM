import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { sellerApi, staffApi } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Button } from '../components/ui.jsx';

const STAFF_NAV = [
  { group: 'Overview' },
  { to: '/staff', label: 'Dashboard', end: true },
  { group: 'People' },
  { to: '/staff/applications', label: 'Seller applications', badge: 'waiting' },
  { to: '/staff/sellers', label: 'Sellers' },
  { to: '/staff/users', label: 'Users' },
  { group: 'Marketplace' },
  { to: '/staff/catalog', label: 'Product catalog' },
  { to: '/staff/brands', label: 'Brands' },
  { to: '/staff/offers', label: 'Seller listings' },
  { to: '/staff/featured', label: 'TSM featured listings' },
  { to: '/staff/orders', label: 'Orders' },
  { group: 'Inbox' },
  { to: '/staff/tickets', label: 'Seller offers', badge: 'tickets' },
  { to: '/staff/support', label: 'Support', badge: 'support' },
  { group: 'Money & records' },
  { to: '/staff/payouts', label: 'Payouts' },
  { to: '/staff/settings', label: 'Fees' },
  { to: '/staff/audit', label: 'Activity log' },
];

const SELLER_NAV = [
  { to: '/seller', label: 'Dashboard', end: true },
  { to: '/seller/sales', label: 'Sales rates' },
  { to: '/seller/orders', label: 'Sold items & shipping', badge: 'toShip' },
  { to: '/seller/reviews', label: 'Reviews', badge: 'unanswered' },
  { to: '/seller/support', label: 'Customer support', badge: 'supportToAnswer' },
  { to: '/seller/listings', label: 'My listings' },
  { to: '/seller/earnings', label: 'Earnings & payouts' },
  { to: '/seller/payout-method', label: 'Payout method' },
];

export default function Shell({ kind }) {
  const { staff, seller, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [badges, setBadges] = useState({});
  const location = useLocation();
  const isStaff = kind === 'staff';

  useEffect(() => setOpen(false), [location.pathname]);

  // Small numbers next to menu entries that are waiting for someone (refreshed every minute and on every page change).
  useEffect(() => {
    let alive = true;
    const set = (patch) => alive && setBadges((b) => ({ ...b, ...patch }));
    const load = isStaff
      ? () => {
        staffApi.get('/api/staff/seller-applications', { limit: 1 }).then((r) => set({ waiting: r.total })).catch(() => {});
        staffApi.get('/api/staff/tickets', { limit: 1 }).then((r) => set({ tickets: r.counts.submitted + r.counts.countered })).catch(() => {});
        staffApi.get('/api/staff/support', { limit: 1 }).then((r) => set({ support: r.counts.open })).catch(() => {});
      }
      : () => {
        sellerApi.get('/api/seller/orders', { limit: 1 }).then((r) => set({ toShip: r.counts.placed })).catch(() => {});
        sellerApi.get('/api/seller/reviews', { answered: 'no', limit: 1 }).then((r) => set({ unanswered: r.total })).catch(() => {});
        sellerApi.get('/api/seller/support', { status: 'open', limit: 1 }).then((r) => set({ supportToAnswer: r.counts.open })).catch(() => {});
      };
    load();
    const id = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(id); };
  }, [isStaff, location.pathname]);

  const nav = isStaff ? STAFF_NAV : SELLER_NAV;
  const who = isStaff ? staff.staff : seller.profile;
  const roleText = isStaff ? staff.staff.role.replace('_', ' ') : 'Approved seller';

  return (
    <div className="shell">
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand">
          <div className="brand-mark">TSM</div>
          <div>
            <div className="brand-name">The Sealed Market</div>
            <div className="brand-sub">{isStaff ? 'Admin console' : 'Seller portal'}</div>
          </div>
        </div>
        <nav className="nav" aria-label="Main">
          {nav.map((item, i) => (item.group ? (
            <div className="nav-group" key={`g${i}`}>{item.group}</div>
          ) : (
            <NavLink key={item.to} to={item.to} end={item.end}>
              <span>{item.label}</span>
              {badges[item.badge] > 0 && <span className="nav-badge">{badges[item.badge]}</span>}
            </NavLink>
          )))}
        </nav>
        <div className="sidebar-foot">
          <div className="who">{isStaff ? who.name : who.displayName}</div>
          <div className="muted small" style={{ textTransform: 'capitalize' }}>{roleText}</div>
          <div style={{ marginTop: 10 }}>
            <Button variant="secondary" size="sm" onClick={() => signOut(kind)}>Sign out</Button>
          </div>
        </div>
      </aside>
      <div>
        <div className="topbar">
          <Button variant="secondary" size="sm" onClick={() => setOpen((o) => !o)} aria-label="Menu">☰ Menu</Button>
          <strong>{isStaff ? 'TSM Admin' : 'TSM Seller portal'}</strong>
        </div>
        <main className="main">
          <Outlet />
        </main>
      </div>
      {open && <div className="modal-backdrop" style={{ zIndex: 35, background: 'rgba(0,0,0,.5)' }} onClick={() => setOpen(false)} />}
    </div>
  );
}
