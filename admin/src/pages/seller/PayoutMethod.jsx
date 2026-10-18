import { useState } from 'react';
import { sellerApi } from '../../api.js';
import { Alert, Badge, Button, Card, ConfirmModal, ErrorBox, Field, KeyValue, Loading, PageHeader, useToast } from '../../components/ui.jsx';
import { dateTime } from '../../format.js';
import { useApi, useTitle } from '../../hooks.js';

const TYPES = [
  { value: 'bank_transfer', label: 'Bank transfer', blurb: 'Direct deposit to a US bank account.' },
  { value: 'paypal', label: 'PayPal', blurb: 'Sent to your PayPal email.' },
  { value: 'zelle', label: 'Zelle', blurb: 'Sent to the email or phone you use with Zelle.' },
  { value: 'check', label: 'Paper check', blurb: 'Mailed to a US address.' },
];

const EMPTY = { accountHolder: '', routingNumber: '', accountNumber: '', email: '', contact: '', line1: '', line2: '', city: '', region: '', postalCode: '' };

function Text({ label, name, form, setForm, errors, hint, ...rest }) {
  return (
    <Field label={label} error={errors[name]} hint={hint} required={rest.required}>
      <input className="input" value={form[name]} onChange={(e) => setForm({ ...form, [name]: e.target.value })} {...rest} />
    </Field>
  );
}

function MethodForm({ current, onSaved, onCancel }) {
  const toast = useToast();
  const [type, setType] = useState(current?.type || 'bank_transfer');
  const [form, setForm] = useState({ ...EMPTY, accountHolder: current?.accountHolder || '' });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const f = { form, setForm, errors };

  const save = async () => {
    setBusy(true);
    setErrors({});
    setError('');
    const body = { type, accountHolder: form.accountHolder };
    if (type === 'bank_transfer') Object.assign(body, { routingNumber: form.routingNumber, accountNumber: form.accountNumber });
    if (type === 'paypal') body.email = form.email;
    if (type === 'zelle') body.contact = form.contact;
    if (type === 'check') Object.assign(body, { line1: form.line1, line2: form.line2 || null, city: form.city, region: form.region, postalCode: form.postalCode });
    try {
      await sellerApi.put('/api/seller/payout-method', body);
      toast('Payout method saved');
      onSaved();
    } catch (e) {
      setErrors(e.fieldErrors);
      if (!Object.keys(e.fieldErrors).length) setError(e.message);
    }
    setBusy(false);
  };

  return (
    <Card title={current ? 'Change payout method' : 'Add a payout method'}>
      <div className="method-grid" role="radiogroup" aria-label="How should TSM pay you?">
        {TYPES.map((t) => (
          <button
            key={t.value}
            type="button"
            role="radio"
            aria-checked={type === t.value}
            className={`method-card ${type === t.value ? 'active' : ''}`}
            onClick={() => { setType(t.value); setErrors({}); setError(''); }}
          >
            <strong>{t.label}</strong>
            <span className="muted small">{t.blurb}</span>
          </button>
        ))}
      </div>

      <div className="stack" style={{ maxWidth: 520, marginTop: 16 }}>
        <Text label={type === 'check' ? 'Pay to the order of' : 'Name on the account'} name="accountHolder" required maxLength={100} {...f} />
        {type === 'bank_transfer' && (
          <>
            <Text label="Routing number" name="routingNumber" required inputMode="numeric" maxLength={9} placeholder="9 digits" autoComplete="off" {...f} />
            <Text label="Account number" name="accountNumber" required inputMode="numeric" maxLength={17} autoComplete="off" hint="4 to 17 digits" {...f} />
          </>
        )}
        {type === 'paypal' && <Text label="PayPal email" name="email" required type="email" maxLength={255} {...f} />}
        {type === 'zelle' && <Text label="Zelle email or US phone number" name="contact" required maxLength={255} {...f} />}
        {type === 'check' && (
          <>
            <Text label="Street address" name="line1" required maxLength={120} {...f} />
            <Text label="Apartment, suite (optional)" name="line2" maxLength={120} {...f} />
            <div className="row" style={{ alignItems: 'flex-start' }}>
              <Text label="City" name="city" required maxLength={80} {...f} />
              <Text label="State" name="region" required maxLength={2} placeholder="OH" hint="2 letters" style={{ textTransform: 'uppercase', width: 90 }} {...f} />
              <Text label="ZIP code" name="postalCode" required maxLength={10} inputMode="numeric" {...f} />
            </div>
          </>
        )}
        {error && <Alert tone="error">{error}</Alert>}
        <p className="faint small" style={{ margin: 0 }}>Your details are stored encrypted. After saving, only a short summary (like “Bank account ending 6789”) is shown here, and TSM admins see the full details only when sending your payout. Every look is recorded.</p>
        <div className="row">
          <Button onClick={save} loading={busy}>Save payout method</Button>
          {onCancel && <Button variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>}
        </div>
      </div>
    </Card>
  );
}

export default function PayoutMethod() {
  useTitle('Payout method');
  const toast = useToast();
  const { data, error, loading, reload } = useApi(() => sellerApi.get('/api/seller/payout-method'), []);
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorBox error={error} onRetry={reload} />;
  const m = data.method;

  return (
    <>
      <PageHeader
        title="Payout method"
        subtitle="Where TSM sends the money you earn. Payments are made outside the app, using the method you save here."
      />
      <div className="stack">
        {!m && <Alert tone="warn"><span><strong>No payout method yet.</strong> Add one so TSM can pay you when you have money available.</span></Alert>}
        {m && !editing && (
          <Card
            title="Current payout method"
            actions={(
              <>
                <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>Change</Button>
                <Button size="sm" variant="ghost" onClick={() => setRemoving(true)}>Remove</Button>
              </>
            )}
          >
            <KeyValue rows={[
              ['Method', <Badge key="t" tone="blue">{TYPES.find((t) => t.value === m.type)?.label || m.type}</Badge>],
              ['Saved as', <strong key="l">{m.label}</strong>],
              [m.type === 'check' ? 'Pay to the order of' : 'Name on the account', m.accountHolder],
              ['Last updated', dateTime(m.updatedAt)],
            ]} />
            <p className="faint small" style={{ marginBottom: 0 }}>For your safety the full account details are never shown again. To change them, save a new method.</p>
          </Card>
        )}
        {(!m || editing) && (
          <MethodForm
            current={m}
            onSaved={() => { setEditing(false); reload(); }}
            onCancel={m ? () => setEditing(false) : undefined}
          />
        )}
      </div>
      {removing && (
        <ConfirmModal
          title="Remove your payout method?"
          confirmLabel="Remove"
          danger
          onConfirm={async () => {
            await sellerApi.del('/api/seller/payout-method');
            toast('Payout method removed');
            reload();
          }}
          onClose={() => setRemoving(false)}
        >
          <p>TSM will not know where to send your money until you add a new one. Money you have already earned stays in your account.</p>
        </ConfirmModal>
      )}
    </>
  );
}
