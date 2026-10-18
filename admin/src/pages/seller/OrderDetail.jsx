import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { sellerApi } from '../../api.js';
import { FeeSplit, ShipForm } from '../../components/orderParts.jsx';
import { Alert, Card, ErrorBox, KeyValue, Loading, PageHeader, Stat, StatusBadge, Thread, Thumb } from '../../components/ui.jsx';
import { SELLER_ORDER_STATUS, dateTime, money } from '../../format.js';
import { useApi, useTitle } from '../../hooks.js';

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
            {canShip ? <ShipForm order={o} api={sellerApi} path={`/api/seller/orders/${o.id}/ship`} onDone={reload} /> : <p className="muted" style={{ margin: 0 }}>This order is {o.status}.</p>}
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

        <FeeSplit fees={o.fees} forSeller />

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
