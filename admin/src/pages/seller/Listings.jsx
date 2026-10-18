import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { publicApi } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { Alert, Button, Card, Empty, ErrorBox, Loading, PageHeader, Pagination, SearchBox, SORT_NAME_TIME, SortSelect, StatusBadge, Stat, Tabs, Thumb, useToast } from '../../components/ui.jsx';
import { LISTING_STATUS, money, packagingText } from '../../format.js';
import { useApi, useDebounced, useTitle } from '../../hooks.js';
import { FEATURED_SCOPE, SELLER_SCOPE } from '../../listingScopes.js';

const LIMIT = 50;
const TABS = [
  { value: 'all', label: 'All' },
  { value: 'live', label: 'Live' },
  { value: 'sold_out', label: 'Sold out' },
  { value: 'paused', label: 'Paused' },
  { value: 'on_hold', label: 'On hold' },
];

/** The listings list. A seller sees their own; an admin sees TSM's featured ones (FEATURED_SCOPE). */
export function ListingsView({ scope }) {
  const featured = scope.kind === 'featured';
  const { canWrite } = useAuth();
  const mayChange = !featured || canWrite; // read-only staff roles can look but not post
  useTitle(featured ? 'TSM featured listings' : 'My listings');
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const status = TABS.some((t) => t.value === params.get('status')) ? params.get('status') : 'all';
  const [offset, setOffset] = useState(0);
  const [busyId, setBusyId] = useState(null);
  const [search, setSearch] = useState('');
  const q = useDebounced(search);
  const [brandId, setBrandId] = useState('all');
  const [typeId, setTypeId] = useState('all');
  const [sort, setSort] = useState('name');
  const brands = useApi(() => publicApi.get('/api/brands'), []);
  const types = useApi(() => publicApi.get('/api/product-types'), []);
  const { data, error, loading, reload } = useApi(
    () => scope.api.get(`${scope.base}/listings`, { status, brandId, typeId, q, sort, limit: LIMIT, offset }),
    [status, brandId, typeId, q, sort, offset],
  );
  const summary = useApi(() => (featured ? scope.api.get(scope.base) : Promise.resolve(null)), [featured, data]).data;
  const filtered = brandId !== 'all' || typeId !== 'all' || Boolean(search);

  const setActive = async (l, isActive) => {
    setBusyId(l.id);
    try {
      await scope.api.patch(`${scope.base}/listings/${l.id}`, { isActive });
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
        title={featured ? 'TSM featured listings' : 'My listings'}
        subtitle={featured
          ? 'TSM’s own products. Posted exactly like a seller’s listing, but they always sit at the top of a product’s listings in the app, even when they are not the cheapest, with a purple border.'
          : 'Your offers on TSM products. Shoppers see your price, stock, where it was sourced from, the distributor, and which box or pack it is.'}
        actions={mayChange && <Link className="btn btn-primary btn-md" to={`${scope.home}/new`}>{featured ? '+ Post a featured product' : '+ List a product'}</Link>}
      />
      {featured && summary && (
        <div className="grid grid-stats" style={{ marginBottom: 16 }}>
          <Stat label="Live" value={summary.listings.live} hint={`${summary.listings.unitsInStock} units in stock`} tone="purple" />
          <Stat label="Paused" value={summary.listings.paused} />
          <Stat label="Sold out" value={summary.listings.soldOut} />
          <Stat label="Orders to ship" value={summary.ordersToShip} to={`/staff/orders?sellerId=${summary.seller.id}`} tone={summary.ordersToShip ? 'gold' : undefined} hint="TSM ships its own orders" />
        </div>
      )}
      <Tabs
        tabs={TABS}
        value={status}
        onChange={(v) => { const next = new URLSearchParams(); if (v !== 'all') next.set('status', v); setParams(next, { replace: true }); setOffset(0); }}
      />
      <Card padded={false} className={featured ? 'featured-card' : ''}>
        <div className="filters">
          <SearchBox value={search} onChange={(v) => { setSearch(v); setOffset(0); }} placeholder="Search product, brand or distributor…" />
          <select className="input" value={brandId} onChange={(e) => { setBrandId(e.target.value); setOffset(0); }} aria-label="Brand">
            <option value="all">All brands</option>
            {brands.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <select className="input" value={typeId} onChange={(e) => { setTypeId(e.target.value); setOffset(0); }} aria-label="Product type">
            <option value="all">All types</option>
            {types.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <SortSelect value={sort} options={SORT_NAME_TIME} onChange={(v) => { setSort(v); setOffset(0); }} />
          {filtered && <Button size="sm" variant="secondary" onClick={() => { setSearch(''); setBrandId('all'); setTypeId('all'); setOffset(0); }}>Clear filters ✕</Button>}
        </div>
        {error && <div style={{ padding: 16 }}><ErrorBox error={error} onRetry={reload} /></div>}
        {loading && !data ? <Loading /> : data && (data.items.length ? (
          <>
            <div className="table-wrap">
              <table>
                <thead><tr><th scope="col">Product</th><th scope="col" className="num">Price</th><th scope="col" className="num">In stock</th><th scope="col">Sourced from</th><th scope="col">Distributor</th><th scope="col">Box / pack</th><th scope="col">Status</th><th scope="col" /></tr></thead>
                <tbody>
                  {data.items.map((l) => (
                    <tr key={l.id} className={featured ? 'row-featured' : ''}>
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
                        {mayChange && <Link className="btn btn-secondary btn-sm" to={`${scope.home}/${l.id}`}>Edit</Link>}{' '}
                        {mayChange && (featured || !l.adminHold) && (l.isActive
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
          <Empty title={status === 'all' && !filtered ? (featured ? 'TSM has no featured listings yet' : 'You have no listings yet') : 'Nothing here'}>
            {status === 'all' && !filtered ? (mayChange ? <Link to={`${scope.home}/new`}>{featured ? 'Post the first featured product' : 'List your first product'}</Link> : null) : 'Try another tab or clear the filters.'}
          </Empty>
        ))}
      </Card>
      {!featured && data?.items.some((l) => l.adminHold) && (
        <div style={{ marginTop: 16 }}><Alert tone="warn">Offers on hold are hidden from shoppers. You can still correct the price or stock, but only TSM can release the hold. Contact support if you think it is a mistake.</Alert></div>
      )}
    </>
  );
}

export default function Listings() {
  return <ListingsView scope={SELLER_SCOPE} />;
}

export function FeaturedListings() {
  return <ListingsView scope={FEATURED_SCOPE} />;
}
