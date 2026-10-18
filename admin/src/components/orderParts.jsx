// Pieces shared by the seller's and the staff's order pages: the shipping form and the "what was taken from this sale" box.
import { useState } from 'react';
import { Alert, Button, Card, Field, KeyValue, useToast } from './ui.jsx';
import { CARRIERS, money, percentFromBps } from '../format.js';

/**
 * Mark an order shipped (or fix its tracking number).
 *   api: sellerApi or staffApi        path: the ship endpoint, e.g. `/api/seller/orders/${id}/ship`
 */
export function ShipForm({ order, api, path, onDone }) {
  const toast = useToast();
  const [carrier, setCarrier] = useState(order.carrier || 'UPS');
  const [tracking, setTracking] = useState(order.trackingNumber || '');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const shipped = order.status === 'shipped';

  const save = async () => {
    setBusy(true);
    setErrors({});
    setError('');
    try {
      await api.post(path, { carrier, trackingNumber: tracking });
      toast(shipped ? 'Tracking updated' : 'Marked as shipped. The buyer can see the tracking number.');
      await onDone();
    } catch (e) {
      setErrors(e.fieldErrors);
      if (!Object.keys(e.fieldErrors).length) setError(e.message);
    }
    setBusy(false);
  };

  return (
    <>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <Field label="Carrier" error={errors.carrier}>
          <select className="input" value={carrier} onChange={(e) => setCarrier(e.target.value)}>
            {CARRIERS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Tracking number" error={errors.trackingNumber} className="grow">
          <input className="input" value={tracking} maxLength={60} onChange={(e) => setTracking(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} placeholder="For example 1Z999AA10123456784" />
        </Field>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      <Button onClick={save} loading={busy} disabled={tracking.trim().length < 5}>{shipped ? 'Update tracking' : 'Mark as shipped'}</Button>
    </>
  );
}

/**
 * What was taken from this sale, at the rates it was made at. These are written onto the sale when it happens,
 * so changing the fees later never changes an order that already happened.
 *   fees: order.fees from the API (null for TSM's own store, which takes no fee)
 */
export function FeeSplit({ fees, isTsmSale = false, forSeller = false }) {
  if (!fees) {
    return (
      <Card title="Fees on this sale">
        <p className="muted" style={{ margin: 0 }}>
          {isTsmSale ? 'This sale was made by TSM’s own store, so no fee is taken and nothing is paid out.' : 'No fee was recorded for this sale.'}
        </p>
      </Card>
    );
  }
  return (
    <Card title="Fees on this sale">
      <KeyValue rows={[
        ['Item total', money(fees.grossCents)],
        [`TSM fee (${percentFromBps(fees.tsmFeeBps)})`, `− ${money(fees.commissionCents)}`],
        [`Payment fee (${percentFromBps(fees.processingFeeBps)})`, `− ${money(fees.processingFeeCents)}`],
        [forSeller ? 'You receive' : 'Seller receives', <strong key="n">{money(fees.netCents)}</strong>],
      ]} />
      <p className="faint small" style={{ margin: '10px 0 0' }}>
        These are the rates on the day this item sold. If the fees change later, this sale keeps these numbers.
      </p>
    </Card>
  );
}
