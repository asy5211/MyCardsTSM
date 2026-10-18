import { useState } from 'react';
import { staffApi } from '../../api.js';
import { Card, ClickRow, Empty, ErrorBox, Loading, PageHeader, Pagination, SortSelect, StatusBadge, Tabs } from '../../components/ui.jsx';
import { APPLICATION_STATUS, date, sourceLabel } from '../../format.js';
import { useApi, useTitle } from '../../hooks.js';

const TABS = [
  { value: 'submitted,under_review', label: 'Waiting' },
  { value: 'approved', label: 'Approved' },
  { value: 'declined', label: 'Declined' },
  { value: 'submitted,under_review,approved,declined', label: 'All' },
];
const LIMIT = 25;

export default function Applications() {
  useTitle('Seller applications');
  const [status, setStatus] = useState(TABS[0].value);
  const [sort, setSort] = useState('oldest'); // people who have waited longest first; other tabs start with the newest
  const [offset, setOffset] = useState(0);
  const { data, error, loading, reload } = useApi(
    () => staffApi.get('/api/staff/seller-applications', { status, sort, limit: LIMIT, offset }),
    [status, sort, offset],
  );

  return (
    <>
      <PageHeader
        title="Seller applications"
        subtitle="People who applied in the app to sell on TSM. Check their documents, then approve or decline. Only approved sellers can list products."
      />
      <Tabs tabs={TABS} value={status} onChange={(v) => { setStatus(v); setSort(v === TABS[0].value ? 'oldest' : 'newest'); setOffset(0); }} />
      <Card padded={false}>
        <div className="filters">
          <SortSelect value={sort} onChange={(v) => { setSort(v); setOffset(0); }} />
        </div>
        {error && <div style={{ padding: 16 }}><ErrorBox error={error} onRetry={reload} /></div>}
        {loading && !data ? <Loading /> : data && (data.items.length ? (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th scope="col">Business</th><th scope="col">Applicant</th><th scope="col">Sources from</th><th scope="col">Documents</th><th scope="col">Submitted</th><th scope="col">Status</th></tr>
                </thead>
                <tbody>
                  {data.items.map((a) => (
                    <ClickRow key={a.id} to={`/staff/applications/${a.id}`}>
                      <td><strong>{a.businessName}</strong>{a.isTest && <span className="muted small"> (test)</span>}</td>
                      <td>{a.applicant.username}<div className="muted small">{a.applicant.email}</div></td>
                      <td>{a.sourceType === 'test' ? 'Test' : sourceLabel(a.sourceType)}</td>
                      <td>{a.documentCount}</td>
                      <td className="nowrap">{date(a.submittedAt)}</td>
                      <td><StatusBadge map={APPLICATION_STATUS} value={a.status} /></td>
                    </ClickRow>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination total={data.total} limit={LIMIT} offset={offset} onChange={setOffset} />
          </>
        ) : (
          <Empty title="No applications here">When someone applies from the app, they will show up in Waiting.</Empty>
        ))}
      </Card>
    </>
  );
}
