import { Fragment, useState } from 'react';
import { staffApi } from '../../api.js';
import { Alert, Badge, Button, Card, Empty, ErrorBox, Field, Loading, Modal, PageHeader, Pagination, SearchBox, SortSelect, useToast } from '../../components/ui.jsx';
import { actionText, dateTime } from '../../format.js';
import { useApi, useDebounced, useTitle } from '../../hooks.js';

const LIMIT = 50;
const ACTOR_TONE = { staff: 'blue', user: 'gold', system: 'gray' };

const todayText = () => new Date().toISOString().slice(0, 10);
const daysAgoText = (n) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

/** Asks for a start and end date, then downloads exactly that time range as a CSV (the server builds the file). */
function ExportModal({ filters, onClose }) {
  const toast = useToast();
  const [from, setFrom] = useState(filters.from || daysAgoText(30));
  const [to, setTo] = useState(filters.to || todayText());
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');

  const quick = (days) => { setFrom(daysAgoText(days)); setTo(todayText()); setErrors({}); };

  const run = async () => {
    setErrors({});
    setError('');
    if (!from || !to) {
      setErrors({ from: from ? undefined : 'Choose a start date', to: to ? undefined : 'Choose an end date' });
      return;
    }
    setBusy(true);
    try {
      const name = await staffApi.saveFile(
        '/api/staff/audit/export',
        { from, to, q: filters.q, actorType: filters.actorType, action: filters.action, entityType: filters.entityType },
        `tsm-activity-${from}-to-${to}.csv`,
      );
      toast(`Saved ${name}`);
      onClose();
    } catch (e) {
      setErrors(e.fieldErrors);
      if (!Object.keys(e.fieldErrors).length) setError(e.message);
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Export activity log"
      onClose={busy ? () => {} : onClose}
      footer={(<><Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button><Button onClick={run} loading={busy}>Download CSV</Button></>)}
    >
      <p className="muted small" style={{ marginTop: 0 }}>
        Choose the time range to export. Both dates are included, up to one year at a time. The search and filters you have set on this page also apply.
      </p>
      <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
        <Field label="From" required error={errors.from}>
          <input type="date" className="input" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="To" required error={errors.to}>
          <input type="date" className="input" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
        </Field>
      </div>
      <div className="pill-row" style={{ marginBottom: 12 }}>
        <button type="button" className="pill" onClick={() => quick(7)}>Last 7 days</button>
        <button type="button" className="pill" onClick={() => quick(30)}>Last 30 days</button>
        <button type="button" className="pill" onClick={() => quick(90)}>Last 90 days</button>
        <button type="button" className="pill" onClick={() => quick(365)}>Last year</button>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
    </Modal>
  );
}

export default function Audit() {
  useTitle('Activity log');
  const [search, setSearch] = useState('');
  const q = useDebounced(search);
  const [actorType, setActorType] = useState('all');
  const [action, setAction] = useState('all');
  const [entityType, setEntityType] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sort, setSort] = useState('newest');
  const [offset, setOffset] = useState(0);
  const [openId, setOpenId] = useState(null);
  const [exportOpen, setExportOpen] = useState(false);

  const filters = { q, actorType, action, entityType, from, to };
  const menus = useApi(() => staffApi.get('/api/staff/audit/filters'), []);
  const { data, error, loading, reload } = useApi(
    () => staffApi.get('/api/staff/audit', { ...filters, sort, limit: LIMIT, offset }),
    [q, actorType, action, entityType, from, to, sort, offset],
  );
  const reset = (setter) => (e) => { setter(e.target.value); setOffset(0); };

  return (
    <>
      <PageHeader
        title="Activity log"
        subtitle="Every change made through the app and this website: who did it, what changed, and when. Entries cannot be edited or deleted."
        actions={<Button variant="secondary" onClick={() => setExportOpen(true)}>Export CSV…</Button>}
      />
      <Card padded={false}>
        <div className="filters">
          <SearchBox value={search} onChange={(v) => { setSearch(v); setOffset(0); }} placeholder="Search names, ids, reasons…" />
          <select className="input" value={actorType} onChange={reset(setActorType)} aria-label="Who">
            <option value="all">Staff, users and system</option>
            <option value="staff">TSM staff</option>
            <option value="user">App users and sellers</option>
            <option value="system">System</option>
          </select>
          <select className="input" value={action} onChange={reset(setAction)} aria-label="Action">
            <option value="all">Any action</option>
            {menus.data?.actions.map((a) => <option key={a} value={a}>{actionText(a)}</option>)}
          </select>
          <select className="input" value={entityType} onChange={reset(setEntityType)} aria-label="Record type">
            <option value="all">Any record</option>
            {menus.data?.entityTypes.map((t) => <option key={t} value={t}>{actionText(t)}</option>)}
          </select>
          <label className="row small muted" style={{ gap: 6 }}>From <input type="date" className="input" style={{ width: 'auto' }} value={from} onChange={reset(setFrom)} /></label>
          <label className="row small muted" style={{ gap: 6 }}>To <input type="date" className="input" style={{ width: 'auto' }} value={to} onChange={reset(setTo)} /></label>
          <SortSelect value={sort} onChange={(v) => { setSort(v); setOffset(0); }} />
        </div>
        {error && <div style={{ padding: 16 }}><ErrorBox error={error} onRetry={reload} /></div>}
        {loading && !data ? <Loading /> : data && (data.items.length ? (
          <>
            <div className="table-wrap">
              <table>
                <thead><tr><th scope="col">When</th><th scope="col">Who</th><th scope="col">What happened</th><th scope="col">Record</th><th scope="col" /></tr></thead>
                <tbody>
                  {data.items.map((a) => (
                    <Fragment key={a.id}>
                      <tr>
                        <td className="nowrap">{dateTime(a.createdAt)}</td>
                        <td><Badge tone={ACTOR_TONE[a.actorType]}>{a.actorType}</Badge> {a.actorName}</td>
                        <td><strong>{actionText(a.action)}</strong>
                          {a.details?.reason && <div className="muted small">“{a.details.reason}”</div>}
                          {a.details?.product && <div className="muted small">{a.details.product}</div>}
                        </td>
                        <td><span className="muted">{a.entityType}</span>{a.entityId && <div className="mono faint">{String(a.entityId).slice(0, 8)}</div>}</td>
                        <td className="right">
                          {(a.details || a.ip) && <Button size="sm" variant="ghost" onClick={() => setOpenId(openId === a.id ? null : a.id)}>{openId === a.id ? 'Hide' : 'Details'}</Button>}
                        </td>
                      </tr>
                      {openId === a.id && (
                        <tr>
                          <td colSpan={5} style={{ background: 'var(--surface-2)' }}>
                            <div className="small muted">Entry #{a.id}{a.ip && ` · from ${a.ip}`}{a.entityId && ` · record ${a.entityId}`}</div>
                            {a.details && <pre className="details-json">{JSON.stringify(a.details, null, 2)}</pre>}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination total={data.total} limit={LIMIT} offset={offset} onChange={setOffset} />
          </>
        ) : <Empty title="No activity matches" />)}
      </Card>
      {exportOpen && <ExportModal filters={filters} onClose={() => setExportOpen(false)} />}
    </>
  );
}
