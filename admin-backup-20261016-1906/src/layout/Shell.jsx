import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { staffApi } from '../api.js';
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
  { to: '/staff/offers', label: 'Seller offers' },
  { group: 'Money & records' },
  { to: '/staff/payouts', label: 'Payouts' },
  { to: '/staff/audit', label: 'Activity log' },
];

const SELLER_NAV = [
  { to: '/seller', label: 'Dashboard', end: true },
  { to: '/seller/listings', label: 'My listings' },
  { to: '/seller/earnings', label: 'Earnings & payouts' },
];

export default function Shell({ kind }) {
  const { staff, seller, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [waiting, setWaiting] = useState(0);
  const location = useLocation();
  const isStaff = kind === 'staff';

  useEffect(() => setOpen(false), [location.pathname]);

  // The number of applications waiting for review, shown next to "Seller applications".
  useEffect(() => {
    if (!isStaff) return undefined;
    let alive = true;
    const load = () => staffApi.get('/api/staff/seller-applications', { limit: 1 })
      .then((r) => alive && setWaiting(r.total))
      .catch(() => {});
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
              {item.badge === 'waiting' && waiting > 0 && <span className="nav-badge">{waiting}</span>}
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
