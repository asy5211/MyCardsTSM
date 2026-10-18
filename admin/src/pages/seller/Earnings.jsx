import { useState } from 'react';
import { Link } from 'react-router-dom';
import { sellerApi } from '../../api.js';
import { Alert, Card, Empty, ErrorBox, Loading, PageHeader, Pagination, SortSelect, Stat, StatusBadge, Tabs } from '../../components/ui.jsx';
import { EARNING_STATUS, PAYOUT_STATUS, date, money, percentFromBps } from '../../format.js';
import { useApi, useTitle } from '../../hooks.js';

const LIMIT = 50;

function Payouts() {
  const { data, error, loading, reload } = useApi(() => sellerApi.get('/api/seller/payouts'), []);
  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorBox error={error} onRetry={reload} />;
  return (
    <Card padded={false}>
      {data.items.length ? (
        <div className="table-wrap">
          <table>
            <thead><tr><th scope="col">Created</th><th scope="col" className="num">Amount</th><th scope="col" className="num">Sales</th><th scope="col">Paid on</th><th scope="col">Reference</th><th scope="col">Status</th></tr></thead>
            <tbody>
              {data.items.map((p) => (
                <tr key={p.id}>
                  <td className="nowrap">{date(p.createdAt)}</td>
                  <td className="num"><strong>{money(p.amountCents)}</strong></td>
                  <td className="num">{p.earningsCount}</td>
                  <td className="nowrap">{date(p.paidAt)}</td>
                  <td>{p.reference ? <code>{p.reference}</code> : '—'}</td>
                  <td><StatusBadge map={PAYOUT_STATUS} value={p.status} />{p.status === 'cancelled' && p.note && <div className="muted small">{p.note}</div>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <Empty title="No payouts yet">When TSM pays you, it shows up here with the transfer reference.</Empty>}
    </Card>
  );
}

function Sales() {
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState('newest');
  const [offset, setOffset] = useState(0);
  const { data, error, loading, reload } = useApi(() => sellerApi.get('/api/seller/earnings', { status, sort, limit: LIMIT, offset }), [status, sort, offset]);
  return (
    <Card padded={false}>
      <div className="filters">
        <select className="input" value={status} onChange={(e) => { setStatus(e.target.value); setOffset(0); }} aria-label="Status">
          <option value="all">All sales</option>
          <option value="available">Available</option>
          <option value="in_payout">In a payout</option>
          <option value="paid">Paid</option>
        </select>
        <SortSelect value={sort} onChange={(v) => { setSort(v); setOffset(0); }} />
      </div>
      {error && <div style={{ padding: 16 }}><ErrorBox error={error} onRetry={reload} /></div>}
      {loading && !data ? <Loading /> : data && (data.items.length ? (
        <>
          <div className="table-wrap">
            <table>
              <thead><tr><th scope="col">Date</th><th scope="col">Order</th><th scope="col">Product</th><th scope="col" className="num">Qty</th><th scope="col" className="num">Sale total</th><th scope="col" className="num">TSM fee</th><th scope="col" className="num">Payment fee</th><th scope="col" className="num">You receive</th><th scope="col">Status</th></tr></thead>
              <tbody>
                {data.items.map((e) => (
                  <tr key={e.id}>
                    <td className="nowrap">{date(e.createdAt)}</td>
                    <td className="mono">{e.orderRef}</td>
                    <td>{e.productName}</td>
                    <td className="num">{e.quantity}</td>
                    <td className="num">{money(e.grossCents)}</td>
                    <td className="num">−{money(e.commissionCents)}<div className="muted small">{percentFromBps(e.commissionBps)}</div></td>
                    <td className="num">−{money(e.processingFeeCents)}<div className="muted small">{percentFromBps(e.processingFeeBps)}</div></td>
                    <td className="num"><strong>{money(e.netCents)}</strong></td>
                    <td><StatusBadge map={EARNING_STATUS} value={e.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination total={data.total} limit={LIMIT} offset={offset} onChange={setOffset} />
        </>
      ) : <Empty title="No sales yet">Your sales will be listed here with TSM’s fee and what you receive.</Empty>)}
    </Card>
  );
}

export default function Earnings() {
  useTitle('Earnings & payouts');
  const [tab, setTab] = useState('sales');
  const totals = useApi(() => sellerApi.get('/api/seller/earnings', { limit: 1 }), []);
  const s = totals.data?.summary;
  const fees = totals.data?.fees;
  const payoutMethod = useApi(() => sellerApi.get('/api/seller/payout-method'), []);
  return (
    <>
      <PageHeader
        title="Earnings & payouts"
        subtitle={fees
          ? `Every sale, the fees taken from it, and what you receive. Today’s rates are TSM ${percentFromBps(fees.tsmFeeBps)} and payment (Apple) ${percentFromBps(fees.processingFeeBps)}, but each sale keeps the rates it sold at. TSM pays you using your saved payout method and records the reference here.`
          : 'Every sale, the fees taken from it, and what you receive.'}
      />
      <div className="stack">
        {payoutMethod.data && !payoutMethod.data.method && (
          <Alert tone="warn">
            <span><strong>TSM does not know where to send your money yet.</strong> Add a payout method so your payouts are not held up.</span>
            <Link className="btn btn-primary btn-sm" to="/seller/payout-method">Add payout method</Link>
          </Alert>
        )}
        {s && (
          <div className="grid grid-stats">
            <Stat label="Available" value={money(s.availableCents)} tone="gold" hint="not yet in a payout" />
            <Stat label="On its way" value={money(s.inPayoutCents)} hint="TSM is preparing it" />
            <Stat label="Paid to you" value={money(s.paidCents)} tone="green" />
            <Stat label="Sales (gross)" value={money(s.grossCents)} />
            <Stat label="TSM fees" value={money(s.commissionCents)} />
            <Stat label="Payment (Apple) fees" value={money(s.processingFeeCents)} />
          </div>
        )}
        <div>
          <Tabs tabs={[{ value: 'sales', label: 'Sales' }, { value: 'payouts', label: 'Payouts' }]} value={tab} onChange={setTab} />
          {tab === 'sales' ? <Sales /> : <Payouts />}
        </div>
      </div>
    </>
  );
}
