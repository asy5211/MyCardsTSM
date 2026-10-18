import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { staffApi } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { Alert, Button, Card, ConfirmModal, ErrorBox, KeyValue, Loading, PageHeader, PromptModal, Stat, StatusBadge, Thumb, useToast } from '../../components/ui.jsx';
import { ACCOUNT_STATUS, APPLICATION_STATUS, LISTING_STATUS, actionText, dateTime, money, packagingText, sourceLabel } from '../../format.js';
import { useApi, useTitle } from '../../hooks.js';

export default function SellerDetail() {
  const { id } = useParams();
  const { canWrite } = useAuth();
  const toast = useToast();
  const { data: s, error, loading, reload } = useApi(() => staffApi.get(`/api/staff/sellers/${id}`), [id]);
  const [dialog, setDialog] = useState(null);
  useTitle(s ? s.displayName : 'Seller');

  if (loading && !s) return <Loading />;
  if (error && !s) return <ErrorBox error={error} onRetry={reload} />;

  const suspended = s.status === 'suspended';
  return (
    <>
      <PageHeader
        back={{ to: '/staff/sellers', label: 'All sellers' }}
        title={s.displayName}
        subtitle={`${s.username} · ${s.email}`}
        actions={canWrite && (suspended
          ? <Button onClick={() => setDialog('reinstate')}>Reinstate seller</Button>
          : <Button variant="danger" onClick={() => setDialog('suspend')}>Suspend seller</Button>)}
      />
      <div className="stack">
        {suspended && (
          <Alert tone="error">
            <span><strong>Suspended {dateTime(s.suspendedAt)}.</strong> {s.suspendedReason}. They cannot sign in to the portal and none of their offers are shown in the shop.</span>
          </Alert>
        )}
        <div className="grid grid-stats">
          <Stat label="Status" value={<StatusBadge map={ACCOUNT_STATUS} value={s.status} />} />
          <Stat label="Live offers" value={`${s.liveListingCount} / ${s.listingCount}`} hint="live / all" />
          <Stat label="Sales" value={s.salesCount} hint={`Rating ${s.ratingAvg.toFixed(1)} (${s.ratingCount})`} />
          <Stat label="Owed to them" value={money(s.earnings.availableCents)} tone="gold" hint="available for payout" />
          <Stat label="Paid so far" value={money(s.earnings.paidCents)} tone="green" />
        </div>

        <div className="grid grid-2">
          <Card title="Seller">
            <KeyValue rows={[
              ['Approved', dateTime(s.approvedAt)],
              ['Member since', dateTime(s.memberSince)],
              ['Last sign-in', dateTime(s.lastLoginAt)],
              ['Phone', s.phone],
            ]} />
          </Card>
          <Card title="Their application" actions={s.application && <Link className="btn btn-secondary btn-sm" to={`/staff/applications/${s.application.id}`}>Open</Link>}>
            {s.application ? (
              <KeyValue rows={[
                ['Business', s.application.businessName],
                ['Address', s.application.businessAddress],
                ['Sources from', s.application.sourceType === 'test' ? 'Test' : sourceLabel(s.application.sourceType)],
                ['Distributors named', s.application.distributorList],
                ['Status', <StatusBadge key="st" map={APPLICATION_STATUS} value={s.application.status} />],
              ]} />
            ) : <p className="muted" style={{ margin: 0 }}>No application on file.</p>}
          </Card>
        </div>

        <Card title={`Offers (${s.listings.length})`} padded={false}>
          {s.listings.length ? (
            <div className="table-wrap">
              <table>
                <thead><tr><th scope="col">Product</th><th scope="col" className="num">Price</th><th scope="col" className="num">Stock</th><th scope="col">Sourced from</th><th scope="col">Distributor</th><th scope="col">Packaging</th><th scope="col">Status</th></tr></thead>
                <tbody>
                  {s.listings.map((l) => (
                    <tr key={l.id}>
                      <td>
                        <div className="cell-product">
                          <Thumb src={l.thumbnailUrl} size={38} />
                          <div><div className="name">{l.productName}</div><div className="sub">{l.brandName}</div></div>
                        </div>
                      </td>
                      <td className="num">{money(l.priceCents)}</td>
                      <td className="num">{l.quantityAvailable}</td>
                      <td>{l.sourceLabel}</td>
                      <td>{l.distributor || '—'}</td>
                      <td>{packagingText(l)}</td>
                      <td><StatusBadge map={LISTING_STATUS} value={l.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="muted" style={{ margin: 18 }}>This seller has not listed anything yet.</p>}
        </Card>

        <Card title="Recent activity" padded={false}>
          {s.activity.length ? (
            <ul className="activity">
              {s.activity.map((a) => (
                <li key={a.id}>
                  <div>
                    <div className="what">{actionText(a.action)}</div>
                    {a.details?.product && <div className="muted small">{a.details.product}</div>}
                  </div>
                  <div className="when">{dateTime(a.createdAt)}</div>
                </li>
              ))}
            </ul>
          ) : <p className="muted" style={{ margin: 18 }}>Nothing recorded yet.</p>}
        </Card>
      </div>

      {dialog === 'suspend' && (
        <PromptModal
          title={`Suspend ${s.displayName}?`}
          description="They are signed out of the seller portal at once and all their offers leave the shop. Orders already placed are not affected. You can reinstate them later."
          label="Reason (recorded in the activity log)"
          confirmLabel="Suspend seller"
          danger
          onConfirm={async (reason) => {
            await staffApi.post(`/api/staff/sellers/${id}/suspend`, { reason });
            toast('Seller suspended');
            reload();
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'reinstate' && (
        <ConfirmModal
          title="Reinstate seller?"
          confirmLabel="Reinstate"
          onConfirm={async () => {
            await staffApi.post(`/api/staff/sellers/${id}/reinstate`);
            toast('Seller reinstated');
            reload();
          }}
          onClose={() => setDialog(null)}
        >
          <p>{s.displayName} can sign in again and their offers return to the shop (offers you put on hold stay on hold).</p>
        </ConfirmModal>
      )}
    </>
  );
}
