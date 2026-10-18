import { useState } from 'react';
import { staffApi } from '../../api.js';
import { useSearchParams } from 'react-router-dom';
import { Badge, Card, ClickRow, Empty, ErrorBox, Loading, PageHeader, Pagination, SearchBox, SellerPicker, SortSelect, StatusBadge, Tabs } from '../../components/ui.jsx';
import { SUPPORT_STATUS, SUPPORT_TOPIC, dateTime } from '../../format.js';
import { useApi, useDebounced, useTitle } from '../../hooks.js';

const LIMIT = 50;

/** Who is answering a request: the seller of the order, or TSM (after a take-over, or when it never had a seller). */
export function HandlerBadge({ request }) {
  if (request.handler === 'tsm') return <Badge tone="blue">{request.takenOverAt ? 'TSM (took over)' : 'TSM'}</Badge>;
  return <Badge tone="gold">Seller</Badge>;
}

export default function Support() {
  useTitle('Support inbox');
  const [search, setSearch] = useState('');
  const q = useDebounced(search);
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState(['open', 'answered', 'closed', 'all'].includes(params.get('status')) ? params.get('status') : 'open');
  const [handler, setHandler] = useState('all');
  const [sort, setSort] = useState('newest');
  const [offset, setOffset] = useState(0);
  const sellerId = params.get('sellerId') || undefined;
  const pickSeller = (id) => { setParams(id ? { sellerId: id } : {}, { replace: true }); setOffset(0); };
  const { data, error, loading, reload } = useApi(
    () => staffApi.get('/api/staff/support', { q, status, sellerId, handler, sort, limit: LIMIT, offset }),
    [q, status, sellerId, handler, sort, offset],
  );
  const counts = data?.counts;
  const tabs = [
    { value: 'open', label: 'Open', count: counts?.open },
    { value: 'answered', label: 'Answered', count: counts?.answered },
    { value: 'closed', label: 'Closed', count: counts?.closed },
    { value: 'all', label: 'All', count: counts ? counts.open + counts.answered + counts.closed : undefined },
  ];

  return (
    <>
      <PageHeader
        title="Support inbox"
        subtitle="Messages sent from the app’s Contact support screen. A request about an order goes to that order’s seller; you can always read and answer it, and you can take it over if the seller isn’t doing a good job. Guests are answered by email."
      />
      <Tabs tabs={tabs} value={status} onChange={(v) => { setStatus(v); setOffset(0); }} />
      <Card padded={false}>
        <div className="filters">
          <SearchBox value={search} onChange={(v) => { setSearch(v); setOffset(0); }} placeholder="Search reference, subject, name or email…" />
          <SellerPicker sellerId={sellerId} onChange={pickSeller} placeholder="Filter by seller…" />
          <select className="input" value={handler} onChange={(e) => { setHandler(e.target.value); setOffset(0); }} aria-label="Who is handling it">
            <option value="all">Everyone handling</option>
            <option value="seller">With the seller</option>
            <option value="tsm">With TSM</option>
          </select>
          <SortSelect value={sort} onChange={(v) => { setSort(v); setOffset(0); }} />
        </div>
        {error && <div style={{ padding: 16 }}><ErrorBox error={error} onRetry={reload} /></div>}
        {loading && !data ? <Loading /> : data && (data.items.length ? (
          <>
            <div className="table-wrap">
              <table>
                <thead><tr><th scope="col">Reference</th><th scope="col">From</th><th scope="col">Topic</th><th scope="col">Subject</th><th scope="col">Seller</th><th scope="col">Handled by</th><th scope="col">Status</th><th scope="col">Last activity</th></tr></thead>
                <tbody>
                  {data.items.map((r) => (
                    <ClickRow key={r.id} to={`/staff/support/${r.id}`}>
                      <td className="nowrap"><strong>{r.ref}</strong></td>
                      <td>{r.name} {r.isGuest && <Badge tone="gray">Guest</Badge>}<div className="muted small">{r.email}</div></td>
                      <td>{SUPPORT_TOPIC[r.topic] || r.topic}</td>
                      <td>{r.subject}{r.orderNumber && <div className="muted small">Order {r.orderNumber}</div>}</td>
                      <td>{r.seller ? (r.seller.isTsm ? <>{r.seller.displayName} <Badge tone="purple">TSM</Badge></> : r.seller.displayName) : <span className="muted">—</span>}</td>
                      <td>{r.seller ? <HandlerBadge request={r} /> : <Badge tone="blue">TSM</Badge>}</td>
                      <td><StatusBadge map={SUPPORT_STATUS} value={r.status} /></td>
                      <td className="nowrap">{dateTime(r.updatedAt)}</td>
                    </ClickRow>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination total={data.total} limit={LIMIT} offset={offset} onChange={setOffset} />
          </>
        ) : <Empty title={status === 'open' ? 'Nothing waiting for an answer' : 'No requests here'}>{sellerId ? 'Try “All” above, or clear the seller filter.' : null}</Empty>)}
      </Card>
    </>
  );
}
