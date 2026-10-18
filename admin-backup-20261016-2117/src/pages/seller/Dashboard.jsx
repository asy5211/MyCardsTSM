import { Link } from 'react-router-dom';
import { sellerApi } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { Alert, Card, ErrorBox, KeyValue, Loading, PageHeader, Stat } from '../../components/ui.jsx';
import { date, money, number, percentFromBps } from '../../format.js';
import { useApi, useTitle } from '../../hooks.js';

export default function SellerDashboard() {
  useTitle('Dashboard');
  const { seller } = useAuth();
  const { data: d, error, loading, reload } = useApi(() => sellerApi.get('/api/seller/dashboard'), []);

  if (loading && !d) return <Loading />;
  if (error && !d) return <ErrorBox error={error} onRetry={reload} />;

  return (
    <>
      <PageHeader
        title={`Welcome, ${seller.profile.displayName}`}
        subtitle="List products from the TSM catalog, keep your stock and prices up to date, and see what you are owed."
        actions={<Link className="btn btn-primary btn-md" to="/seller/listings/new">+ List a product</Link>}
      />
      <div className="stack">
        {d.ordersToShip > 0 && (
          <Alert tone="warn">
            <span><strong>{d.ordersToShip} order{d.ordersToShip === 1 ? '' : 's'}</strong> {d.ordersToShip === 1 ? 'is' : 'are'} waiting for you to ship. Add the carrier and tracking number so the buyer can follow it.</span>
            <Link className="btn btn-secondary btn-sm" to="/seller/orders?status=placed">Ship now</Link>
          </Alert>
        )}
        {d.listings.onHold > 0 && (
          <Alert tone="error">
            <span><strong>{d.listings.onHold} of your offers {d.listings.onHold === 1 ? 'is' : 'are'} on hold</strong> by TSM and not visible to shoppers. Open My listings to see why.</span>
            <Link className="btn btn-secondary btn-sm" to="/seller/listings?status=on_hold">View</Link>
          </Alert>
        )}
        {d.listings.total === 0 && (
          <Alert tone="info">
            <span>You have not listed anything yet. Pick a product from the TSM catalog and tell shoppers your price, how many you have, where it came from, and which box or pack it is.</span>
            <Link className="btn btn-primary btn-sm" to="/seller/listings/new">List your first product</Link>
          </Alert>
        )}
        <div className="grid grid-stats">
          <Stat label="Live offers" value={number(d.listings.live)} hint={`${d.listings.total} total`} to="/seller/listings?status=live" />
          <Stat label="Units in stock" value={number(d.listings.unitsInStock)} hint="across your active offers" />
          <Stat label="Inventory value" value={money(d.listings.inventoryValueCents)} hint="at your prices" />
          <Stat label="Sold out" value={number(d.listings.soldOut)} to="/seller/listings?status=sold_out" tone={d.listings.soldOut ? 'gold' : undefined} />
          <Stat label="Paused" value={number(d.listings.paused)} to="/seller/listings?status=paused" />
          <Stat label="To ship" value={number(d.ordersToShip)} to="/seller/orders?status=placed" tone={d.ordersToShip ? 'gold' : undefined} hint="orders waiting for tracking" />
        </div>

        <h2>Your money</h2>
        <div className="grid grid-stats">
          <Stat label="Available" value={money(d.money.availableCents)} tone="gold" hint="TSM owes you this" to="/seller/earnings" />
          <Stat label="On its way" value={money(d.money.inPayoutCents)} hint="in a payout TSM is preparing" />
          <Stat label="Paid to you" value={money(d.money.paidCents)} tone="green" />
        </div>

        <Card title="Latest sales" actions={<Link className="btn btn-secondary btn-sm" to="/seller/earnings">All earnings</Link>} padded={false}>
          {d.recentSales.length ? (
            <div className="table-wrap">
              <table>
                <thead><tr><th scope="col">Date</th><th scope="col">Product</th><th scope="col" className="num">Qty</th><th scope="col" className="num">Sale</th><th scope="col" className="num">Fees taken</th><th scope="col" className="num">You receive</th></tr></thead>
                <tbody>
                  {d.recentSales.map((e) => (
                    <tr key={e.id}>
                      <td className="nowrap">{date(e.createdAt)}</td>
                      <td>{e.productName}</td>
                      <td className="num">{e.quantity}</td>
                      <td className="num">{money(e.grossCents)}</td>
                      <td className="num" title={`TSM ${money(e.commissionCents)} + payment ${money(e.processingFeeCents)}`}>−{money(e.commissionCents + e.processingFeeCents)}</td>
                      <td className="num"><strong>{money(e.netCents)}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="muted" style={{ margin: 18 }}>No sales yet.</p>}
        </Card>
        <Card title="What is taken before you are paid">
          <KeyValue rows={[
            [`TSM fee (${percentFromBps(d.fees.tsmFeeBps)})`, 'TSM’s flat cut of every sale'],
            [`Payment (Apple) fee (${percentFromBps(d.fees.processingFeeBps)})`, 'The rate Apple or the payment provider takes, set by TSM'],
            ['Together', <strong key="t">{percentFromBps(d.fees.totalBps)} of each sale</strong>],
            ['On a $100.00 sale you receive', <strong key="r">{money(10000 - Math.round((10000 * d.fees.tsmFeeBps) / 10000) - Math.round((10000 * d.fees.processingFeeBps) / 10000))}</strong>],
          ]} />
          <p className="faint small" style={{ marginBottom: 0 }}>
            Both fees come off each sale before a payout is made. Every sale keeps the rates it was made at, so a later change never affects past sales.
            See <Link to="/seller/sales">Sales rates</Link> for the totals by day, week and month.
          </p>
        </Card>
      </div>
    </>
  );
}
