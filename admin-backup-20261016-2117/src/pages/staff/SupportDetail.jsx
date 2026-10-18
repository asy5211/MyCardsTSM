import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { staffApi } from '../../api.js';
import { Alert, Badge, Button, Card, ErrorBox, KeyValue, Loading, PageHeader, StatusBadge, Thread, useToast } from '../../components/ui.jsx';
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
          <Card title="Look them up">
            {r.isGuest ? (
              <p className="muted" style={{ margin: 0 }}>Guests have no account to look up.</p>
            ) : (
              <p style={{ margin: 0 }}><Link to={`/staff/users?q=${encodeURIComponent(r.email)}`}>Find {r.email} in Users →</Link></p>
            )}
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
