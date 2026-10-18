import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { mediaUrl, publicApi, sellerApi } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { Alert, Badge, Button, Card, Empty, ErrorBox, Field, Loading, PageHeader, SearchBox, Thumb, useToast } from '../../components/ui.jsx';
import { SOURCE_OPTIONS, centsToDollars, dollarsToCents, money, sourceLabel } from '../../format.js';
import { useApi, useDebounced, useTitle } from '../../hooks.js';

const PICK_LIMIT = 24;

/** Step 1 when creating: choose from the products TSM staff made. */
function ProductPicker({ onPick }) {
  const [search, setSearch] = useState('');
  const q = useDebounced(search);
  const [brandId, setBrandId] = useState('all');
  const [offset, setOffset] = useState(0);
  const brands = useApi(() => publicApi.get('/api/brands'), []);
  const { data, error, loading, reload } = useApi(
    () => sellerApi.get('/api/seller/catalog', { q, brandId, limit: PICK_LIMIT, offset }),
    [q, brandId, offset],
  );
  return (
    <Card title="1. Choose a product" padded={false}>
      <div className="filters">
        <SearchBox value={search} onChange={(v) => { setSearch(v); setOffset(0); }} placeholder="Search the TSM catalog…" />
        <select className="input" value={brandId} onChange={(e) => { setBrandId(e.target.value); setOffset(0); }} aria-label="Brand">
          <option value="all">All brands</option>
          {brands.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>
      <p className="muted small" style={{ margin: '12px 14px 0' }}>
        You can only list products TSM has added to the catalog. The picture and description are set by TSM. Can’t find what you sell? Ask TSM support to add it.
      </p>
      {error && <div style={{ padding: 16 }}><ErrorBox error={error} onRetry={reload} /></div>}
      {loading && !data ? <Loading /> : data && (data.items.length ? (
        <>
          <div className="picker">
            {data.items.map((p) => (
              <button type="button" key={p.id} className="pick-card" onClick={() => onPick(p)}>
                <div className="pic">
                  {p.thumbnailUrl ? <img src={mediaUrl(p.thumbnailUrl)} alt="" loading="lazy" /> : <Thumb size={60} />}
                </div>
                <div className="info">
                  <div className="brand">{p.brand.name}</div>
                  <div className="nm">{p.name}</div>
                  <div className="muted small">{p.type.name}</div>
                  {p.myListingCount > 0 && <div style={{ marginTop: 6 }}><Badge tone="gold">You list this ({p.myListingCount})</Badge></div>}
                </div>
              </button>
            ))}
          </div>
          <div className="pagination">
            <span>{offset + 1}–{Math.min(offset + PICK_LIMIT, data.total)} of {data.total}</span>
            <div className="pagination-buttons">
              <Button size="sm" variant="secondary" disabled={offset <= 0} onClick={() => setOffset(Math.max(0, offset - PICK_LIMIT))}>← Previous</Button>
              <Button size="sm" variant="secondary" disabled={offset + PICK_LIMIT >= data.total} onClick={() => setOffset(offset + PICK_LIMIT)}>Next →</Button>
            </div>
          </div>
        </>
      ) : <Empty title="No products match">Try a different search or brand.</Empty>)}
    </Card>
  );
}

function ProductHero({ product, onChange }) {
  return (
    <Card title={onChange ? '1. Product' : 'Product'} actions={onChange && <Button size="sm" variant="secondary" onClick={onChange}>Change product</Button>}>
      <div className="product-hero">
        <div className="big">{product.thumbnailUrl ? <img src={mediaUrl(product.thumbnailUrl)} alt="" /> : <Thumb size={80} />}</div>
        <div>
          <div className="muted small" style={{ textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700 }}>{product.brand}</div>
          <h2 style={{ fontSize: 20, margin: '2px 0 8px' }}>{product.name}</h2>
          {product.description && <p className="muted" style={{ whiteSpace: 'pre-line' }}>{product.description}</p>}
          <p className="faint small" style={{ margin: 0 }}>The picture and description come from TSM and can’t be changed here.</p>
        </div>
      </div>
    </Card>
  );
}

const EMPTY = { price: '', quantity: '', sourceType: '', distributor: '', packaging: 'case', boxNumber: '', boxesInCase: '' };

function ListingFormInner() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const toast = useToast();
  const { seller } = useAuth();
  const distributors = seller.profile.distributors || [];

  const [product, setProduct] = useState(null); // { id, name, brand, description, thumbnailUrl }
  const [form, setForm] = useState(EMPTY);
  const [original, setOriginal] = useState(null);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const existing = useApi(() => (isNew ? Promise.resolve(null) : sellerApi.get(`/api/seller/listings/${id}`)), [id]);
  useTitle(isNew ? 'List a product' : 'Edit listing');

  // Editing: fill the form from the saved offer and fetch the TSM description for the product.
  useEffect(() => {
    const l = existing.data;
    if (!l) return undefined;
    const values = {
      price: centsToDollars(l.priceCents),
      quantity: String(l.quantityAvailable),
      sourceType: l.sourceType,
      distributor: l.distributor || '',
      packaging: l.packaging,
      boxNumber: l.boxNumber ? String(l.boxNumber) : '',
      boxesInCase: l.boxesInCase ? String(l.boxesInCase) : '',
    };
    setForm(values);
    setOriginal(values);
    setProduct({ id: l.productId, name: l.productName, brand: l.brandName, description: '', thumbnailUrl: l.thumbnailUrl });
    let alive = true;
    publicApi.get(`/api/products/${l.productId}`).then((p) => {
      if (alive) setProduct((cur) => ({ ...cur, description: p.description || '' }));
    }).catch(() => {});
    return () => { alive = false; };
  }, [existing.data]);

  // Editing a field clears its error message (fields that depend on each other clear together).
  const CLEARS = { price: ['priceCents'], quantity: ['quantityAvailable'], boxesInCase: ['boxesInCase', 'boxNumber'], packaging: ['packaging', 'boxNumber', 'boxesInCase'] };
  const clearErrors = (key) => setErrors((cur) => {
    const next = { ...cur };
    for (const k of CLEARS[key] ?? [key]) delete next[k];
    return next;
  });
  const set = (key) => (e) => {
    const { value } = e.target;
    setForm((f) => ({ ...f, [key]: value }));
    clearErrors(key);
  };
  const pickProduct = (p) => setProduct({ id: p.id, name: p.name, brand: p.brand.name, description: p.description, thumbnailUrl: p.thumbnailUrl });

  const isCase = form.packaging === 'case';
  const boxPreview = isCase && form.boxNumber && form.boxesInCase ? `Box ${form.boxNumber} of ${form.boxesInCase}` : null;
  const legacyCase = !isNew && existing.data?.packaging === 'case' && !existing.data.boxNumber;

  const body = useMemo(() => {
    const cents = dollarsToCents(form.price);
    const stock = form.quantity.trim() === '' ? null : Number(form.quantity);
    const b = {
      priceCents: cents,
      quantityAvailable: stock,
      sourceType: form.sourceType || undefined,
      distributor: form.distributor.trim(),
      packaging: form.packaging,
    };
    if (isCase) {
      b.boxNumber = form.boxNumber.trim() === '' ? undefined : Number(form.boxNumber);
      b.boxesInCase = form.boxesInCase.trim() === '' ? undefined : Number(form.boxesInCase);
    }
    return b;
  }, [form, isCase]);

  const submit = async (e) => {
    e.preventDefault();
    setErrors({});
    setFormError('');

    // Friendly checks first; the server repeats them.
    const local = {};
    if (!isNew && !product) return;
    if (isNew && !product) { setFormError('Choose a product first.'); return; }
    if (body.priceCents === null || body.priceCents < 1) local.priceCents = 'Enter a price like 124.99';
    if (!Number.isInteger(body.quantityAvailable) || body.quantityAvailable < 0) local.quantityAvailable = 'Enter how many you have in stock (0 or more)';
    if (!body.sourceType) local.sourceType = 'Choose where this product was sourced from';
    if (body.distributor.length < 2) local.distributor = 'Enter the distributor or supplier name';
    const packagingChanged = !original || form.packaging !== original.packaging || form.boxNumber !== original.boxNumber || form.boxesInCase !== original.boxesInCase;
    if (isCase && (isNew || packagingChanged || !legacyCase)) {
      if (!Number.isInteger(body.boxNumber) || body.boxNumber < 1) local.boxNumber = 'Enter which box in the case this is';
      if (!Number.isInteger(body.boxesInCase) || body.boxesInCase < 1) local.boxesInCase = 'Enter how many boxes are in the case';
      if (!local.boxNumber && !local.boxesInCase && body.boxNumber > body.boxesInCase) local.boxNumber = 'The box number can’t be higher than the boxes in the case';
    }
    if (Object.keys(local).length) { setErrors(local); return; }

    setSaving(true);
    try {
      if (isNew) {
        await sellerApi.post('/api/seller/listings', { productId: product.id, ...body });
        toast('Listed! Shoppers can see it now.');
      } else {
        // Only send what changed. An older case offer without a box number can still have its price or stock edited.
        const patch = {};
        if (form.price !== original.price) patch.priceCents = body.priceCents;
        if (form.quantity !== original.quantity) patch.quantityAvailable = body.quantityAvailable;
        if (form.sourceType !== original.sourceType) patch.sourceType = body.sourceType;
        if (form.distributor.trim() !== original.distributor) patch.distributor = body.distributor;
        if (packagingChanged) {
          patch.packaging = body.packaging;
          if (isCase) { patch.boxNumber = body.boxNumber; patch.boxesInCase = body.boxesInCase; }
        }
        if (!Object.keys(patch).length) { toast('Nothing to save: no changes.'); setSaving(false); return; }
        await sellerApi.patch(`/api/seller/listings/${id}`, patch);
        toast('Changes saved');
      }
      navigate('/seller/listings');
    } catch (err) {
      setErrors(err.fieldErrors);
      if (!Object.keys(err.fieldErrors).length) setFormError(err.message);
      setSaving(false);
    }
  };

  if (!isNew && !product) {
    return existing.error ? <ErrorBox error={existing.error} onRetry={existing.reload} /> : <Loading />;
  }

  const held = !isNew && existing.data?.adminHold;
  const showPicker = isNew && !product;

  return (
    <>
      <PageHeader
        back={{ to: '/seller/listings', label: 'My listings' }}
        title={isNew ? 'List a product' : 'Edit listing'}
        subtitle="Be upfront: shoppers see exactly what you enter here, including where the product came from and which box or pack it is."
      />
      {showPicker ? <ProductPicker onPick={pickProduct} errorField={errors.productId} /> : product && (
        <form onSubmit={submit} className="stack" noValidate>
          {held && <Alert tone="error">TSM put this offer on hold: {existing.data.adminHoldReason}. You can correct the details, but only TSM can release it.</Alert>}
          {errors.productId && <Alert tone="error">{errors.productId}</Alert>}
          <ProductHero product={product} onChange={isNew ? () => setProduct(null) : undefined} />

          <div className="grid grid-sidebar">
            <Card title={isNew ? '2. Your offer' : 'Your offer'}>
              <div className="form-grid">
                <Field label="Your price (each)" required error={errors.priceCents} hint="In US dollars.">
                  <div className="input-group">
                    <span className="prefix">$</span>
                    <input className="input" inputMode="decimal" placeholder="124.99" value={form.price} onChange={set('price')} />
                  </div>
                </Field>
                <Field label="How many you have in stock" required error={errors.quantityAvailable} hint="Enter 0 if you are out; the offer stays but shows as sold out.">
                  <input className="input" type="number" min="0" step="1" inputMode="numeric" value={form.quantity} onChange={set('quantity')} />
                </Field>

                <Field label="Where was it sourced from?" required error={errors.sourceType} className="full">
                  <select className="input" value={form.sourceType} onChange={set('sourceType')}>
                    <option value="">Choose…</option>
                    {SOURCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </Field>
                <Field label="Distributor or supplier" required error={errors.distributor} className="full" hint="The company you bought it from, for example “Southeast Card Distribution”. Shoppers see this.">
                  <input className="input" list="my-distributors" value={form.distributor} maxLength={120} onChange={set('distributor')} placeholder="Company name" />
                  <datalist id="my-distributors">{distributors.map((d) => <option key={d} value={d} />)}</datalist>
                </Field>

                <div className="full">
                  <div className="field-label" style={{ marginBottom: 8 }}>How is it packaged? <span className="req">*</span></div>
                  <div className="radio-cards" role="radiogroup" aria-label="Packaging">
                    <label className={`radio-card ${isCase ? 'selected' : ''}`}>
                      <input type="radio" name="packaging" checked={isCase} onChange={() => { setForm((f) => ({ ...f, packaging: 'case' })); clearErrors('packaging'); }} />
                      <span><span className="t">A box from a sealed case</span><br /><span className="d">Say which box it is, like “Box 4 of 12”.</span></span>
                    </label>
                    <label className={`radio-card ${!isCase ? 'selected' : ''}`}>
                      <input type="radio" name="packaging" checked={!isCase} onChange={() => { setForm((f) => ({ ...f, packaging: 'loose' })); clearErrors('packaging'); }} />
                      <span><span className="t">Loose product</span><br /><span className="d">Not part of a numbered case.</span></span>
                    </label>
                  </div>
                  {errors.packaging && <div className="field-error" style={{ marginTop: 6 }}>{errors.packaging}</div>}
                </div>

                {isCase && (
                  <>
                    <Field label="Which box is this?" required error={errors.boxNumber} hint="Box number within the case.">
                      <input className="input" type="number" min="1" step="1" inputMode="numeric" value={form.boxNumber} onChange={set('boxNumber')} placeholder="4" />
                    </Field>
                    <Field label="Boxes in the case" required error={errors.boxesInCase} hint="How many boxes the whole case holds.">
                      <input className="input" type="number" min="1" step="1" inputMode="numeric" value={form.boxesInCase} onChange={set('boxesInCase')} placeholder="12" />
                    </Field>
                    {legacyCase && !errors.boxNumber && (
                      <div className="full"><Alert tone="info">This older offer doesn’t say which box it is. Add the box number and case size to make it fully transparent (you can still save price or stock changes without it).</Alert></div>
                    )}
                  </>
                )}
              </div>
              {formError && <div style={{ marginTop: 14 }}><Alert tone="error">{formError}</Alert></div>}
              <div className="row" style={{ marginTop: 18 }}>
                <Button type="submit" loading={saving}>{isNew ? 'List this product' : 'Save changes'}</Button>
                <Link className="btn btn-ghost btn-md" to="/seller/listings">Cancel</Link>
              </div>
            </Card>

            <Card title="What shoppers will see">
              <div className="stack" style={{ gap: 10 }}>
                <div className="row-between">
                  <strong>{seller.profile.displayName}</strong>
                  <strong style={{ fontSize: 20 }}>{dollarsToCents(form.price) ? money(dollarsToCents(form.price)) : '$—'}</strong>
                </div>
                <div className="muted small">
                  Sourced from: <span style={{ color: 'var(--text)' }}>{form.sourceType ? sourceLabel(form.sourceType) : '—'}</span>
                </div>
                <div className="muted small">
                  Distributor: <span style={{ color: 'var(--text)' }}>{form.distributor.trim() || '—'}</span>
                </div>
                <div className="muted small">
                  Box / pack: <span style={{ color: 'var(--text)' }}>{isCase ? (boxPreview || '—') : 'Loose product'}</span>
                </div>
                <div className="muted small">
                  In stock: <span style={{ color: 'var(--text)' }}>{form.quantity === '' ? '—' : form.quantity}</span>
                </div>
              </div>
              <p className="faint small" style={{ margin: '14px 0 0' }}>You can pause or change this offer at any time from My listings.</p>
            </Card>
          </div>
        </form>
      )}
    </>
  );
}

export default function ListingForm() {
  const { id } = useParams();
  return <ListingFormInner key={id || 'new'} />;
}
