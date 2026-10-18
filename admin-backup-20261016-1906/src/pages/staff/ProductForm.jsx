import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { mediaUrl, staffApi } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { Alert, Badge, Button, Card, ConfirmModal, ErrorBox, Field, Loading, PageHeader, useToast } from '../../components/ui.jsx';
import { bytes } from '../../format.js';
import { useApi, useTitle } from '../../hooks.js';
import { prepareImage } from '../../imageResize.js';

const SLOTS = [
  { slot: 1, label: 'Main photo', hint: 'Shown in the shop and in the app’s product lists. Square works best.', square: true },
  { slot: 2, label: 'Photo 2', hint: 'Optional extra angle.', square: false },
  { slot: 3, label: 'Photo 3', hint: 'Optional extra angle.', square: false },
];

function PhotoSlot({ productId, config, image, disabled, onChanged }) {
  const toast = useToast();
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [crop, setCrop] = useState(config.square);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const url = mediaUrl(image?.url);

  const choose = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const prepared = await prepareImage(file, { square: crop });
      const form = new FormData();
      form.append('slot', String(config.slot));
      form.append('image', prepared, prepared.name);
      const product = await staffApi.upload(`/api/staff/products/${productId}/images`, form);
      onChanged(product);
      toast(`${config.label} saved (${bytes(prepared.size)})`);
    } catch (err) {
      setError(err.fieldErrors?.image || err.message);
    }
    setBusy(false);
  };

  const remove = async () => {
    const product = await staffApi.del(`/api/staff/products/${productId}/images/${config.slot}`);
    onChanged(product);
    toast(`${config.label} removed`);
  };

  return (
    <div className={`photo-slot ${config.slot === 1 ? 'main' : ''}`}>
      <div className="label">{config.label}{config.slot === 1 && <span className="req"> *</span>}</div>
      <div className="photo-frame">
        {url ? <img src={url} alt={config.label} /> : <span className="small">No photo</span>}
        {busy && <div className="busy"><span className="spinner" /></div>}
      </div>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={choose} />
      {!disabled && (
        <>
          {config.slot === 1 && !url && (
            <label className="check small">
              <input type="checkbox" checked={crop} onChange={(e) => setCrop(e.target.checked)} />
              Crop to a square
            </label>
          )}
          <div className="btns">
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => input.current?.click()}>{url ? 'Replace' : 'Upload'}</Button>
            {url && <Button size="sm" variant="danger" disabled={busy} onClick={() => setConfirmRemove(true)}>Remove</Button>}
          </div>
        </>
      )}
      <div className="field-hint">{config.hint}</div>
      {error && <div className="field-error">{error}</div>}
      {confirmRemove && (
        <ConfirmModal title={`Remove ${config.label.toLowerCase()}?`} confirmLabel="Remove photo" danger onConfirm={remove} onClose={() => setConfirmRemove(false)}>
          <p>
            {config.slot === 1
              ? 'Without a main photo this product disappears from the seller catalog (existing offers stay, but you should add a new photo).'
              : 'The picture is deleted from the server.'}
          </p>
        </ConfirmModal>
      )}
    </div>
  );
}

function ProductFormInner() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const { canWrite } = useAuth();

  const brands = useApi(() => staffApi.get('/api/staff/brands'), []);
  const types = useApi(() => staffApi.get('/api/staff/product-types'), []);
  const loaded = useApi(() => (isNew ? Promise.resolve(null) : staffApi.get(`/api/staff/products/${id}`)), [id]);

  const [product, setProduct] = useState(null);
  const [form, setForm] = useState({ name: '', brandId: '', productTypeId: '', description: '', isActive: true });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (loaded.data) {
      setProduct(loaded.data);
      setForm({
        name: loaded.data.name,
        brandId: loaded.data.brand.id,
        productTypeId: loaded.data.type.id,
        description: loaded.data.description,
        isActive: loaded.data.isActive,
      });
    }
  }, [loaded.data]);

  useTitle(isNew ? 'New product' : product?.name || 'Product');

  const set = (key) => (e) => {
    const { type, checked, value } = e.target;
    setForm((f) => ({ ...f, [key]: type === 'checkbox' ? checked : value }));
    setErrors((cur) => {
      if (!cur[key]) return cur;
      const next = { ...cur };
      delete next[key];
      return next;
    });
  };

  const dirty = isNew || (product && (
    form.name !== product.name || form.brandId !== product.brand.id || form.productTypeId !== product.type.id
    || form.description !== product.description || form.isActive !== product.isActive));

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    setFormError('');
    try {
      const body = {
        name: form.name.trim(),
        brandId: form.brandId,
        productTypeId: form.productTypeId,
        description: form.description.trim(),
      };
      if (isNew) {
        const created = await staffApi.post('/api/staff/products', body);
        toast('Product created. Now add its photos.');
        navigate(`/staff/catalog/${created.id}`, { replace: true, state: { justCreated: true } });
      } else {
        const updated = await staffApi.patch(`/api/staff/products/${id}`, { ...body, isActive: form.isActive });
        setProduct(updated);
        toast('Product saved');
      }
    } catch (err) {
      setErrors(err.fieldErrors);
      if (!Object.keys(err.fieldErrors).length) setFormError(err.message);
    }
    setSaving(false);
  };

  // Editing: wait until the saved product has arrived (the very first render has none yet).
  if (!isNew && !product) {
    return loaded.error ? <ErrorBox error={loaded.error} onRetry={loaded.reload} /> : <Loading />;
  }
  if (brands.loading || types.loading) return <Loading />;

  const disabled = !canWrite;
  const hasDesc = form.description.trim().length >= 10;
  const photoOk = Boolean(product?.hasPhoto);

  return (
    <>
      <PageHeader
        back={{ to: '/staff/catalog', label: 'Product catalog' }}
        title={isNew ? 'New product' : product.name}
        subtitle={isNew ? 'Create the product first, then upload its photos.' : `${product.brand.name} · ${product.type.name}`}
        actions={!isNew && product && (product.isReady ? <Badge tone="green">Ready for sellers</Badge> : <Badge tone="amber">Not ready yet</Badge>)}
      />
      <div className="stack">
        {!canWrite && <Alert tone="info">You can look at this product, but only admins can change it.</Alert>}
        {location.state?.justCreated && !photoOk && <Alert tone="warn">Product saved. Upload a main photo below so sellers can list it.</Alert>}

        <div className="grid grid-sidebar">
          <form onSubmit={save} className="stack">
            <Card title="Details">
              <div className="form-grid">
                <Field label="Brand" required error={errors.brandId}>
                  <select className="input" value={form.brandId} onChange={set('brandId')} disabled={disabled}>
                    <option value="">Choose a brand…</option>
                    {brands.data?.filter((b) => b.isActive || b.id === form.brandId).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </Field>
                <Field label="Product type" required error={errors.productTypeId}>
                  <select className="input" value={form.productTypeId} onChange={set('productTypeId')} disabled={disabled}>
                    <option value="">Choose a type…</option>
                    {types.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </Field>
                <Field label="Product name" required error={errors.name} className="full">
                  <input className="input" value={form.name} onChange={set('name')} maxLength={160} disabled={disabled} placeholder="For example: Crimson Storm Booster Box" />
                </Field>
                <Field
                  label="Description for buyers"
                  required
                  error={errors.description}
                  className="full"
                  hint={`${form.description.trim().length} characters. Sellers see this exactly as buyers do, so say what is in the product and what edition it is.`}
                >
                  <textarea className="input" rows={7} value={form.description} onChange={set('description')} maxLength={4000} disabled={disabled} />
                </Field>
                {!isNew && (
                  <label className="check full">
                    <input type="checkbox" checked={form.isActive} onChange={set('isActive')} disabled={disabled} />
                    Active (visible in the shop and available to sellers)
                  </label>
                )}
              </div>
              {formError && <div style={{ marginTop: 14 }}><Alert tone="error">{formError}</Alert></div>}
              {canWrite && (
                <div className="row" style={{ marginTop: 18 }}>
                  <Button type="submit" loading={saving} disabled={!dirty}>{isNew ? 'Create product' : 'Save changes'}</Button>
                  <Link className="btn btn-ghost btn-md" to="/staff/catalog">Cancel</Link>
                </div>
              )}
            </Card>

            {!isNew && (
              <Card title="Photos">
                <div className="photo-slots">
                  {SLOTS.map((s) => (
                    <PhotoSlot
                      key={s.slot}
                      productId={id}
                      config={s}
                      image={product.images.find((i) => i.slot === s.slot)}
                      disabled={disabled}
                      onChanged={setProduct}
                    />
                  ))}
                </div>
                <p className="faint small" style={{ margin: '12px 0 0' }}>
                  Pictures are shrunk to 1200 pixels on their longest side before upload. These are the exact pictures shoppers see in the app.
                </p>
              </Card>
            )}
          </form>

          <div className="stack">
            <Card title="Ready for sellers?">
              <ul className="checklist">
                <li><span className={`tick ${form.isActive ? 'yes' : 'no'}`}>{form.isActive ? '✓' : '–'}</span> Product is active</li>
                <li><span className={`tick ${hasDesc ? 'yes' : 'no'}`}>{hasDesc ? '✓' : '–'}</span> Description (10+ characters)</li>
                <li><span className={`tick ${photoOk ? 'yes' : 'no'}`}>{photoOk ? '✓' : '–'}</span> Main photo uploaded</li>
              </ul>
              <p className="muted small" style={{ margin: '14px 0 0' }}>
                Approved sellers can only list products that pass all three. They cannot change the picture or description.
              </p>
            </Card>
            {!isNew && product && (
              <Card title="Offers on this product">
                <div className="row-between"><span>All offers</span><strong>{product.listingCount}</strong></div>
                <div className="row-between" style={{ marginTop: 8 }}><span>Live in the shop now</span><strong>{product.liveListingCount}</strong></div>
                <div style={{ marginTop: 14 }}>
                  <Link className="btn btn-secondary btn-sm" to={`/staff/offers?productId=${id}`}>See the offers</Link>
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

/** A fresh form for every product (and for "new"), so nothing carries over when the address changes. */
export default function ProductForm() {
  const { id } = useParams();
  return <ProductFormInner key={id || 'new'} />;
}
