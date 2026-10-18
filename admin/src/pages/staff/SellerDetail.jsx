import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { staffApi } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { Alert, Badge, Button, Card, ConfirmModal, ErrorBox, KeyValue, Loading, Modal, PageHeader, PromptModal, Stat, StatusBadge, Thumb, useToast } from '../../components/ui.jsx';
import { ACCOUNT_STATUS, APPLICATION_STATUS, LISTING_STATUS, actionText, dateTime, money, packagingText, sourceLabel } from '../../format.js';
import { useApi, useTitle } from '../../hooks.js';

const PAYOUT_TYPE = { bank_transfer: 'Bank transfer', paypal: 'PayPal', zelle: 'Zelle', check: 'Paper check' };

/** The real payout details, shown only after an admin asks for them. The server records every look in the activity log. */
function PayoutReveal({ sellerId, name, onClose }) {
  const [state, setState] = useState({ loading: true, method: null, error: null });
  useEffect(() => {
    let alive = true;
    staffApi.get(`/api/staff/sellers/${sellerId}/payout-method`)
      .then((r) => alive && setState({ loading: false, method: r.method, error: null }))
      .catch((e) => alive && setState({ loading: false, method: null, error: e }));
    return () => { alive = false; };
  }, [sellerId]);
  const { loading, method, error } = state;
  const d = method?.details || {};
  const rows = [];
  if (method) {
    rows.push(['Method', PAYOUT_TYPE[method.type] || method.type], ['Name on the account', method.accountHolder]);
    if (method.type === 'bank_transfer') rows.push(['Routing number', <span key="r" className="mono">{d.routingNumber}</span>], ['Account number', <span key="a" className="mono">{d.accountNumber}</span>]);
    if (method.type === 'paypal') rows.push(['PayPal email', d.email]);
    if (method.type === 'zelle') rows.push(['Zelle email or phone', d.contact]);
    if (method.type === 'check') rows.push(['Mail the check to', [d.line1, d.line2, `${d.city}, ${d.region} ${d.postalCode}`].filter(Boolean).join(', ')]);
  }
  return (
    <Modal title={`Payout details for ${name}`} onClose={onClose} footer={<Button onClick={onClose}>Close</Button>}>
      {loading && <Loading />}
      {error && <Alert tone="error">{error.message}</Alert>}
      {!loading && !error && !method && <p className="muted">This seller has not added a payout method.</p>}
      {method && (
        <>
          <KeyValue rows={rows} />
          <p className="faint small" style={{ marginBottom: 0 }}>This view was recorded in the activity log. Only use these details to send the seller’s money.</p>
        </>
      )}
    </Modal>
  );
}

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
  const revoked = s.status === 'revoked';
  return (
    <>
      <PageHeader
        back={{ to: '/staff/sellers', label: 'All sellers' }}
        title={s.displayName}
        subtitle={`${s.username} · ${s.email}`}
        actions={canWrite && (suspended
          ? <Button onClick={() => setDialog('reinstate')}>Reinstate seller</Button>
          : revoked
            ? <Button onClick={() => setDialog('restore')}>Restore selling</Button>
            : (
              <>
                <Button variant="secondary" onClick={() => setDialog('revoke')}>Remove selling</Button>
                <Button variant="danger" onClick={() => setDialog('suspend')}>Suspend seller</Button>
              </>
            ))}
      />
      <div className="stack">
        {suspended && (
          <Alert tone="error">
            <span><strong>Suspended {dateTime(s.suspendedAt)}.</strong> {s.suspendedReason}. They cannot sign in to the portal and none of their offers are shown in the shop.</span>
          </Alert>
        )}
        {revoked && (
          <Alert tone="error">
            <span><strong>Selling removed {dateTime(s.revokedAt)}.</strong> {s.revokedReason}. Their offers are out of the shop and they cannot use the seller portal, but they can still sign in, shop, track orders and contact support as a normal customer.</span>
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
          <Card title="Sales and fees (all time)">
            <KeyValue rows={[
              ['Sales', money(s.earnings.grossCents)],
              ['TSM fee', `− ${money(s.earnings.commissionCents)}`],
              ['Payment (Apple) fee', `− ${money(s.earnings.processingFeeCents)}`],
              ['Seller receives', <strong key="net">{money(s.earnings.grossCents - s.earnings.commissionCents - s.earnings.processingFeeCents)}</strong>],
            ]} />
          </Card>
          <Card
            title="Payout method"
            actions={canWrite && s.payoutMethod && <Button size="sm" variant="secondary" onClick={() => setDialog('payout')}>Show full details</Button>}
          >
            {s.payoutMethod ? (
              <KeyValue rows={[
                ['Method', <Badge key="t" tone="blue">{PAYOUT_TYPE[s.payoutMethod.type] || s.payoutMethod.type}</Badge>],
                ['Saved as', s.payoutMethod.label],
                ['Name on the account', s.payoutMethod.accountHolder],
                ['Updated', dateTime(s.payoutMethod.updatedAt)],
              ]} />
            ) : <p className="muted" style={{ margin: 0 }}>No payout method yet. They add one in the seller portal under Payout method.</p>}
            {s.payoutMethod && !canWrite && <p className="faint small" style={{ marginBottom: 0 }}>Full details are visible to admins only.</p>}
          </Card>
        </div>

        <div className="grid grid-2">
          <Card title="Seller">
            <KeyValue rows={[
              ['Approved', dateTime(s.approvedAt)],
              ['Member since', dateTime(s.memberSince)],
              ['Last sign-in', dateTime(s.lastLoginAt)],
              ['Phone', s.phone],
              ['Orders', <Link key="o" to={`/staff/orders?sellerId=${id}`}>See their orders →</Link>],
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
          description="They are signed out of the seller portal at once and all their offers leave the shop. They cannot ship or answer orders from the portal while suspended, so follow up any unshipped orders with them directly. You can reinstate them later."
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
      {dialog === 'revoke' && (
        <PromptModal
          title={`Remove ${s.displayName}’s selling?`}
          description="Their offers leave the shop and the seller portal closes to them. Their account is not locked: they can still sign in, shop, follow their orders and contact support. They cannot ship or answer orders from the portal while selling is removed, so follow up any unshipped orders with them directly. You can restore selling later."
          label="Reason (recorded in the activity log and shown to them)"
          confirmLabel="Remove selling"
          danger
          onConfirm={async (reason) => {
            await staffApi.post(`/api/staff/sellers/${id}/revoke`, { reason });
            toast('Selling removed');
            reload();
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'restore' && (
        <ConfirmModal
          title="Restore selling?"
          confirmLabel="Restore selling"
          onConfirm={async () => {
            await staffApi.post(`/api/staff/sellers/${id}/reinstate`);
            toast('Selling restored');
            reload();
          }}
          onClose={() => setDialog(null)}
        >
          <p>{s.displayName} can use the seller portal again and their offers return to the shop (offers you put on hold stay on hold).</p>
        </ConfirmModal>
      )}
      {dialog === 'payout' && <PayoutReveal sellerId={id} name={s.displayName} onClose={() => setDialog(null)} />}
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
