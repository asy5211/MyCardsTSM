import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { sellerApi } from '../../api.js';
import { Alert, Button, Card, ErrorBox, Field, KeyValue, Loading, PageHeader, Stat, StatusBadge, Thread, Thumb, useToast } from '../../components/ui.jsx';
import { CARRIERS, SELLER_ORDER_STATUS, dateTime, money } from '../../format.js';
import { useApi, useTitle } from '../../hooks.js';

function ShipForm({ order, onDone }) {
  const toast = useToast();
  const [carrier, setCarrier] = useState(order.carrier || 'UPS');
  const [tracking, setTracking] = useState(order.trackingNumber || '');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const shipped = order.status === 'shipped';

  const save = async () => {
    setBusy(true);
    setErrors({});
    setError('');
    try {
      await sellerApi.post(`/api/seller/orders/${order.id}/ship`, { carrier, trackingNumber: tracking });
      toast(shipped ? 'Tracking updated' : 'Marked as shipped. The buyer can see the tracking number.');
      await onDone();
    } catch (e) {
      setErrors(e.fieldErrors);
      if (!Object.keys(e.fieldErrors).length) setError(e.message);
    }
    setBusy(false);
  };

  return (
    <>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <Field label="Carrier" error={errors.carrier}>
          <select className="input" value={carrier} onChange={(e) => setCarrier(e.target.value)}>
            {CARRIERS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Tracking number" error={errors.trackingNumber} className="grow">
          <input className="input" value={tracking} maxLength={60} onChange={(e) => setTracking(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} placeholder="For example 1Z999AA10123456784" />
        </Field>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      <Button onClick={save} loading={busy} disabled={tracking.trim().length < 5}>{shipped ? 'Update tracking' : 'Mark as shipped'}</Button>
    </>
  );
}

export default function SellerOrderDetail() {
  const { id } = useParams();
  const { data: o, error, loading, reload } = useApi(() => sellerApi.get(`/api/seller/orders/${id}`), [id]);
  const chat = useApi(() => sellerApi.get(`/api/seller/orders/${id}/messages`), [id]);
  useTitle(o ? o.orderNumber : 'Order');

  // New buyer messages show up without reloading the page.
  useEffect(() => {
    const timer = setInterval(() => chat.reload(), 30_000);
    return () => clearInterval(timer);
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading && !o) return <Loading />;
  if (error && !o) return <ErrorBox error={error} onRetry={reload} />;

  const a = o.shippingAddress;
  const canShip = o.status === 'placed' || o.status === 'shipped';

  return (
    <>
      <PageHeader
        back={{ to: '/seller/orders', label: 'Sold items' }}
        title={o.orderNumber}
        subtitle={`Placed ${dateTime(o.createdAt)} by ${o.buyer.username}`}
      />
      <div className="stack">
        {o.status === 'placed' && <Alert tone="warn"><span><strong>Ready to ship.</strong> Pack it, ship it to the address below, then add the carrier and tracking number.</span></Alert>}
        <div className="grid grid-stats">
          <Stat label="Status" value={<StatusBadge map={SELLER_ORDER_STATUS} value={o.status} />} />
          <Stat label="Order total" value={money(o.subtotalCents)} />
          <Stat label="Buyer" value={o.buyer.username} />
        </div>

        <div className="grid grid-2">
          <Card title="Ship to">
            <p style={{ margin: 0, lineHeight: 1.6 }}>
              {a.fullName}<br />
              {a.line1}<br />
              {a.line2 && <>{a.line2}<br /></>}
              {a.city}, {a.region} {a.postalCode}<br />
              {a.country}
            </p>
          </Card>
          <Card title={o.status === 'placed' ? 'Add tracking' : 'Tracking'}>
            {canShip ? <ShipForm order={o} onDone={reload} /> : <p className="muted" style={{ margin: 0 }}>This order is {o.status}.</p>}
            {o.shippedAt && (
              <div style={{ marginTop: 14 }}>
                <KeyValue rows={[
                  ['Shipped', dateTime(o.shippedAt)],
                  ['Delivered', o.deliveredAt ? dateTime(o.deliveredAt) : null],
                  ['Carrier page', o.trackingUrl ? <a key="u" href={o.trackingUrl} target="_blank" rel="noreferrer noopener">Open tracking ↗</a> : 'No link for this carrier'],
                ]} />
              </div>
            )}
          </Card>
        </div>

        <Card title={`Items sold (${o.items.length})`} padded={false}>
          <div className="table-wrap">
            <table>
              <thead><tr><th scope="col">Product</th><th scope="col">Box / pack</th><th scope="col" className="num">Qty</th><th scope="col" className="num">Price each</th><th scope="col" className="num">Line total</th></tr></thead>
              <tbody>
                {o.items.map((i) => (
                  <tr key={i.id}>
                    <td>
                      <div className="cell-product">
                        <Thumb src={i.thumbnailUrl} size={38} />
                        <div><div className="name">{i.productName}</div><div className="sub">{i.brandName}</div></div>
                      </div>
                    </td>
                    <td>{i.boxLabel || 'Loose product'}</td>
                    <td className="num">{i.quantity}</td>
                    <td className="num">{money(i.unitPriceCents)}</td>
                    <td className="num">{money(i.lineTotalCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title={`Message ${o.buyer.username}`}>
          {chat.error && !chat.data ? <ErrorBox error={chat.error} onRetry={chat.reload} /> : (
            <Thread
              messages={chat.data?.items || []}
              canSend
              placeholder={`Write to ${o.buyer.username} about this order…`}
              onSend={async (body) => {
                await sellerApi.post(`/api/seller/orders/${id}/messages`, { body });
                await chat.reload();
              }}
            />
          )}
        </Card>
      </div>
    </>
  );
}
