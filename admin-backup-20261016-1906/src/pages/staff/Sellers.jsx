import { useState } from 'react';
import { staffApi } from '../../api.js';
import { Card, ClickRow, Empty, ErrorBox, Loading, PageHeader, Pagination, SearchBox, StatusBadge } from '../../components/ui.jsx';
import { ACCOUNT_STATUS, date, money } from '../../format.js';
import { useApi, useDebounced, useTitle } from '../../hooks.js';

const LIMIT = 50;

export default function Sellers() {
  useTitle('Sellers');
  const [search, setSearch] = useState('');
  const q = useDebounced(search);
  const [status, setStatus] = useState('all');
  const [offset, setOffset] = useState(0);
  const { data, error, loading, reload } = useApi(
    () => staffApi.get('/api/staff/sellers', { q, status, limit: LIMIT, offset }),
    [q, status, offset],
  );

  return (
    <>
      <PageHeader title="Sellers" subtitle="Approved sellers. Open one to see their offers, sales and activity, or to suspend them." />
      <Card padded={false}>
        <div className="filters">
          <SearchBox value={search} onChange={(v) => { setSearch(v); setOffset(0); }} placeholder="Search store, email or username…" />
          <select className="input" value={status} onChange={(e) => { setStatus(e.target.value); setOffset(0); }} aria-label="Status">
            <option value="all">Any status</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </select>
        </div>
        {error && <div style={{ padding: 16 }}><ErrorBox error={error} onRetry={reload} /></div>}
        {loading && !data ? <Loading /> : data && (data.items.length ? (
          <>
            <div className="table-wrap">
              <table>
                <thead><tr><th scope="col">Store</th><th scope="col">Account</th><th scope="col" className="num">Offers</th><th scope="col" className="num">Live</th><th scope="col" className="num">Sales</th><th scope="col" className="num">Owed</th><th scope="col">Approved</th><th scope="col">Status</th></tr></thead>
                <tbody>
                  {data.items.map((s) => (
                    <ClickRow key={s.id} to={`/staff/sellers/${s.id}`}>
                      <td><strong>{s.displayName}</strong></td>
                      <td>{s.username}<div className="muted small">{s.email}</div></td>
                      <td className="num">{s.listingCount}</td>
                      <td className="num">{s.liveListingCount}</td>
                      <td className="num">{s.salesCount}</td>
                      <td className="num">{money(s.availableCents)}</td>
                      <td className="nowrap">{date(s.approvedAt)}</td>
                      <td><StatusBadge map={ACCOUNT_STATUS} value={s.status} /></td>
                    </ClickRow>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination total={data.total} limit={LIMIT} offset={offset} onChange={setOffset} />
          </>
        ) : <Empty title="No sellers found" />)}
      </Card>
    </>
  );
}
