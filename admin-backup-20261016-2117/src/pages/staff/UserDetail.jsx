import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { staffApi } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { Alert, Badge, Button, Card, ConfirmModal, ErrorBox, KeyValue, Loading, PageHeader, PromptModal, StatusBadge, useToast } from '../../components/ui.jsx';
import { ACCOUNT_STATUS, APPLICATION_STATUS, actionText, date, dateTime } from '../../format.js';
import { useApi, useTitle } from '../../hooks.js';

export default function UserDetail() {
  const { id } = useParams();
  const { canWrite } = useAuth();
  const toast = useToast();
  const { data: u, error, loading, reload } = useApi(() => staffApi.get(`/api/staff/users/${id}`), [id]);
  const [dialog, setDialog] = useState(null);
  useTitle(u ? u.username : 'User');

  if (loading && !u) return <Loading />;
  if (error && !u) return <ErrorBox error={error} onRetry={reload} />;

  const addr = u.address;
  return (
    <>
      <PageHeader
        back={{ to: '/staff/users', label: 'All users' }}
        title={u.username}
        subtitle={u.email}
        actions={canWrite && u.status !== 'deleted' && (u.status === 'suspended'
          ? <Button onClick={() => setDialog('reinstate')}>Reinstate account</Button>
          : <Button variant="danger" onClick={() => setDialog('suspend')}>Suspend account</Button>)}
      />
      <div className="stack">
        <Alert tone="info">Viewing this page was recorded in the activity log.</Alert>
        <div className="grid grid-2">
          <Card title="Account">
            <KeyValue rows={[
              ['Status', <StatusBadge key="s" map={ACCOUNT_STATUS} value={u.status} />],
              ['Role', u.isSeller ? <span key="r">Seller · <Link to={`/staff/sellers/${u.id}`}>open seller page</Link></span> : 'Shopper'],
              ['Phone', u.phone],
              ['Email verified', u.emailVerified ? 'Yes' : 'No'],
              ['Joined', dateTime(u.createdAt)],
              ['Last sign-in', dateTime(u.lastLoginAt)],
            ]} />
          </Card>
          <Card title="Shipping address">
            {addr ? (
              <address style={{ fontStyle: 'normal', lineHeight: 1.6 }}>
                {addr.fullName}<br />
                {addr.line1}<br />
                {addr.line2 && <>{addr.line2}<br /></>}
                {addr.city}, {addr.region} {addr.postalCode}<br />
                {addr.country}
              </address>
            ) : <p className="muted" style={{ margin: 0 }}>No address saved.</p>}
          </Card>
        </div>

        {u.sellerApplications.length > 0 && (
          <Card title="Seller applications" padded={false}>
            <div className="table-wrap">
              <table>
                <thead><tr><th scope="col">Business</th><th scope="col">Submitted</th><th scope="col">Status</th></tr></thead>
                <tbody>
                  {u.sellerApplications.map((a) => (
                    <tr key={a.id}>
                      <td><Link to={`/staff/applications/${a.id}`}>{a.businessName}</Link></td>
                      <td>{date(a.submittedAt)}</td>
                      <td><StatusBadge map={APPLICATION_STATUS} value={a.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        <Card title="Recent activity by this person" padded={false}>
          {u.activity.length ? (
            <ul className="activity">
              {u.activity.map((a) => (
                <li key={a.id}><div className="what">{actionText(a.action)}</div><div className="when">{dateTime(a.createdAt)}</div></li>
              ))}
            </ul>
          ) : <p className="muted" style={{ margin: 18 }}>Nothing recorded yet.</p>}
        </Card>
      </div>

      {dialog === 'suspend' && (
        <PromptModal
          title={`Suspend ${u.username}?`}
          description="They are signed out immediately and cannot sign in again until you reinstate the account."
          label="Reason (recorded in the activity log)"
          confirmLabel="Suspend account"
          danger
          onConfirm={async (reason) => {
            await staffApi.post(`/api/staff/users/${id}/suspend`, { reason });
            toast('Account suspended');
            reload();
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'reinstate' && (
        <ConfirmModal
          title="Reinstate this account?"
          confirmLabel="Reinstate"
          onConfirm={async () => {
            await staffApi.post(`/api/staff/users/${id}/reinstate`);
            toast('Account reinstated');
            reload();
          }}
          onClose={() => setDialog(null)}
        >
          <p>{u.username} can sign in again.</p>
        </ConfirmModal>
      )}
      {u.status === 'deleted' && <p className="muted small">This account was deleted by its owner and has been anonymised.</p>}
      {u.status === 'suspended' && <Badge tone="red">Suspended</Badge>}
    </>
  );
}
