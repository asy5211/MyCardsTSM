import { useState } from 'react';
import { Link } from 'react-router-dom';
import { staffApi } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import {
  Alert, Button, Card, Empty, ErrorBox, Field, Loading, Modal, PageHeader, Pagination, PromptModal, SortSelect, Stat, StatusBadge, Tabs, useToast,
} from '../../components/ui.jsx';
import { EARNING_STATUS, PAYOUT_STATUS, date, dateTime, money } from '../../format.js';
import { useApi, useTitle } from '../../hooks.js';

const LIMIT = 50;

function CreatePayoutModal({ seller, onDone, onClose }) {
  const toast = useToast();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const create = async () => {
    setBusy(true);
    setError('');
    try {
      await staffApi.post('/api/staff/payouts', { sellerId: seller.sellerId, note: note.trim() || undefined });
      toast(`Payout of ${money(seller.availableCents)} created for ${seller.displayName}`);
      onDone();
      onClose();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };
  return (
    <Modal
      title={`Create payout for ${seller.displayName}`}
      onClose={busy ? () => {} : onClose}
      footer={(<><Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button><Button onClick={create} loading={busy}>Create payout</Button></>)}
    >
      <p>
        This bundles <strong>all {money(seller.availableCents)}</strong> currently available to {seller.displayName} into one pending payout.
        Nothing is sent yet: send the money from your bank, then come back and mark the payout as paid with the transfer reference.
      </p>
      <Field label="Note (optional)"><input className="input" value={note} maxLength={255} onChange={(e) => setNote(e.target.value)} placeholder="For example: October payout" /></Field>
      {error && <Alert tone="error">{error}</Alert>}
    </Modal>
  );
}

function PayoutModal({ payoutId, canWrite, onChanged, onClose }) {
  const toast = useToast();
  const { data: p, error, loading, reload } = useApi(() => staffApi.get(`/api/staff/payouts/${payoutId}`), [payoutId]);
  const [dialog, setDialog] = useState(null);

  return (
    <Modal title="Payout" wide onClose={onClose}>
      {loading && !p && <Loading />}
      {error && !p && <ErrorBox error={error} onRetry={reload} />}
      {p && (
        <>
          <div className="row-between">
            <div>
              <div style={{ fontSize: 26, fontWeight: 800 }}>{money(p.amountCents)}</div>
              <div className="muted">to <Link to={`/staff/sellers/${p.sellerId}`} onClick={onClose}>{p.sellerName}</Link> · {p.earningsCount} sale{p.earningsCount === 1 ? '' : 's'}</div>
            </div>
            <StatusBadge map={PAYOUT_STATUS} value={p.status} />
          </div>
          <div className="muted small">
            Created {dateTime(p.createdAt)}
            {p.paidAt && ` · paid ${dateTime(p.paidAt)}`}
            {p.cancelledAt && ` · cancelled ${dateTime(p.cancelledAt)}`}
            {p.reference && <> · reference <code>{p.reference}</code></>}
            {p.note && <> · “{p.note}”</>}
          </div>
          <div className="table-wrap" style={{ border: '1px solid var(--border)', borderRadius: 10 }}>
            <table>
              <thead><tr><th scope="col">Sale</th><th scope="col" className="num">Qty</th><th scope="col" className="num">Gross</th><th scope="col" className="num">Commission</th><th scope="col" className="num">Net</th></tr></thead>
              <tbody>
                {p.earnings.map((e) => (
                  <tr key={e.id}>
                    <td><strong>{e.productName}</strong><div className="muted small">{e.orderRef} · {date(e.createdAt)}</div></td>
                    <td className="num">{e.quantity}</td>
                    <td className="num">{money(e.grossCents)}</td>
                    <td className="num">−{money(e.commissionCents)}</td>
                    <td className="num"><strong>{money(e.netCents)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {p.status === 'pending' && canWrite && (
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <Button variant="danger" onClick={() => setDialog('cancel')}>Cancel payout</Button>
              <Button onClick={() => setDialog('pay')}>Mark as paid…</Button>
            </div>
          )}
          {dialog === 'pay' && (
            <PromptModal
              title="Mark payout as paid"
              description={`Only do this after you actually sent ${money(p.amountCents)} to ${p.sellerName}. The seller will see it as paid.`}
              label="Transfer reference"
              placeholder="Bank or Shopify transfer reference"
              confirmLabel="Mark as paid"
              multiline={false}
              minLength={3}
              onConfirm={async (reference) => {
                await staffApi.post(`/api/staff/payouts/${payoutId}/mark-paid`, { reference });
                toast('Payout marked as paid');
                onChanged();
                reload();
              }}
              onClose={() => setDialog(null)}
            />
          )}
          {dialog === 'cancel' && (
            <PromptModal
              title="Cancel this payout?"
              description="The sales go back to “available” and can be bundled into a new payout."
              label="Reason"
              confirmLabel="Cancel payout"
              danger
              onConfirm={async (reason) => {
                await staffApi.post(`/api/staff/payouts/${payoutId}/cancel`, { reason });
                toast('Payout cancelled');
                onChanged();
                reload();
              }}
              onClose={() => setDialog(null)}
            />
          )}
        </>
      )}
    </Modal>
  );
}

function Overview({ canWrite, onOpenPayout, refreshKey, onChanged }) {
  const { data, error, loading, reload } = useApi(() => staffApi.get('/api/staff/payouts/overview'), [refreshKey]);
  const [creating, setCreating] = useState(null);
  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorBox error={error} onRetry={reload} />;
  const t = data.totals;
  return (
    <div className="stack">
      <div className="grid grid-stats">
        <Stat label="Available to pay" value={money(t.availableCents)} tone="gold" hint="sold, not yet in a payout" />
        <Stat label="In pending payouts" value={money(t.inPayoutCents)} hint="waiting for you to send it" />
        <Stat label="Paid out" value={money(t.paidCents)} tone="green" />
        <Stat label="Gross sales" value={money(t.grossCents)} />
        <Stat label="TSM commission" value={money(t.commissionCents)} />
      </div>
      <Card title="Balance per seller" padded={false}>
        <div className="table-wrap">
          <table>
            <thead><tr><th scope="col">Seller</th><th scope="col" className="num">Gross sales</th><th scope="col" className="num">Commission</th><th scope="col" className="num">Available</th><th scope="col" className="num">In payout</th><th scope="col" className="num">Paid</th>{canWrite && <th scope="col" />}</tr></thead>
            <tbody>
              {data.sellers.map((s) => (
                <tr key={s.sellerId}>
                  <td><Link to={`/staff/sellers/${s.sellerId}`}><strong>{s.displayName}</strong></Link>{s.sellerStatus === 'suspended' && <span className="badge badge-red" style={{ marginLeft: 8 }}>Suspended</span>}</td>
                  <td className="num">{money(s.grossCents)}</td>
                  <td className="num">{money(s.commissionCents)}</td>
                  <td className="num"><strong>{money(s.availableCents)}</strong></td>
                  <td className="num">{money(s.inPayoutCents)}</td>
                  <td className="num">{money(s.paidCents)}</td>
                  {canWrite && (
                    <td className="right">
                      <Button size="sm" disabled={s.availableCents <= 0} onClick={() => setCreating(s)}>Create payout</Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      {creating && <CreatePayoutModal seller={creating} onDone={() => { onChanged(); reload(); }} onClose={() => setCreating(null)} />}
    </div>
  );
}

function PayoutList({ onOpenPayout, refreshKey }) {
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState('newest');
  const [offset, setOffset] = useState(0);
  const { data, error, loading, reload } = useApi(() => staffApi.get('/api/staff/payouts', { status, sort, limit: LIMIT, offset }), [status, sort, offset, refreshKey]);
  return (
    <Card padded={false}>
      <div className="filters">
        <select className="input" value={status} onChange={(e) => { setStatus(e.target.value); setOffset(0); }} aria-label="Status">
          <option value="all">All payouts</option>
          <option value="pending">Pending (not sent yet)</option>
          <option value="paid">Paid</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <SortSelect value={sort} onChange={(v) => { setSort(v); setOffset(0); }} />
      </div>
      {error && <div style={{ padding: 16 }}><ErrorBox error={error} onRetry={reload} /></div>}
      {loading && !data ? <Loading /> : data && (data.items.length ? (
        <>
          <div className="table-wrap">
            <table>
              <thead><tr><th scope="col">Created</th><th scope="col">Seller</th><th scope="col" className="num">Amount</th><th scope="col" className="num">Sales</th><th scope="col">Reference</th><th scope="col">Status</th></tr></thead>
              <tbody>
                {data.items.map((p) => (
                  <tr key={p.id} className="click-row" tabIndex={0} onClick={() => onOpenPayout(p.id)} onKeyDown={(e) => e.key === 'Enter' && onOpenPayout(p.id)}>
                    <td className="nowrap">{date(p.createdAt)}</td>
                    <td><strong>{p.sellerName}</strong></td>
                    <td className="num">{money(p.amountCents)}</td>
                    <td className="num">{p.earningsCount}</td>
                    <td>{p.reference ? <code>{p.reference}</code> : '—'}</td>
                    <td><StatusBadge map={PAYOUT_STATUS} value={p.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination total={data.total} limit={LIMIT} offset={offset} onChange={setOffset} />
        </>
      ) : <Empty title="No payouts yet">Create one from the Overview tab when a seller has money available.</Empty>)}
    </Card>
  );
}

function Ledger({ refreshKey }) {
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState('newest');
  const [offset, setOffset] = useState(0);
  const { data, error, loading, reload } = useApi(() => staffApi.get('/api/staff/earnings', { status, sort, limit: LIMIT, offset }), [status, sort, offset, refreshKey]);
  return (
    <Card padded={false}>
      <div className="filters">
        <select className="input" value={status} onChange={(e) => { setStatus(e.target.value); setOffset(0); }} aria-label="Status">
          <option value="all">All sales</option>
          <option value="available">Available</option>
          <option value="in_payout">In a payout</option>
          <option value="paid">Paid</option>
          <option value="reversed">Reversed</option>
        </select>
        <SortSelect value={sort} onChange={(v) => { setSort(v); setOffset(0); }} />
      </div>
      {error && <div style={{ padding: 16 }}><ErrorBox error={error} onRetry={reload} /></div>}
      {loading && !data ? <Loading /> : data && (data.items.length ? (
        <>
          <div className="table-wrap">
            <table>
              <thead><tr><th scope="col">Date</th><th scope="col">Order</th><th scope="col">Seller</th><th scope="col">Product</th><th scope="col" className="num">Qty</th><th scope="col" className="num">Gross</th><th scope="col" className="num">Commission</th><th scope="col" className="num">Net</th><th scope="col">Status</th></tr></thead>
              <tbody>
                {data.items.map((e) => (
                  <tr key={e.id}>
                    <td className="nowrap">{date(e.createdAt)}</td>
                    <td className="mono">{e.orderRef}</td>
                    <td>{e.sellerName}</td>
                    <td>{e.productName}</td>
                    <td className="num">{e.quantity}</td>
                    <td className="num">{money(e.grossCents)}</td>
                    <td className="num">{money(e.commissionCents)}</td>
                    <td className="num"><strong>{money(e.netCents)}</strong></td>
                    <td><StatusBadge map={EARNING_STATUS} value={e.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination total={data.total} limit={LIMIT} offset={offset} onChange={setOffset} />
        </>
      ) : <Empty title="No sales recorded yet">Sales appear here once customers check out.</Empty>)}
    </Card>
  );
}

export default function Payouts() {
  useTitle('Payouts');
  const { canWrite } = useAuth();
  const [tab, setTab] = useState('overview');
  const [openId, setOpenId] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const bump = () => setRefreshKey((k) => k + 1);

  return (
    <>
      <PageHeader
        title="Payouts"
        subtitle="What sellers have earned and what you owe them. TSM sends the money (bank transfer or Shopify) and records it here. Each sale shows the seller’s share after TSM’s commission."
      />
      <Tabs
        tabs={[{ value: 'overview', label: 'Overview' }, { value: 'payouts', label: 'Payouts' }, { value: 'ledger', label: 'Sales ledger' }]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'overview' && <Overview canWrite={canWrite} onOpenPayout={setOpenId} refreshKey={refreshKey} onChanged={() => { bump(); setTab('payouts'); }} />}
      {tab === 'payouts' && <PayoutList onOpenPayout={setOpenId} refreshKey={refreshKey} />}
      {tab === 'ledger' && <Ledger refreshKey={refreshKey} />}
      {openId && <PayoutModal payoutId={openId} canWrite={canWrite} onChanged={bump} onClose={() => setOpenId(null)} />}
    </>
  );
}
