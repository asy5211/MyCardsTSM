import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { staffApi } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { FeeSplit, ShipForm } from '../../components/orderParts.jsx';
import { Alert, Badge, Button, Card, ErrorBox, KeyValue, Loading, PageHeader, Stat, StatusBadge, Thread, Thumb } from '../../components/ui.jsx';
import { ORDER_STATUS, dateTime, money } from '../../format.js';
import { useApi, useTitle } from '../../hooks.js';

export default function OrderDetail() {
  const { id } = useParams();
  const { canWrite } = useAuth();
  const { data: o, error, loading, reload } = useApi(() => staffApi.get(`/api/staff/orders/${id}`), [id]);
  const [chat, setChat] = useState({ state: 'hidden', messages: [], error: null });
  useTitle(o ? o.orderNumber : 'Order');

  if (loading && !o) return <Loading />;
  if (error && !o) return <ErrorBox error={error} onRetry={reload} />;

  const a = o.shippingAddress;
  const tsmSale = o.seller.isTsm; // TSM's own store: TSM ships it and writes to the buyer, so the forms show here
  const canShip = tsmSale && canWrite && (o.status === 'placed' || o.status === 'shipped');

  // Reading a private conversation is recorded in the activity log, so it only loads when you ask.
  const openChat = async () => {
    setChat({ state: 'loading', messages: [], error: null });
    try {
      const r = await staffApi.get(`/api/staff/orders/${id}/messages`);
      setChat({ state: 'shown', messages: r.items, error: null });
    } catch (e) {
      setChat({ state: 'hidden', messages: [], error: e });
    }
  };

  return (
    <>
      <PageHeader
        back={{ to: '/staff/orders', label: 'All orders' }}
        title={o.orderNumber}
        subtitle={`Placed ${dateTime(o.createdAt)} · buyer ${o.buyer.username}`}
      />
      <div className="stack">
        <div className="grid grid-stats">
          <Stat label="Status" value={<StatusBadge map={ORDER_STATUS} value={o.status} />} />
          <Stat label="Order total" value={money(o.subtotalCents)} />
          <Stat label="Seller" value={tsmSale ? <span>{o.seller.displayName} <Badge tone="purple">TSM</Badge></span> : <Link to={`/staff/sellers/${o.seller.id}`}>{o.seller.displayName}</Link>} />
        </div>

        {tsmSale && o.status === 'placed' && <Alert tone="warn"><span><strong>This is a TSM order, so we ship it.</strong> Pack it, ship it to the address below, then add the carrier and tracking number.</span></Alert>}
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
          <Card title={canShip && o.status === 'placed' ? 'Add tracking' : 'Tracking'}>
            {canShip && <div style={{ marginBottom: 14 }}><ShipForm order={o} api={staffApi} path={`/api/staff/orders/${o.id}/ship`} onDone={reload} /></div>}
            <KeyValue rows={[
              ['Carrier', o.carrier],
              ['Tracking number', o.trackingNumber ? <span key="t" className="mono">{o.trackingNumber}</span> : null],
              ['Track it', o.trackingUrl ? <a key="u" href={o.trackingUrl} target="_blank" rel="noreferrer noopener">Open carrier page ↗</a> : null],
              ['Shipped', dateTime(o.shippedAt)],
              ['Delivered', dateTime(o.deliveredAt)],
            ]} />
          </Card>
        </div>

        <Card title={`Items (${o.items.length})`} padded={false}>
          <div className="table-wrap">
            <table>
              <thead><tr><th scope="col">Product</th><th scope="col">Box / pack</th><th scope="col">Sourced from</th><th scope="col" className="num">Qty</th><th scope="col" className="num">Each</th><th scope="col" className="num">Line</th><th scope="col">Review</th></tr></thead>
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
                    <td>{i.sourceLabel || '—'}{i.distributor && <div className="muted small">{i.distributor}</div>}</td>
                    <td className="num">{i.quantity}</td>
                    <td className="num">{money(i.unitPriceCents)}</td>
                    <td className="num">{money(i.lineTotalCents)}</td>
                    <td>{i.review ? `${i.review.rating} ★${i.review.sellerResponse ? ' · answered' : ''}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <FeeSplit fees={o.fees} isTsmSale={tsmSale} />

        <Card title={tsmSale ? 'Chat with the buyer' : 'Buyer and seller chat'}>
          {chat.state === 'hidden' && (
            <>
              <p className="muted" style={{ marginTop: 0 }}>{tsmSale ? 'The buyer can message TSM about this order, and you can answer here. ' : 'The buyer and seller can message each other about this order. '}Reading it is recorded in the activity log, so open it only when you need to{tsmSale ? '' : ' (a dispute, say)'}.</p>
              {chat.error && <Alert tone="error">{chat.error.message}</Alert>}
              <Button variant="secondary" onClick={openChat}>Read the conversation</Button>
            </>
          )}
          {chat.state === 'loading' && <Loading />}
          {chat.state === 'shown' && (
            <Thread
              messages={chat.messages}
              canSend={tsmSale && canWrite}
              closedText="Staff can read this conversation but not write in it."
              placeholder={`Write to ${o.buyer.username} as TSM…`}
              onSend={async (body) => {
                await staffApi.post(`/api/staff/orders/${id}/messages`, { body });
                await openChat();
              }}
            />
          )}
        </Card>
      </div>
    </>
  );
}
