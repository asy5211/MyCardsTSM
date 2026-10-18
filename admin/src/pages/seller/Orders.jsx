import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { sellerApi } from '../../api.js';
import { Card, ClickRow, Empty, ErrorBox, Loading, PageHeader, Pagination, SearchBox, SortSelect, StatusBadge, Tabs } from '../../components/ui.jsx';
import { SELLER_ORDER_STATUS, date, money } from '../../format.js';
import { useApi, useDebounced, useTitle } from '../../hooks.js';

const LIMIT = 50;
const STATUSES = ['all', 'placed', 'shipped', 'delivered', 'cancelled'];

export default function SellerOrders() {
  useTitle('Sold items & shipping');
  const [params, setParams] = useSearchParams();
  const status = STATUSES.includes(params.get('status')) ? params.get('status') : 'all';
  const [search, setSearch] = useState('');
  const q = useDebounced(search);
  const [sort, setSort] = useState('newest');
  const [offset, setOffset] = useState(0);
  const { data, error, loading, reload } = useApi(() => sellerApi.get('/api/seller/orders', { status, q, sort, limit: LIMIT, offset }), [status, q, sort, offset]);
  const counts = data?.counts;

  const tabs = [
    { value: 'all', label: 'All', count: counts ? Object.values(counts).reduce((a, b) => a + b, 0) : undefined },
    ...['placed', 'shipped', 'delivered', 'cancelled'].map((value) => ({ value, label: SELLER_ORDER_STATUS[value].label, count: counts?.[value] })),
  ];

  return (
    <>
      <PageHeader
        title="Sold items & shipping"
        subtitle="Everything you sold. Add the carrier and tracking number when you ship, and message the buyer if they have a question. The buyer sees the tracking number in the app."
      />
      <Tabs
        tabs={tabs}
        value={status}
        onChange={(v) => { const next = new URLSearchParams(); if (v !== 'all') next.set('status', v); setParams(next, { replace: true }); setOffset(0); }}
      />
      <Card padded={false}>
        <div className="filters">
          <SearchBox value={search} onChange={(v) => { setSearch(v); setOffset(0); }} placeholder="Search order number, buyer or product…" />
          <SortSelect value={sort} onChange={(v) => { setSort(v); setOffset(0); }} />
        </div>
        {error && <div style={{ padding: 16 }}><ErrorBox error={error} onRetry={reload} /></div>}
        {loading && !data ? <Loading /> : data && (data.items.length ? (
          <>
            <div className="table-wrap">
              <table>
                <thead><tr><th scope="col">Order</th><th scope="col">Buyer</th><th scope="col">Items sold</th><th scope="col" className="num">Total</th><th scope="col">Status</th><th scope="col">Tracking</th><th scope="col">Placed</th></tr></thead>
                <tbody>
                  {data.items.map((o) => {
                    const units = o.items.reduce((sum, i) => sum + i.quantity, 0);
                    return (
                      <ClickRow key={o.id} to={`/seller/orders/${o.id}`}>
                        <td className="nowrap"><strong>{o.orderNumber}</strong></td>
                        <td>{o.buyer.username}</td>
                        <td>
                          {o.items[0]?.productName}{o.items.length > 1 ? ` + ${o.items.length - 1} more` : ''}
                          <div className="muted small">{units} item{units === 1 ? '' : 's'}{o.items[0]?.boxLabel ? ` · ${o.items[0].boxLabel}` : ''}</div>
                        </td>
                        <td className="num">{money(o.subtotalCents)}</td>
                        <td><StatusBadge map={SELLER_ORDER_STATUS} value={o.status} /></td>
                        <td>{o.trackingNumber ? <span className="mono">{o.carrier} {o.trackingNumber}</span> : <span className="muted">—</span>}</td>
                        <td className="nowrap">{date(o.createdAt)}</td>
                      </ClickRow>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination total={data.total} limit={LIMIT} offset={offset} onChange={setOffset} />
          </>
        ) : <Empty title={status === 'all' ? 'Nothing sold yet' : 'No orders here'}>{status === 'all' ? 'When a shopper buys one of your offers, the order shows up here.' : 'Try another tab.'}</Empty>)}
      </Card>
    </>
  );
}
