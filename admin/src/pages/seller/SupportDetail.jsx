import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { sellerApi } from '../../api.js';
import { Alert, Button, Card, ErrorBox, KeyValue, Loading, PageHeader, StatusBadge, Thread, useToast } from '../../components/ui.jsx';
import { SUPPORT_STATUS, SUPPORT_TOPIC, dateTime } from '../../format.js';
import { useApi, useTitle } from '../../hooks.js';

export default function SellerSupportDetail() {
  const { id } = useParams();
  const toast = useToast();
  const { data, error, loading, reload } = useApi(() => sellerApi.get(`/api/seller/support/${id}`), [id]);
  const [busy, setBusy] = useState(false);
  useTitle(data ? data.request.ref : 'Support request');

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorBox error={error} onRetry={reload} />;
  const { request: r, messages } = data;
  const closed = r.status === 'closed';
  const tsmHas = r.handler === 'tsm'; // TSM took it over: you can read it, not reply

  const setStatus = async (status) => {
    setBusy(true);
    try {
      await sellerApi.post(`/api/seller/support/${id}/status`, { status });
      toast(status === 'closed' ? 'Request closed' : 'Request reopened');
      await reload();
    } catch (e) {
      toast(e.message, 'error');
    }
    setBusy(false);
  };

  return (
    <>
      <PageHeader
        back={{ to: '/seller/support', label: 'Customer support' }}
        title={r.subject}
        subtitle={`${r.ref} · ${SUPPORT_TOPIC[r.topic] || r.topic} · opened ${dateTime(r.createdAt)}`}
        actions={tsmHas ? null : closed
          ? <Button loading={busy} onClick={() => setStatus('open')}>Reopen</Button>
          : <Button variant="secondary" loading={busy} onClick={() => setStatus('closed')}>Close request</Button>}
      />
      <div className="stack">
        {tsmHas && <Alert tone="warn"><span><strong>TSM support took over this request.</strong> You can still read it, but TSM is answering the buyer now, so the reply box is turned off.</span></Alert>}
        <Card title="Request">
          <KeyValue rows={[
            ['Buyer', r.buyer.username],
            ['Order', r.orderId ? <Link key="o" to={`/seller/orders/${r.orderId}`}>{r.orderNumber} →</Link> : undefined],
            ['Status', <StatusBadge key="s" map={SUPPORT_STATUS} value={r.status} />],
          ]} />
        </Card>
        <Card title="Conversation">
          <Thread
            messages={messages}
            canSend={!closed && !tsmHas}
            closedText={tsmHas ? 'TSM is handling this request now.' : 'This request is closed. Reopen it to write again.'}
            placeholder={`Reply to ${r.buyer.username}…`}
            sendLabel="Send reply"
            onSend={async (body) => {
              await sellerApi.post(`/api/seller/support/${id}/messages`, { body });
              toast('Reply sent');
              await reload();
            }}
          />
        </Card>
      </div>
    </>
  );
}
