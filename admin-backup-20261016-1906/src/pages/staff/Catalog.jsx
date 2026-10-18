import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { staffApi } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { Badge, Card, ClickRow, Empty, ErrorBox, Loading, PageHeader, Pagination, SearchBox, Thumb } from '../../components/ui.jsx';
import { useApi, useDebounced, useTitle } from '../../hooks.js';

const LIMIT = 50;

export function ReadyBadges({ p }) {
  if (!p.isActive) return <Badge tone="gray">Inactive</Badge>;
  if (p.isReady) return <Badge tone="green">Ready for sellers</Badge>;
  return (
    <span className="row" style={{ gap: 6 }}>
      {!p.hasPhoto && <Badge tone="amber">Needs photo</Badge>}
      {!p.hasDescription && <Badge tone="amber">Needs description</Badge>}
    </span>
  );
}

export default function Catalog() {
  useTitle('Product catalog');
  const { canWrite } = useAuth();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('q') || '');
  const q = useDebounced(search);
  const brandId = params.get('brandId') || 'all';
  const typeId = params.get('typeId') || 'all';
  const status = params.get('status') || 'all';
  const [offset, setOffset] = useState(0);

  const setParam = (key, value) => {
    const next = new URLSearchParams(params);
    if (!value || value === 'all') next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
    setOffset(0);
  };

  const brands = useApi(() => staffApi.get('/api/staff/brands'), []);
  const types = useApi(() => staffApi.get('/api/staff/product-types'), []);
  const { data, error, loading, reload } = useApi(
    () => staffApi.get('/api/staff/products', { q, brandId, typeId, status, limit: LIMIT, offset }),
    [q, brandId, typeId, status, offset],
  );

  return (
    <>
      <PageHeader
        title="Product catalog"
        subtitle="The products sellers choose from. You set the name, picture and description here; sellers add only their price, stock and sourcing. A product appears for sellers once it has a description and a main photo."
        actions={canWrite && <Link className="btn btn-primary btn-md" to="/staff/catalog/new">+ New product</Link>}
      />
      <Card padded={false}>
        <div className="filters">
          <SearchBox value={search} onChange={(v) => { setSearch(v); setOffset(0); }} placeholder="Search products…" />
          <select className="input" value={brandId} onChange={(e) => setParam('brandId', e.target.value)} aria-label="Brand">
            <option value="all">All brands</option>
            {brands.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <select className="input" value={typeId} onChange={(e) => setParam('typeId', e.target.value)} aria-label="Type">
            <option value="all">All types</option>
            {types.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <select className="input" value={status} onChange={(e) => setParam('status', e.target.value)} aria-label="Status">
            <option value="all">Any status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="needs_content">Needs photo or description</option>
          </select>
        </div>
        {error && <div style={{ padding: 16 }}><ErrorBox error={error} onRetry={reload} /></div>}
        {loading && !data ? <Loading /> : data && (data.items.length ? (
          <>
            <div className="table-wrap">
              <table>
                <thead><tr><th scope="col">Product</th><th scope="col">Type</th><th scope="col">Status</th><th scope="col" className="num">Offers</th><th scope="col" className="num">Live</th></tr></thead>
                <tbody>
                  {data.items.map((p) => (
                    <ClickRow key={p.id} to={`/staff/catalog/${p.id}`}>
                      <td>
                        <div className="cell-product">
                          <Thumb src={p.thumbnailUrl} alt="" />
                          <div><div className="name">{p.name}</div><div className="sub">{p.brand.name}</div></div>
                        </div>
                      </td>
                      <td>{p.type.name}</td>
                      <td><ReadyBadges p={p} /></td>
                      <td className="num">{p.listingCount}</td>
                      <td className="num">{p.liveListingCount}</td>
                    </ClickRow>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination total={data.total} limit={LIMIT} offset={offset} onChange={setOffset} />
          </>
        ) : (
          <Empty title="No products match">Try a different search or filter.</Empty>
        ))}
      </Card>
    </>
  );
}
