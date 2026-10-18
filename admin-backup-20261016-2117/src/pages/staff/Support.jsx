import { useState } from 'react';
import { staffApi } from '../../api.js';
import { Badge, Card, ClickRow, Empty, ErrorBox, Loading, PageHeader, Pagination, SearchBox, StatusBadge, Tabs } from '../../components/ui.jsx';
import { SUPPORT_STATUS, SUPPORT_TOPIC, dateTime } from '../../format.js';
import { useApi, useDebounced, useTitle } from '../../hooks.js';

const LIMIT = 50;

export default function Support() {
  useTitle('Support inbox');
  const [search, setSearch] = useState('');
  const q = useDebounced(search);
  const [status, setStatus] = useState('open');
  const [offset, setOffset] = useState(0);
  const { data, error, loading, reload } = useApi(
    () => staffApi.get('/api/staff/support', { q, status, limit: LIMIT, offset }),
    [q, status, offset],
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
        subtitle="Messages sent from the app’s Contact support screen, by signed-in people and by guests. Signed-in people read your reply in the app; guests are answered by email."
      />
      <Tabs tabs={tabs} value={status} onChange={(v) => { setStatus(v); setOffset(0); }} />
      <Card padded={false}>
        <div className="filters">
          <SearchBox value={search} onChange={(v) => { setSearch(v); setOffset(0); }} placeholder="Search reference, subject, name or email…" />
        </div>
        {error && <div style={{ padding: 16 }}><ErrorBox error={error} onRetry={reload} /></div>}
        {loading && !data ? <Loading /> : data && (data.items.length ? (
          <>
            <div className="table-wrap">
              <table>
                <thead><tr><th scope="col">Reference</th><th scope="col">From</th><th scope="col">Topic</th><th scope="col">Subject</th><th scope="col">Status</th><th scope="col">Last activity</th></tr></thead>
                <tbody>
                  {data.items.map((r) => (
                    <ClickRow key={r.id} to={`/staff/support/${r.id}`}>
                      <td className="nowrap"><strong>{r.ref}</strong></td>
                      <td>{r.name} {r.isGuest && <Badge tone="gray">Guest</Badge>}<div className="muted small">{r.email}</div></td>
                      <td>{SUPPORT_TOPIC[r.topic] || r.topic}</td>
                      <td>{r.subject}</td>
                      <td><StatusBadge map={SUPPORT_STATUS} value={r.status} /></td>
                      <td className="nowrap">{dateTime(r.updatedAt)}</td>
                    </ClickRow>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination total={data.total} limit={LIMIT} offset={offset} onChange={setOffset} />
          </>
        ) : <Empty title={status === 'open' ? 'Nothing waiting for an answer' : 'No requests here'} />)}
      </Card>
    </>
  );
}
