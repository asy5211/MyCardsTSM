import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { staffApi } from '../../api.js';
import { Badge, Card, ClickRow, Empty, ErrorBox, Loading, PageHeader, Pagination, SearchBox, SellerPicker, SortSelect, StatusBadge } from '../../components/ui.jsx';
import { ORDER_STATUS, dateTime, money } from '../../format.js';
import { useApi, useDebounced, useTitle } from '../../hooks.js';

const LIMIT = 50;

export default function Orders() {
  useTitle('Orders');
  const [params, setParams] = useSearchParams();
  const sellerId = params.get('sellerId') || undefined;
  const [search, setSearch] = useState('');
  const q = useDebounced(search);
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState('newest');
  const [offset, setOffset] = useState(0);
  const { data, error, loading, reload } = useApi(
    () => staffApi.get('/api/staff/orders', { q, status, sellerId, sort, limit: LIMIT, offset }),
    [q, status, sellerId, sort, offset],
  );
  const pickSeller = (id) => { setParams(id ? { sellerId: id } : {}, { replace: true }); setOffset(0); };

  return (
    <>
      <PageHeader
        title="Orders"
        subtitle="Everything bought in the app. Each order is from one seller, who ships it and chats with the buyer; orders from TSM’s own store are shipped by us. Pick a seller to see only their orders."
      />
      <Card padded={false}>
        <div className="filters">
          <SearchBox value={search} onChange={(v) => { setSearch(v); setOffset(0); }} placeholder="Search order number, buyer, seller or product…" />
          <select className="input" value={status} onChange={(e) => { setStatus(e.target.value); setOffset(0); }} aria-label="Status">
            <option value="all">Any status</option>
            {Object.entries(ORDER_STATUS).map(([value, v]) => <option key={value} value={value}>{v.label}</option>)}
          </select>
          <SellerPicker sellerId={sellerId} onChange={pickSeller} placeholder="Filter by seller…" />
          <SortSelect value={sort} onChange={(v) => { setSort(v); setOffset(0); }} />
        </div>
        {error && <div style={{ padding: 16 }}><ErrorBox error={error} onRetry={reload} /></div>}
        {loading && !data ? <Loading /> : data && (data.items.length ? (
          <>
            <div className="table-wrap">
              <table>
                <thead><tr><th scope="col">Order</th><th scope="col">Buyer</th><th scope="col">Seller</th><th scope="col">Items</th><th scope="col" className="num">Total</th><th scope="col">Status</th><th scope="col">Placed</th></tr></thead>
                <tbody>
                  {data.items.map((o) => {
                    const units = o.items.reduce((sum, i) => sum + i.quantity, 0);
                    return (
                      <ClickRow key={o.id} to={`/staff/orders/${o.id}`} className={o.seller.isTsm ? 'row-featured' : ''}>
                        <td className="nowrap"><strong>{o.orderNumber}</strong></td>
                        <td>{o.buyer.username}</td>
                        <td>{o.seller.isTsm ? <>{o.seller.displayName} <Badge tone="purple">TSM</Badge></> : <Link to={`/staff/sellers/${o.seller.id}`}>{o.seller.displayName}</Link>}</td>
                        <td>{o.items[0]?.productName}{o.items.length > 1 ? ` + ${o.items.length - 1} more` : ''} · {units} item{units === 1 ? '' : 's'}</td>
                        <td className="num">{money(o.subtotalCents)}</td>
                        <td><StatusBadge map={ORDER_STATUS} value={o.status} /></td>
                        <td className="nowrap">{dateTime(o.createdAt)}</td>
                      </ClickRow>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination total={data.total} limit={LIMIT} offset={offset} onChange={setOffset} />
          </>
        ) : <Empty title="No orders yet" />)}
      </Card>
    </>
  );
}
