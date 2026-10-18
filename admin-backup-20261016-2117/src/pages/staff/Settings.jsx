import { useEffect, useState } from 'react';
import { staffApi } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { Alert, Button, Card, ErrorBox, Field, KeyValue, Loading, PageHeader, useToast } from '../../components/ui.jsx';
import { bpsToPercent, dateTime, money, percentToBps } from '../../format.js';
import { useApi, useTitle } from '../../hooks.js';

/** A percentage box ("5", "2.9") for a basis-point value. */
function PercentField({ label, value, onChange, error, hint, disabled }) {
  return (
    <Field label={label} error={error} hint={hint}>
      <div className="input-group suffixed">
        <input className="input" inputMode="decimal" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} aria-label={label} />
        <span className="suffix">%</span>
      </div>
    </Field>
  );
}

export default function Settings() {
  useTitle('Fees');
  const { canWrite } = useAuth();
  const toast = useToast();
  const { data, error, loading, reload } = useApi(() => staffApi.get('/api/staff/settings'), []);
  const [tsm, setTsm] = useState('');
  const [proc, setProc] = useState('');
  const [errors, setErrors] = useState({});
  const [failure, setFailure] = useState('');
  const [busy, setBusy] = useState(false);
  const fees = data?.fees;

  useEffect(() => {
    if (fees) {
      setTsm(bpsToPercent(fees.tsmFeeBps));
      setProc(bpsToPercent(fees.processingFeeBps));
    }
  }, [fees]);

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorBox error={error} onRetry={reload} />;

  const tsmBps = percentToBps(tsm);
  const procBps = percentToBps(proc);
  const changed = tsmBps !== fees.tsmFeeBps || procBps !== fees.processingFeeBps;
  const exampleCents = 10_000; // a $100.00 sale
  const take = (bps) => Math.floor((exampleCents * (bps ?? 0)) / 10_000 + 0.5);

  const save = async () => {
    const next = {};
    const problems = {};
    if (tsmBps === null) problems.tsmFeeBps = 'Enter a percentage like 5 or 5.5 (at most two decimals)';
    if (procBps === null) problems.processingFeeBps = 'Enter a percentage like 2.9 (at most two decimals)';
    if (Object.keys(problems).length) {
      setErrors(problems);
      return;
    }
    if (tsmBps !== fees.tsmFeeBps) next.tsmFeeBps = tsmBps;
    if (procBps !== fees.processingFeeBps) next.processingFeeBps = procBps;
    setBusy(true);
    setErrors({});
    setFailure('');
    try {
      await staffApi.put('/api/staff/settings/fees', next);
      toast('Fees saved. They apply to sales made from now on.');
      await reload();
    } catch (e) {
      setErrors(e.fieldErrors);
      if (!Object.keys(e.fieldErrors).length) setFailure(e.message);
    }
    setBusy(false);
  };

  return (
    <>
      <PageHeader
        title="Fees"
        subtitle="What is taken from each sale before the seller is paid. Sellers see both rates on their dashboard."
      />
      <div className="stack">
        {!canWrite && <Alert tone="info">You can see the fees. Only admins can change them.</Alert>}
        <div className="grid grid-2">
          <Card title="Rates">
            <div className="stack">
            <PercentField
              label="TSM fee"
              value={tsm}
              onChange={setTsm}
              disabled={!canWrite}
              error={errors.tsmFeeBps}
              hint={`TSM’s flat cut of every sale. Standard is 5%. Highest allowed: ${bpsToPercent(fees.limits.tsmFeeBps)}%.`}
            />
            <PercentField
              label="Payment (Apple) fee"
              value={proc}
              onChange={setProc}
              disabled={!canWrite}
              error={errors.processingFeeBps}
              hint={`The rate Apple or the payment provider takes. Sellers see this number. Highest allowed: ${bpsToPercent(fees.limits.processingFeeBps)}%.`}
            />
            {failure && <Alert tone="error">{failure}</Alert>}
            {canWrite && (
              <div className="row" style={{ marginTop: 8 }}>
                <Button onClick={save} loading={busy} disabled={!changed}>Save fees</Button>
                {changed && <Button variant="ghost" onClick={() => { setTsm(bpsToPercent(fees.tsmFeeBps)); setProc(bpsToPercent(fees.processingFeeBps)); setErrors({}); }}>Reset</Button>}
              </div>
            )}
            </div>
            <p className="faint small" style={{ marginBottom: 0 }}>
              {fees.updatedAt ? `Last changed ${dateTime(fees.updatedAt)}${fees.updatedBy ? ` by ${fees.updatedBy}` : ''}.` : 'Not changed since setup.'}
            </p>
          </Card>
          <Card title="What a $100.00 sale looks like">
            <KeyValue rows={[
              ['Buyer pays', money(exampleCents)],
              [`TSM fee (${tsm || '0'}%)`, `− ${money(take(tsmBps))}`],
              [`Payment fee (${proc || '0'}%)`, `− ${money(take(procBps))}`],
              ['Seller receives', <strong key="n">{money(exampleCents - take(tsmBps) - take(procBps))}</strong>],
            ]} />
            <p className="faint small" style={{ marginBottom: 0 }}>
              Each sale remembers the rates it was made at, so changing a rate never rewrites past sales or payouts.
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}
