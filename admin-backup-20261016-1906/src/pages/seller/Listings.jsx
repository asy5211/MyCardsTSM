import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { sellerApi } from '../../api.js';
import { Alert, Button, Card, Empty, ErrorBox, Loading, PageHeader, Pagination, StatusBadge, Tabs, Thumb, useToast } from '../../components/ui.jsx';
import { LISTING_STATUS, money, packagingText } from '../../format.js';
import { useApi, useTitle } from '../../hooks.js';

const LIMIT = 50;
const TABS = [
  { value: 'all', label: 'All' },
  { value: 'live', label: 'Live' },
  { value: 'sold_out', label: 'Sold out' },
  { value: 'paused', label: 'Paused' },
  { value: 'on_hold', label: 'On hold' },
];

export default function Listings() {
  useTitle('My listings');
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const status = TABS.some((t) => t.value === params.get('status')) ? params.get('status') : 'all';
  const [offset, setOffset] = useState(0);
  const [busyId, setBusyId] = useState(null);
  const { data, error, loading, reload } = useApi(() => sellerApi.get('/api/seller/listings', { status, limit: LIMIT, offset }), [status, offset]);

  const setActive = async (l, isActive) => {
    setBusyId(l.id);
    try {
      await sellerApi.patch(`/api/seller/listings/${l.id}`, { isActive });
      toast(isActive ? 'Offer resumed' : 'Offer paused: shoppers no longer see it');
      reload();
    } catch (e) {
      toast(e.message, 'error');
    }
    setBusyId(null);
  };

  return (
    <>
      <PageHeader
        title="My listings"
        subtitle="Your offers on TSM products. Shoppers see your price, stock, where it was sourced from, the distributor, and which box or pack it is."
        actions={<Link className="btn btn-primary btn-md" to="/seller/listings/new">+ List a product</Link>}
      />
      <Tabs
        tabs={TABS}
        value={status}
        onChange={(v) => { const next = new URLSearchParams(); if (v !== 'all') next.set('status', v); setParams(next, { replace: true }); setOffset(0); }}
      />
      <Card padded={false}>
        {error && <div style={{ padding: 16 }}><ErrorBox error={error} onRetry={reload} /></div>}
        {loading && !data ? <Loading /> : data && (data.items.length ? (
          <>
            <div className="table-wrap">
              <table>
                <thead><tr><th scope="col">Product</th><th scope="col" className="num">Price</th><th scope="col" className="num">In stock</th><th scope="col">Sourced from</th><th scope="col">Distributor</th><th scope="col">Box / pack</th><th scope="col">Status</th><th scope="col" /></tr></thead>
                <tbody>
                  {data.items.map((l) => (
                    <tr key={l.id}>
                      <td>
                        <div className="cell-product">
                          <Thumb src={l.thumbnailUrl} size={42} />
                          <div><div className="name">{l.productName}</div><div className="sub">{l.brandName}</div></div>
                        </div>
                      </td>
                      <td className="num"><strong>{money(l.priceCents)}</strong></td>
                      <td className="num">{l.quantityAvailable}</td>
                      <td>{l.sourceLabel}</td>
                      <td>{l.distributor || '—'}</td>
                      <td>{packagingText(l)}</td>
                      <td>
                        <StatusBadge map={LISTING_STATUS} value={l.status} />
                        {l.adminHold && <div className="muted small" style={{ maxWidth: 220 }}>TSM: {l.adminHoldReason}</div>}
                      </td>
                      <td className="right nowrap">
                        <Link className="btn btn-secondary btn-sm" to={`/seller/listings/${l.id}`}>Edit</Link>{' '}
                        {!l.adminHold && (l.isActive
                          ? <Button size="sm" variant="ghost" loading={busyId === l.id} onClick={() => setActive(l, false)}>Pause</Button>
                          : <Button size="sm" variant="ghost" loading={busyId === l.id} onClick={() => setActive(l, true)}>Resume</Button>)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination total={data.total} limit={LIMIT} offset={offset} onChange={setOffset} />
          </>
        ) : (
          <Empty title={status === 'all' ? 'You have no listings yet' : 'Nothing here'}>
            {status === 'all' ? <Link to="/seller/listings/new">List your first product</Link> : 'Try another tab.'}
          </Empty>
        ))}
      </Card>
      {data?.items.some((l) => l.adminHold) && (
        <div style={{ marginTop: 16 }}><Alert tone="warn">Offers on hold are hidden from shoppers. You can still correct the price or stock, but only TSM can release the hold. Contact support if you think it is a mistake.</Alert></div>
      )}
    </>
  );
}
