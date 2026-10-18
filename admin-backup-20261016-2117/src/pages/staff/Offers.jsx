import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { staffApi } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { Button, Card, ConfirmModal, Empty, ErrorBox, Loading, PageHeader, Pagination, PromptModal, SearchBox, StatusBadge, Thumb, useToast } from '../../components/ui.jsx';
import { LISTING_STATUS, money, packagingText } from '../../format.js';
import { useApi, useDebounced, useTitle } from '../../hooks.js';

const LIMIT = 50;

export default function Offers() {
  useTitle('Seller offers');
  const { canWrite } = useAuth();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const productId = params.get('productId') || undefined;
  const sellerId = params.get('sellerId') || undefined;
  const [search, setSearch] = useState('');
  const q = useDebounced(search);
  const [status, setStatus] = useState('all');
  const [offset, setOffset] = useState(0);
  const [dialog, setDialog] = useState(null); // { type: 'hold'|'release', offer }

  const { data, error, loading, reload } = useApi(
    () => staffApi.get('/api/staff/listings', { q, status, productId, sellerId, limit: LIMIT, offset }),
    [q, status, productId, sellerId, offset],
  );
  const filtered = Boolean(productId || sellerId);

  return (
    <>
      <PageHeader
        title="Seller offers"
        subtitle="Every offer from every seller: what they charge, how many they have, where it came from and which box or pack it is. Put an offer on hold if something looks wrong; the seller cannot undo a hold."
      />
      <Card padded={false}>
        <div className="filters">
          <SearchBox value={search} onChange={(v) => { setSearch(v); setOffset(0); }} placeholder="Search product, brand, seller or distributor…" />
          <select className="input" value={status} onChange={(e) => { setStatus(e.target.value); setOffset(0); }} aria-label="Status">
            <option value="all">Any status</option>
            <option value="live">Live</option>
            <option value="paused">Paused by seller</option>
            <option value="on_hold">On hold</option>
            <option value="sold_out">Sold out</option>
            <option value="seller_suspended">Seller suspended</option>
          </select>
          {filtered && <Button size="sm" variant="secondary" onClick={() => { setParams({}, { replace: true }); setOffset(0); }}>Clear product/seller filter ✕</Button>}
        </div>
        {error && <div style={{ padding: 16 }}><ErrorBox error={error} onRetry={reload} /></div>}
        {loading && !data ? <Loading /> : data && (data.items.length ? (
          <>
            <div className="table-wrap">
              <table>
                <thead><tr><th scope="col">Product</th><th scope="col">Seller</th><th scope="col" className="num">Price</th><th scope="col" className="num">Stock</th><th scope="col">Sourced from</th><th scope="col">Distributor</th><th scope="col">Box / pack</th><th scope="col">Status</th>{canWrite && <th scope="col" />}</tr></thead>
                <tbody>
                  {data.items.map((l) => (
                    <tr key={l.id}>
                      <td>
                        <div className="cell-product">
                          <Thumb src={l.thumbnailUrl} size={38} />
                          <div><div className="name">{l.productName}</div><div className="sub">{l.brandName}</div></div>
                        </div>
                      </td>
                      <td><Link to={`/staff/sellers/${l.sellerId}`}>{l.sellerName}</Link></td>
                      <td className="num">{money(l.priceCents)}</td>
                      <td className="num">{l.quantityAvailable}</td>
                      <td>{l.sourceLabel}</td>
                      <td>{l.distributor || '—'}</td>
                      <td>{packagingText(l)}</td>
                      <td>
                        <StatusBadge map={LISTING_STATUS} value={l.status} />
                        {l.adminHold && l.adminHoldReason && <div className="muted small" style={{ maxWidth: 200 }}>{l.adminHoldReason}</div>}
                      </td>
                      {canWrite && (
                        <td className="right nowrap">
                          {l.adminHold
                            ? <Button size="sm" variant="secondary" onClick={() => setDialog({ type: 'release', offer: l })}>Release</Button>
                            : <Button size="sm" variant="danger" onClick={() => setDialog({ type: 'hold', offer: l })}>Hold</Button>}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination total={data.total} limit={LIMIT} offset={offset} onChange={setOffset} />
          </>
        ) : <Empty title="No offers match" />)}
      </Card>

      {dialog?.type === 'hold' && (
        <PromptModal
          title="Put this offer on hold?"
          description={`${dialog.offer.sellerName}’s offer on “${dialog.offer.productName}” leaves the shop right away. The seller sees your reason and cannot resume it themselves.`}
          label="Reason (the seller can read this)"
          placeholder="For example: Price looks like a typo."
          confirmLabel="Put on hold"
          danger
          onConfirm={async (reason) => {
            await staffApi.post(`/api/staff/listings/${dialog.offer.id}/hold`, { reason });
            toast('Offer put on hold');
            reload();
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === 'release' && (
        <ConfirmModal
          title="Release this offer?"
          confirmLabel="Release"
          onConfirm={async () => {
            await staffApi.post(`/api/staff/listings/${dialog.offer.id}/release`);
            toast('Offer released');
            reload();
          }}
          onClose={() => setDialog(null)}
        >
          <p>The offer goes back to its normal state (it is shown in the shop if the seller has it active and in stock).</p>
        </ConfirmModal>
      )}
    </>
  );
}
