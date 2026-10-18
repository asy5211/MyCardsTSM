import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { staffApi } from '../../api.js';
import { Badge, Card, ClickRow, Empty, ErrorBox, Loading, PageHeader, Pagination, SearchBox, StatusBadge } from '../../components/ui.jsx';
import { ACCOUNT_STATUS, date } from '../../format.js';
import { useApi, useDebounced, useTitle } from '../../hooks.js';

const LIMIT = 50;

export default function Users() {
  useTitle('Users');
  const [params] = useSearchParams();
  const [search, setSearch] = useState(params.get('q') || '');
  const q = useDebounced(search);
  const [status, setStatus] = useState('all');
  const [offset, setOffset] = useState(0);
  const { data, error, loading, reload } = useApi(
    () => staffApi.get('/api/staff/users', { q, status, limit: LIMIT, offset }),
    [q, status, offset],
  );

  return (
    <>
      <PageHeader title="Users" subtitle="Everyone with an account in the app. Opening a person’s details is recorded in the activity log." />
      <Card padded={false}>
        <div className="filters">
          <SearchBox value={search} onChange={(v) => { setSearch(v); setOffset(0); }} placeholder="Search username or email…" />
          <select className="input" value={status} onChange={(e) => { setStatus(e.target.value); setOffset(0); }} aria-label="Status">
            <option value="all">Any status</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="deleted">Deleted</option>
          </select>
        </div>
        {error && <div style={{ padding: 16 }}><ErrorBox error={error} onRetry={reload} /></div>}
        {loading && !data ? <Loading /> : data && (data.items.length ? (
          <>
            <div className="table-wrap">
              <table>
                <thead><tr><th scope="col">Username</th><th scope="col">Email</th><th scope="col">Joined</th><th scope="col">Last sign-in</th><th scope="col">Role</th><th scope="col">Status</th></tr></thead>
                <tbody>
                  {data.items.map((u) => (
                    <ClickRow key={u.id} to={`/staff/users/${u.id}`}>
                      <td><strong>{u.username}</strong></td>
                      <td>{u.email}</td>
                      <td className="nowrap">{date(u.createdAt)}</td>
                      <td className="nowrap">{date(u.lastLoginAt)}</td>
                      <td>{u.isSeller ? <Badge tone="gold">Seller</Badge> : <span className="muted">Shopper</span>}</td>
                      <td><StatusBadge map={ACCOUNT_STATUS} value={u.status} /></td>
                    </ClickRow>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination total={data.total} limit={LIMIT} offset={offset} onChange={setOffset} />
          </>
        ) : <Empty title="No users found" />)}
      </Card>
    </>
  );
}
