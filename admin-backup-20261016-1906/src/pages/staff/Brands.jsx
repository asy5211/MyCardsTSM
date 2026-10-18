import { useState } from 'react';
import { staffApi } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { Alert, Badge, Button, Card, Empty, ErrorBox, Field, Loading, Modal, PageHeader, useToast } from '../../components/ui.jsx';
import { useApi, useTitle } from '../../hooks.js';

function BrandModal({ brand, onSaved, onClose }) {
  const toast = useToast();
  const [name, setName] = useState(brand?.name ?? '');
  const [sortOrder, setSortOrder] = useState(String(brand?.sortOrder ?? 0));
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');

  const save = async () => {
    setBusy(true);
    setErrors({});
    setError('');
    try {
      const body = { name: name.trim(), sortOrder: Number.parseInt(sortOrder, 10) || 0 };
      if (brand) await staffApi.patch(`/api/staff/brands/${brand.id}`, body);
      else await staffApi.post('/api/staff/brands', body);
      toast(brand ? 'Brand saved' : 'Brand added');
      onSaved();
      onClose();
    } catch (e) {
      setErrors(e.fieldErrors);
      if (!Object.keys(e.fieldErrors).length) setError(e.message);
      setBusy(false);
    }
  };

  return (
    <Modal
      title={brand ? 'Edit brand' : 'Add brand'}
      onClose={busy ? () => {} : onClose}
      footer={(<><Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button><Button onClick={save} loading={busy}>Save</Button></>)}
    >
      <Field label="Brand name" required error={errors.name}>
        <input className="input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Order on the Home screen" error={errors.sortOrder} hint="Smaller numbers come first.">
        <input className="input" type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
      </Field>
      {error && <Alert tone="error">{error}</Alert>}
    </Modal>
  );
}

export default function Brands() {
  useTitle('Brands');
  const { canWrite } = useAuth();
  const toast = useToast();
  const { data, error, loading, reload } = useApi(() => staffApi.get('/api/staff/brands'), []);
  const [dialog, setDialog] = useState(null); // 'new' | brand

  const toggle = async (b) => {
    try {
      await staffApi.patch(`/api/staff/brands/${b.id}`, { isActive: !b.isActive });
      toast(b.isActive ? `${b.name} hidden from the shop` : `${b.name} is back in the shop`);
      reload();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  return (
    <>
      <PageHeader
        title="Brands"
        subtitle="The brand tiles on the app’s Home screen, in this order."
        actions={canWrite && <Button onClick={() => setDialog('new')}>+ Add brand</Button>}
      />
      <Card padded={false}>
        {error && <div style={{ padding: 16 }}><ErrorBox error={error} onRetry={reload} /></div>}
        {loading && !data ? <Loading /> : data && (data.length ? (
          <div className="table-wrap">
            <table>
              <thead><tr><th scope="col" className="num">Order</th><th scope="col">Brand</th><th scope="col" className="num">Products</th><th scope="col">Status</th>{canWrite && <th scope="col" />}</tr></thead>
              <tbody>
                {data.map((b) => (
                  <tr key={b.id}>
                    <td className="num">{b.sortOrder}</td>
                    <td><strong>{b.name}</strong></td>
                    <td className="num">{b.productCount}</td>
                    <td>{b.isActive ? <Badge tone="green">Shown</Badge> : <Badge tone="gray">Hidden</Badge>}</td>
                    {canWrite && (
                      <td className="right nowrap">
                        <Button size="sm" variant="secondary" onClick={() => setDialog(b)}>Edit</Button>{' '}
                        <Button size="sm" variant="ghost" onClick={() => toggle(b)}>{b.isActive ? 'Hide' : 'Show'}</Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty title="No brands yet" />)}
      </Card>
      {dialog && <BrandModal brand={dialog === 'new' ? null : dialog} onSaved={reload} onClose={() => setDialog(null)} />}
    </>
  );
}
