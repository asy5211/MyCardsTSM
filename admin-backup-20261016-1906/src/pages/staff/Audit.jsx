import { Fragment, useState } from 'react';
import { staffApi } from '../../api.js';
import { Badge, Button, Card, Empty, ErrorBox, Loading, PageHeader, Pagination, SearchBox, useToast } from '../../components/ui.jsx';
import { actionText, dateTime } from '../../format.js';
import { useApi, useDebounced, useTitle } from '../../hooks.js';

const LIMIT = 50;
const ACTOR_TONE = { staff: 'blue', user: 'gold', system: 'gray' };

/** One CSV cell. Cells that start with = + - @ get a leading quote so spreadsheets never run them as formulas. */
function cell(value) {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

async function exportCsv(filters, toast, setBusy) {
  setBusy(true);
  try {
    const rows = [];
    let offset = 0;
    let total = 0;
    do {
      // eslint-disable-next-line no-await-in-loop
      const page = await staffApi.get('/api/staff/audit', { ...filters, limit: 500, offset });
      rows.push(...page.items);
      total = page.total;
      offset += 500;
    } while (offset < total && rows.length < 20_000);
    const header = ['Time (UTC)', 'Who type', 'Who', 'Action', 'Record type', 'Record id', 'IP address', 'Details'];
    const lines = [header.map(cell).join(',')];
    for (const a of rows) {
      lines.push([a.createdAt, a.actorType, a.actorName, a.action, a.entityType, a.entityId, a.ip, a.details ? JSON.stringify(a.details) : ''].map(cell).join(','));
    }
    const blob = new Blob([`﻿${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `tsm-activity-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    toast(`Exported ${rows.length.toLocaleString('en-US')} entries${total > rows.length ? ` (first ${rows.length.toLocaleString('en-US')} of ${total.toLocaleString('en-US')}; narrow the dates for the rest)` : ''}`);
  } catch (e) {
    toast(e.message, 'error');
  }
  setBusy(false);
}

export default function Audit() {
  useTitle('Activity log');
  const toast = useToast();
  const [search, setSearch] = useState('');
  const q = useDebounced(search);
  const [actorType, setActorType] = useState('all');
  const [action, setAction] = useState('all');
  const [entityType, setEntityType] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [offset, setOffset] = useState(0);
  const [openId, setOpenId] = useState(null);
  const [exporting, setExporting] = useState(false);

  const filters = { q, actorType, action, entityType, from, to };
  const menus = useApi(() => staffApi.get('/api/staff/audit/filters'), []);
  const { data, error, loading, reload } = useApi(
    () => staffApi.get('/api/staff/audit', { ...filters, limit: LIMIT, offset }),
    [q, actorType, action, entityType, from, to, offset],
  );
  const reset = (setter) => (e) => { setter(e.target.value); setOffset(0); };

  return (
    <>
      <PageHeader
        title="Activity log"
        subtitle="Every change made through the app and this website: who did it, what changed, and when. Entries cannot be edited or deleted."
        actions={<Button variant="secondary" loading={exporting} onClick={() => exportCsv(filters, toast, setExporting)}>Export CSV</Button>}
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
    </>
  );
}
