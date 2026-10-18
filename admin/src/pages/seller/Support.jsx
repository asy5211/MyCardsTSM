import { useState } from 'react';
import { sellerApi } from '../../api.js';
import { Badge, Card, ClickRow, Empty, ErrorBox, Loading, PageHeader, Pagination, SearchBox, SortSelect, StatusBadge, Tabs } from '../../components/ui.jsx';
import { SUPPORT_STATUS, SUPPORT_TOPIC, dateTime } from '../../format.js';
import { useApi, useDebounced, useTitle } from '../../hooks.js';

const LIMIT = 50;

export default function SellerSupport() {
  useTitle('Customer support');
  const [search, setSearch] = useState('');
  const q = useDebounced(search);
  const [status, setStatus] = useState('open');
  const [sort, setSort] = useState('newest');
  const [offset, setOffset] = useState(0);
  const { data, error, loading, reload } = useApi(
    () => sellerApi.get('/api/seller/support', { q, status, sort, limit: LIMIT, offset }),
    [q, status, sort, offset],
  );
  const counts = data?.counts;
  const tabs = [
    { value: 'open', label: 'Needs a reply', count: counts?.open },
    { value: 'answered', label: 'Answered', count: counts?.answered },
    { value: 'closed', label: 'Closed', count: counts?.closed },
    { value: 'all', label: 'All', count: counts ? counts.open + counts.answered + counts.closed : undefined },
  ];

  return (
    <>
      <PageHeader
        title="Customer support"
        subtitle="When a buyer asks for help with something they bought from you, it lands here and you answer them. TSM staff can read every request and step in if one needs help."
      />
      <Tabs tabs={tabs} value={status} onChange={(v) => { setStatus(v); setOffset(0); }} />
      <Card padded={false}>
        <div className="filters">
          <SearchBox value={search} onChange={(v) => { setSearch(v); setOffset(0); }} placeholder="Search reference, subject, order or buyer…" />
          <SortSelect value={sort} onChange={(v) => { setSort(v); setOffset(0); }} />
        </div>
        {error && <div style={{ padding: 16 }}><ErrorBox error={error} onRetry={reload} /></div>}
        {loading && !data ? <Loading /> : data && (data.items.length ? (
          <>
            <div className="table-wrap">
              <table>
                <thead><tr><th scope="col">Reference</th><th scope="col">Buyer</th><th scope="col">Order</th><th scope="col">Topic</th><th scope="col">Subject</th><th scope="col">Status</th><th scope="col">Last activity</th></tr></thead>
                <tbody>
                  {data.items.map((r) => (
                    <ClickRow key={r.id} to={`/seller/support/${r.id}`}>
                      <td className="nowrap"><strong>{r.ref}</strong></td>
                      <td>{r.buyer.username}</td>
                      <td className="nowrap">{r.orderNumber || <span className="muted">—</span>}</td>
                      <td>{SUPPORT_TOPIC[r.topic] || r.topic}</td>
                      <td>{r.subject} {r.handler === 'tsm' && <Badge tone="blue">TSM took over</Badge>}</td>
                      <td><StatusBadge map={SUPPORT_STATUS} value={r.status} /></td>
                      <td className="nowrap">{dateTime(r.updatedAt)}</td>
                    </ClickRow>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination total={data.total} limit={LIMIT} offset={offset} onChange={setOffset} />
          </>
        ) : <Empty title={status === 'open' ? 'Nothing waiting for a reply' : 'No requests here'}>Buyers reach you from the Report a Problem button on an order.</Empty>)}
      </Card>
    </>
  );
}
