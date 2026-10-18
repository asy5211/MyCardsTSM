import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { staffApi } from '../../api.js';
import { Alert, Button, Card, ErrorBox, KeyValue, Loading, PageHeader, Stat, StatusBadge, Thread, Thumb } from '../../components/ui.jsx';
import { ORDER_STATUS, dateTime, money } from '../../format.js';
import { useApi, useTitle } from '../../hooks.js';

export default function OrderDetail() {
  const { id } = useParams();
  const { data: o, error, loading, reload } = useApi(() => staffApi.get(`/api/staff/orders/${id}`), [id]);
  const [chat, setChat] = useState({ state: 'hidden', messages: [], error: null });
  useTitle(o ? o.orderNumber : 'Order');

  if (loading && !o) return <Loading />;
  if (error && !o) return <ErrorBox error={error} onRetry={reload} />;

  const a = o.shippingAddress;

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
          <Stat label="Seller" value={<Link to={`/staff/sellers/${o.seller.id}`}>{o.seller.displayName}</Link>} />
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
          <Card title="Tracking">
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

        <Card title="Buyer and seller chat">
          {chat.state === 'hidden' && (
            <>
              <p className="muted" style={{ marginTop: 0 }}>The buyer and seller can message each other about this order. Reading it is recorded in the activity log, so open it only when you need to (a dispute, say).</p>
              {chat.error && <Alert tone="error">{chat.error.message}</Alert>}
              <Button variant="secondary" onClick={openChat}>Read the conversation</Button>
            </>
          )}
          {chat.state === 'loading' && <Loading />}
          {chat.state === 'shown' && (
            <Thread messages={chat.messages} canSend={false} closedText="Staff can read this conversation but not write in it." />
          )}
        </Card>
      </div>
    </>
  );
}
