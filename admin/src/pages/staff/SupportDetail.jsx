import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { staffApi } from '../../api.js';
import { Alert, Badge, Button, Card, ErrorBox, KeyValue, Loading, PageHeader, StatusBadge, Thread, useToast } from '../../components/ui.jsx';
import { HandlerBadge } from './Support.jsx';
import { SUPPORT_STATUS, SUPPORT_TOPIC, dateTime } from '../../format.js';
import { useApi, useTitle } from '../../hooks.js';

export default function SupportDetail() {
  const { id } = useParams();
  const toast = useToast();
  const { data, error, loading, reload } = useApi(() => staffApi.get(`/api/staff/support/${id}`), [id]);
  const [busy, setBusy] = useState(false);
  useTitle(data ? data.request.ref : 'Support request');

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorBox error={error} onRetry={reload} />;
  const { request: r, messages } = data;
  const closed = r.status === 'closed';
  const withSeller = r.seller && r.handler === 'seller';

  const setStatus = async (status) => {
    setBusy(true);
    try {
      await staffApi.post(`/api/staff/support/${id}/status`, { status });
      toast(status === 'closed' ? 'Request closed' : 'Request reopened');
      await reload();
    } catch (e) {
      toast(e.message, 'error');
    }
    setBusy(false);
  };

  const handOver = async (action) => {
    setBusy(true);
    try {
      await staffApi.post(`/api/staff/support/${id}/${action}`);
      toast(action === 'take-over' ? 'You took this request over. The seller can still read it but can no longer reply.' : `Handed back to ${r.seller.displayName}`);
      await reload();
    } catch (e) {
      toast(e.message, 'error');
    }
    setBusy(false);
  };

  return (
    <>
      <PageHeader
        back={{ to: '/staff/support', label: 'Support inbox' }}
        title={r.subject}
        subtitle={`${r.ref} · ${SUPPORT_TOPIC[r.topic] || r.topic} · opened ${dateTime(r.createdAt)}`}
        actions={closed
          ? <Button loading={busy} onClick={() => setStatus('open')}>Reopen</Button>
          : <Button variant="secondary" loading={busy} onClick={() => setStatus('closed')}>Close request</Button>}
      />
      <div className="stack">
        {r.seller && (
          <Alert tone={withSeller ? 'info' : 'warn'}>
            {withSeller ? (
              <span style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
                <span><strong>{r.seller.displayName} is handling this request.</strong> You can read it and reply at any time. If they aren’t doing a good job, take it over: they will still see it but can’t reply any more.</span>
                <Button variant="secondary" loading={busy} onClick={() => handOver('take-over')}>Take over</Button>
              </span>
            ) : (
              <span style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
                <span><strong>TSM took this over</strong>{r.takenOverBy ? ` (${r.takenOverBy})` : ''}. {r.seller.displayName} can read it but not reply.</span>
                <Button variant="secondary" loading={busy} onClick={() => handOver('hand-back')}>Hand back to {r.seller.displayName}</Button>
              </span>
            )}
          </Alert>
        )}
        {r.isGuest && (
          <Alert tone="warn">
            <span><strong>This person is a guest with no account.</strong> They cannot read replies in the app, so answer them by email at <a href={`mailto:${r.email}`}>{r.email}</a>. Notes you write below are kept for your team.</span>
          </Alert>
        )}
        <div className="grid grid-2">
          <Card title="From">
            <KeyValue rows={[
              ['Name', r.name],
              ['Email', <a key="e" href={`mailto:${r.email}`}>{r.email}</a>],
              ['Account', r.isGuest ? <Badge key="g" tone="gray">Guest</Badge> : <Badge key="m" tone="green">Signed in</Badge>],
              ['Status', <StatusBadge key="s" map={SUPPORT_STATUS} value={r.status} />],
            ]} />
          </Card>
          <Card title={r.seller ? 'Seller and order' : 'Look them up'}>
            <KeyValue rows={[
              ['Seller', r.seller ? (r.seller.isTsm ? <span key="s">{r.seller.displayName} <Badge tone="purple">TSM</Badge></span> : <Link key="s" to={`/staff/sellers/${r.seller.id}`}>{r.seller.displayName}</Link>) : undefined],
              ['Handled by', r.seller ? <HandlerBadge key="h" request={r} /> : undefined],
              ['Order', r.orderId ? <Link key="o" to={`/staff/orders/${r.orderId}`}>{r.orderNumber} →</Link> : undefined],
              ['Buyer', r.isGuest ? <span key="g" className="muted">Guest, no account</span> : <Link key="u" to={`/staff/users?q=${encodeURIComponent(r.email)}`}>Find {r.email} in Users →</Link>],
            ]} />
            {r.seller && <p className="faint small" style={{ margin: '10px 0 0' }}>Want to see how this seller is doing overall? <Link to={`/staff/support?sellerId=${r.seller.id}&status=all`}>All requests sent to them →</Link></p>}
          </Card>
        </div>
        <Card title="Conversation">
          <Thread
            messages={messages}
            canSend={!closed}
            closedText="This request is closed. Reopen it to write again."
            placeholder={r.isGuest ? 'Write a note for your team…' : 'Write your reply…'}
            sendLabel={r.isGuest ? 'Save note' : 'Send reply'}
            onSend={async (body) => {
              await staffApi.post(`/api/staff/support/${id}/messages`, { body });
              toast(r.isGuest ? 'Note saved' : 'Reply sent');
              await reload();
            }}
          />
        </Card>
      </div>
    </>
  );
}
