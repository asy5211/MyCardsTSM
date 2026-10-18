import { useEffect, useRef, useState } from 'react';
import { staffApi } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { Alert, Badge, Button, Card, Empty, ErrorBox, Field, Loading, Modal, PageHeader, useToast } from '../../components/ui.jsx';
import { useApi, useTitle } from '../../hooks.js';

function BrandModal({ brand, onSaved, onClose }) {
  const toast = useToast();
  const [name, setName] = useState(brand?.name ?? '');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');

  const save = async () => {
    setBusy(true);
    setErrors({});
    setError('');
    try {
      // A new brand goes to the bottom of the list; drag it where you want it afterwards.
      if (brand) await staffApi.patch(`/api/staff/brands/${brand.id}`, { name: name.trim() });
      else await staffApi.post('/api/staff/brands', { name: name.trim() });
      toast(brand ? 'Brand saved' : 'Brand added at the bottom of the list');
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
      <Field label="Brand name" required error={errors.name} hint={brand ? undefined : 'It is added at the bottom of the list. Drag it up to move it.'}>
        <input className="input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
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
  const [rows, setRows] = useState(null); // what is on screen: changes the moment you drop a brand
  const [dialog, setDialog] = useState(null); // 'new' | brand
  const [saveNote, setSaveNote] = useState({ tone: '', text: '' });
  const [dragId, setDragId] = useState(null);
  const [over, setOver] = useState(null); // { id, where: 'above' | 'below' }
  const version = useRef(0); // which move is the newest one
  const queue = useRef(Promise.resolve()); // saves go one after another, in the order you made the moves

  useEffect(() => { if (data) setRows(data); }, [data]);

  /** Shows the new order at once and saves it straight away (the whole list, so nothing can end up with gaps). */
  const apply = (next) => {
    version.current += 1;
    const mine = version.current;
    setRows(next);
    setSaveNote({ tone: '', text: 'Saving…' });
    queue.current = queue.current
      .then(() => staffApi.put('/api/staff/brands/order', { ids: next.map((b) => b.id) }))
      .then((saved) => {
        if (mine !== version.current) return; // a newer move is already on its way
        setRows(saved);
        setSaveNote({ tone: 'ok', text: 'Order saved' });
      })
      .catch((e) => {
        toast(e.message, 'error');
        setSaveNote({ tone: 'bad', text: `Could not save: ${e.message}` });
        reload(); // put the list back the way the server has it
      });
  };

  const moveTo = (id, toIndex) => {
    const from = rows.findIndex((r) => r.id === id);
    if (from < 0 || toIndex < 0 || toIndex >= rows.length || from === toIndex) return;
    const next = [...rows];
    const [item] = next.splice(from, 1);
    next.splice(toIndex, 0, item);
    apply(next);
  };

  const endDrag = () => { setDragId(null); setOver(null); };
  const drop = () => {
    if (dragId && over) {
      const from = rows.findIndex((r) => r.id === dragId);
      let to = rows.findIndex((r) => r.id === over.id) + (over.where === 'below' ? 1 : 0);
      if (from < to) to -= 1;
      const moving = dragId;
      endDrag();
      moveTo(moving, to);
    } else endDrag();
  };

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
        subtitle={canWrite
          ? 'The brand tiles on the app’s Home screen, in this order. Drag a brand by its ⠿ handle (or use the arrows) and the new order is saved straight away.'
          : 'The brand tiles on the app’s Home screen, in this order.'}
        actions={canWrite && <Button onClick={() => setDialog('new')}>+ Add brand</Button>}
      />
      <Card padded={false}>
        {error && <div style={{ padding: 16 }}><ErrorBox error={error} onRetry={reload} /></div>}
        {loading && !rows ? <Loading /> : rows && (rows.length ? (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    {canWrite && <th scope="col" aria-label="Drag" />}
                    <th scope="col" className="num hide-sm">#</th>
                    <th scope="col">Brand</th>
                    <th scope="col" className="num hide-sm">Products</th>
                    <th scope="col">Status</th>
                    {canWrite && <th scope="col" />}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((b, i) => (
                    <tr
                      key={b.id}
                      draggable={canWrite}
                      className={[dragId === b.id ? 'dragging' : '', over?.id === b.id && dragId !== b.id ? `drop-${over.where}` : ''].join(' ')}
                      onDragStart={(e) => {
                        setDragId(b.id);
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', b.id);
                      }}
                      onDragOver={(e) => {
                        if (!dragId) return;
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                        const box = e.currentTarget.getBoundingClientRect();
                        const where = e.clientY < box.top + box.height / 2 ? 'above' : 'below';
                        setOver((prev) => (prev && prev.id === b.id && prev.where === where ? prev : { id: b.id, where }));
                      }}
                      onDrop={(e) => { e.preventDefault(); drop(); }}
                      onDragEnd={endDrag}
                      style={b.isActive ? undefined : { opacity: 0.6 }}
                    >
                      {canWrite && <td style={{ width: 36 }}><span className="drag-handle" title="Drag to reorder" aria-hidden="true">⠿</span></td>}
                      <td className="num hide-sm">{i + 1}</td>
                      <td><strong>{b.name}</strong></td>
                      <td className="num hide-sm">{b.productCount}</td>
                      <td>{b.isActive ? <Badge tone="green">Shown</Badge> : <Badge tone="gray">Hidden</Badge>}</td>
                      {canWrite && (
                        <td className="right nowrap">
                          <Button size="sm" variant="ghost" aria-label={`Move ${b.name} up`} disabled={i === 0} onClick={() => moveTo(b.id, i - 1)}>↑</Button>
                          <Button size="sm" variant="ghost" aria-label={`Move ${b.name} down`} disabled={i === rows.length - 1} onClick={() => moveTo(b.id, i + 1)}>↓</Button>{' '}
                          <Button size="sm" variant="secondary" onClick={() => setDialog(b)}>Edit</Button>{' '}
                          <Button size="sm" variant="ghost" onClick={() => toggle(b)}>{b.isActive ? 'Hide' : 'Show'}</Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {canWrite && <div style={{ padding: '10px 16px' }}><span className={`save-note ${saveNote.tone}`}>{saveNote.text || 'Changes are saved as you go.'}</span></div>}
          </>
        ) : <Empty title="No brands yet" />)}
      </Card>
      {dialog && <BrandModal brand={dialog === 'new' ? null : dialog} onSaved={reload} onClose={() => setDialog(null)} />}
    </>
  );
}
