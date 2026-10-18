import { useState } from 'react';
import { staffApi } from '../../api.js';
import { Card, ClickRow, Empty, ErrorBox, Loading, PageHeader, Pagination, SearchBox, StatusBadge, Tabs } from '../../components/ui.jsx';
import { TICKET_STATUS, date, money } from '../../format.js';
import { useApi, useDebounced, useTitle } from '../../hooks.js';

const LIMIT = 50;

/** Short text for the Items column: the first product and how many more. */
function itemsText(items) {
  const live = items.filter((i) => !i.removedByAdmin);
  if (!live.length) return '—';
  const units = live.reduce((sum, i) => sum + i.quantity, 0);
  return `${live[0].productName}${live.length > 1 ? ` + ${live.length - 1} more` : ''} · ${units} item${units === 1 ? '' : 's'}`;
}

export default function Tickets() {
  useTitle('Sell-to-us tickets');
  const [search, setSearch] = useState('');
  const q = useDebounced(search);
  const [status, setStatus] = useState('all');
  const [offset, setOffset] = useState(0);
  const { data, error, loading, reload } = useApi(
    () => staffApi.get('/api/staff/tickets', { q, status, limit: LIMIT, offset }),
    [q, status, offset],
  );
  const counts = data?.counts;
  const sum = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : undefined;
  const tabs = [
    { value: 'all', label: 'All', count: sum },
    ...Object.entries(TICKET_STATUS).map(([value, v]) => ({ value, label: v.label, count: counts?.[value] })),
  ];

  return (
    <>
      <PageHeader
        title="Sell-to-us tickets"
        subtitle="Sellers offer stock to TSM here. Review the items, send a price, and answer their counter offers. Payment happens outside the app: mark a ticket completed once you have paid."
      />
      <Tabs tabs={tabs} value={status} onChange={(v) => { setStatus(v); setOffset(0); }} />
      <Card padded={false}>
        <div className="filters">
          <SearchBox value={search} onChange={(v) => { setSearch(v); setOffset(0); }} placeholder="Search ticket number, seller or product…" />
        </div>
        {error && <div style={{ padding: 16 }}><ErrorBox error={error} onRetry={reload} /></div>}
        {loading && !data ? <Loading /> : data && (data.items.length ? (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Ticket</th>
                    <th scope="col">Seller</th>
                    <th scope="col">Items</th>
                    <th scope="col" className="num">They ask</th>
                    <th scope="col" className="num">Current price</th>
                    <th scope="col">Status</th>
                    <th scope="col">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((t) => (
                    <ClickRow key={t.id} to={`/staff/tickets/${t.id}`}>
                      <td className="nowrap"><strong>{t.ticketNumber}</strong></td>
                      <td>{t.seller.displayName || t.seller.username}<div className="muted small">{t.seller.email}</div></td>
                      <td>{itemsText(t.items)}</td>
                      <td className="num">{money(t.askingTotalCents)}</td>
                      <td className="num">
                        {t.offerCents === null ? '—' : money(t.offerCents)}
                        {t.offerCents !== null && <div className="muted small">{t.offerBy === 'staff' ? 'from TSM' : 'from seller'}</div>}
                      </td>
                      <td><StatusBadge map={TICKET_STATUS} value={t.status} /></td>
                      <td className="nowrap">{date(t.updatedAt)}</td>
                    </ClickRow>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination total={data.total} limit={LIMIT} offset={offset} onChange={setOffset} />
          </>
        ) : <Empty title="No tickets here" />)}
      </Card>
    </>
  );
}
