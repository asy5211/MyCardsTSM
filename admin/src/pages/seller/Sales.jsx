import { useState } from 'react';
import { sellerApi } from '../../api.js';
import { Card, ErrorBox, Loading, PageHeader, Stat, Tabs } from '../../components/ui.jsx';
import { ChartLegend, SalesChart } from '../../components/Chart.jsx';
import { bucketTitle, money, number, percentFromBps } from '../../format.js';
import { useApi, useTitle } from '../../hooks.js';

const PERIODS = [
  { value: 'day', label: 'Daily', noun: 'day', one: 'day', unit: 'days', column: 'Day' },
  { value: 'week', label: 'Weekly', noun: 'week', one: 'week', unit: 'weeks', column: 'Week' },
  { value: 'month', label: 'Monthly', noun: 'month', one: 'month', unit: 'months', column: 'Month' },
  { value: 'year', label: 'Yearly', noun: 'year', one: 'year', unit: 'years', column: 'Year' },
];
const DEFAULT_COUNT = { day: 14, week: 12, month: 12, year: 5 };
// Every period offers 1 to 25 in the drop-down.
const COUNT_CHOICES = Array.from({ length: 25 }, (_, i) => i + 1);

export default function Sales() {
  useTitle('Sales rates');
  const [period, setPeriod] = useState('day');
  const [counts, setCounts] = useState(DEFAULT_COUNT);
  const count = counts[period];
  const info = PERIODS.find((p) => p.value === period);
  const { data, error, loading, reload } = useApi(() => sellerApi.get('/api/seller/stats', { period, count }), [period, count]);

  return (
    <>
      <PageHeader
        title="Sales rates"
        subtitle="How much you sell each day, week or month, what TSM and the payment provider take, and what you are paid out."
      />
      <Tabs tabs={PERIODS.map((p) => ({ value: p.value, label: p.label }))} value={period} onChange={setPeriod} />
      <div className="stack">
        <div className="row">
          <label className="row small muted" style={{ gap: 8 }}>
            Show the last
            <select className="input" style={{ width: 'auto' }} value={count} onChange={(e) => setCounts({ ...counts, [period]: Number(e.target.value) })}>
              {COUNT_CHOICES.map((n) => <option key={n} value={n}>{n} {n === 1 ? info.one : info.unit}</option>)}
            </select>
          </label>
        </div>
        {error && <ErrorBox error={error} onRetry={reload} />}
        {loading && !data ? <Loading /> : data && (
          <>
            <div className="grid grid-stats">
              <Stat label={`Sales (${data.count} ${data.count === 1 ? info.one : info.unit})`} value={money(data.totals.grossCents)} hint={`${number(data.totals.orders)} order${data.totals.orders === 1 ? '' : 's'} · ${number(data.totals.units)} item${data.totals.units === 1 ? '' : 's'}`} />
              <Stat label="You receive" value={money(data.totals.netCents)} tone="green" hint="after both fees" />
              <Stat label="TSM fee" value={`−${money(data.totals.tsmFeeCents)}`} hint={`${percentFromBps(data.fees.tsmFeeBps)} today; each sale keeps its own rate`} />
              <Stat label="Payment (Apple) fee" value={`−${money(data.totals.processingFeeCents)}`} hint={`${percentFromBps(data.fees.processingFeeBps)} today; each sale keeps its own rate`} />
              <Stat label="Paid out to you" value={money(data.totals.paidOutCents)} tone="gold" hint="payouts TSM sent in this time" />
            </div>

            <div className="grid grid-2">
              <Card title={`Average per ${info.noun}`}>
                <div className="grid grid-stats" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
                  <Stat label="Sales" value={money(data.averages.grossCents)} />
                  <Stat label="You receive" value={money(data.averages.netCents)} tone="green" />
                  <Stat label="Orders" value={String(data.averages.orders)} />
                </div>
              </Card>
              <Card title="Where each sale goes">
                <p className="muted" style={{ marginTop: 0 }}>
                  From every sale, TSM takes {percentFromBps(data.fees.tsmFeeBps)} and the payment provider (Apple) takes {percentFromBps(data.fees.processingFeeBps)}, before any payout. You receive the rest.
                  Each sale keeps the rates it was made at.
                </p>
              </Card>
            </div>

            <Card title={`Sales per ${info.noun}`}>
              {data.totals.grossCents > 0 ? (
                <>
                  <SalesChart buckets={data.buckets} period={period} />
                  <ChartLegend />
                </>
              ) : <p className="muted" style={{ margin: 0 }}>No sales in this time yet. When you sell something it appears here.</p>}
            </Card>

            <Card title="Details" padded={false}>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">{info.column}</th>
                      <th scope="col" className="num">Orders</th>
                      <th scope="col" className="num">Items</th>
                      <th scope="col" className="num">Sales</th>
                      <th scope="col" className="num">TSM fee</th>
                      <th scope="col" className="num">Payment fee</th>
                      <th scope="col" className="num">You receive</th>
                      <th scope="col" className="num">Paid out</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...data.buckets].reverse().map((b) => (
                      <tr key={b.start} style={b.orders === 0 && b.paidOutCents === 0 ? { opacity: 0.55 } : undefined}>
                        <td className="nowrap">{bucketTitle(period, b.start)}</td>
                        <td className="num">{b.orders}</td>
                        <td className="num">{b.units}</td>
                        <td className="num">{money(b.grossCents)}</td>
                        <td className="num">−{money(b.tsmFeeCents)}</td>
                        <td className="num">−{money(b.processingFeeCents)}</td>
                        <td className="num"><strong>{money(b.netCents)}</strong></td>
                        <td className="num">{b.paidOutCents ? money(b.paidOutCents) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}
      </div>
    </>
  );
}
