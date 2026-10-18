import { Link } from 'react-router-dom';
import { staffApi } from '../../api.js';
import { Alert, Card, ErrorBox, Loading, PageHeader, Stat } from '../../components/ui.jsx';
import { actionText, dateTime, money, number } from '../../format.js';
import { useApi, useTitle } from '../../hooks.js';

export function ActivityList({ items }) {
  if (!items?.length) return <div className="empty"><div className="empty-title">Nothing yet</div></div>;
  return (
    <ul className="activity">
      {items.map((a) => (
        <li key={a.id}>
          <div>
            <div className="what">{actionText(a.action)}</div>
            <div className="muted small">
              {a.actorName || a.actorType}
              {a.details?.product ? ` · ${a.details.product}` : ''}
              {a.details?.displayName ? ` · ${a.details.displayName}` : ''}
              {a.details?.seller ? ` · ${a.details.seller}` : ''}
            </div>
          </div>
          <div className="when">{dateTime(a.createdAt)}</div>
        </li>
      ))}
    </ul>
  );
}

export default function Dashboard() {
  useTitle('Dashboard');
  const { data: d, error, loading, reload } = useApi(() => staffApi.get('/api/staff/dashboard'), []);

  if (loading && !d) return <Loading />;
  if (error && !d) return <ErrorBox error={error} onRetry={reload} />;

  const needsContent = d.products.active - d.products.ready;
  return (
    <>
      <PageHeader title="Dashboard" subtitle="Everything happening on The Sealed Market, at a glance." />

      <div className="stack">
        {d.applications.waiting > 0 && (
          <Alert tone="warn">
            <span><strong>{d.applications.waiting}</strong> seller application{d.applications.waiting === 1 ? ' is' : 's are'} waiting for review.</span>
            <Link className="btn btn-secondary btn-sm" to="/staff/applications">Review now</Link>
          </Alert>
        )}
        {(d.tickets.pending > 0 || d.tickets.countered > 0) && (
          <Alert tone="warn">
            <span>
              Sell-to-us tickets need you:
              {d.tickets.pending > 0 && <> <strong>{d.tickets.pending}</strong> new</>}
              {d.tickets.pending > 0 && d.tickets.countered > 0 && ' and'}
              {d.tickets.countered > 0 && <> <strong>{d.tickets.countered}</strong> counter offer{d.tickets.countered === 1 ? '' : 's'}</>}.
            </span>
            <Link className="btn btn-secondary btn-sm" to="/staff/tickets">Open tickets</Link>
          </Alert>
        )}
        {d.support.open > 0 && (
          <Alert tone="info">
            <span><strong>{d.support.open}</strong> support request{d.support.open === 1 ? ' is' : 's are'} waiting for an answer.</span>
            <Link className="btn btn-secondary btn-sm" to="/staff/support">Open inbox</Link>
          </Alert>
        )}
        {needsContent > 0 && (
          <Alert tone="info">
            <span><strong>{needsContent}</strong> active product{needsContent === 1 ? ' needs' : 's need'} a photo or description before sellers can list {needsContent === 1 ? 'it' : 'them'}.</span>
            <Link className="btn btn-secondary btn-sm" to="/staff/catalog?status=needs_content">Finish them</Link>
          </Alert>
        )}

        <div className="grid grid-stats">
          <Stat label="Waiting applications" value={number(d.applications.waiting)} to="/staff/applications" tone={d.applications.waiting ? 'gold' : undefined} />
          <Stat
            label="Active sellers"
            value={number(d.sellers.active)}
            hint={d.sellers.suspended || d.sellers.revoked ? [d.sellers.suspended && `${d.sellers.suspended} suspended`, d.sellers.revoked && `${d.sellers.revoked} selling removed`].filter(Boolean).join(' · ') : `${number(d.sellers.total)} total`}
            to="/staff/sellers"
          />
          <Stat label="Orders to ship" value={number(d.orders.toShip)} hint={`${number(d.orders.total)} orders in all`} tone={d.orders.toShip ? 'gold' : undefined} to="/staff/orders" />
          <Stat label="Open sell tickets" value={number(d.tickets.open)} hint={d.tickets.toPay ? `${d.tickets.toPay} accepted, waiting for payment` : 'sellers offering stock to TSM'} to="/staff/tickets" />
          <Stat label="Support waiting" value={number(d.support.open)} to="/staff/support" tone={d.support.open ? 'gold' : undefined} />
          <Stat label="Users" value={number(d.people.total)} hint={`${number(d.people.joinedThisWeek)} joined this week`} to="/staff/users" />
          <Stat label="Products" value={`${number(d.products.ready)} / ${number(d.products.total)}`} hint="ready for sellers / total" to="/staff/catalog" />
          <Stat label="Live offers" value={number(d.listings.live)} hint={`${number(d.listings.paused)} paused · ${number(d.listings.onHold)} on hold · ${number(d.listings.soldOut)} sold out`} to="/staff/offers" />
          <Stat label="Units in stock" value={number(d.listings.unitsInStock)} hint="across live offers" />
          <Stat label="Inventory value" value={money(d.listings.inventoryValueCents)} hint="at sellers’ asking prices" />
        </div>

        <h2>Money</h2>
        <div className="grid grid-stats">
          <Stat label="Owed to sellers" value={money(d.money.availableCents)} hint="available, not yet in a payout" tone="gold" to="/staff/payouts" />
          <Stat label="Pending payouts" value={number(d.money.pendingPayouts)} hint={`${money(d.money.inPayoutCents)} waiting to be sent`} to="/staff/payouts" />
          <Stat label="Paid to sellers" value={money(d.money.paidCents)} tone="green" />
          <Stat label="Sales (gross)" value={money(d.money.grossCents)} />
          <Stat label="TSM fee earned" value={money(d.money.commissionCents)} hint="TSM’s cut of those sales" />
          <Stat label="Payment (Apple) fees" value={money(d.money.processingFeeCents)} hint="taken from those sales" to="/staff/settings" />
        </div>

        <Card title="Latest activity" actions={<Link className="btn btn-secondary btn-sm" to="/staff/audit">Full activity log</Link>} padded={false}>
          <ActivityList items={d.recentActivity} />
        </Card>
      </div>
    </>
  );
}
