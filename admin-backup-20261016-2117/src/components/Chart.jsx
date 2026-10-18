// A small stacked bar chart drawn as plain SVG (no chart library). One bar per day / week / month:
// what the seller receives (green) + TSM's fee (red) + the payment (Apple) fee (amber) = the sale total.
import { bucketLabel, bucketTitle, money } from '../format.js';

/** A friendly top value for the y axis: 1, 2, 2.5, 5 or 10 times a power of ten. */
export function niceMax(value) {
  if (value <= 0) return 100;
  const power = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 2.5, 5, 10]) if (value <= step * power) return step * power;
  return 10 * power;
}

export function SalesChart({ buckets, period }) {
  const W = 760;
  const H = 260;
  const pad = { l: 64, r: 12, t: 14, b: 34 };
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const top = niceMax(Math.max(0, ...buckets.map((b) => b.grossCents)));
  const slot = innerW / Math.max(1, buckets.length);
  const barW = Math.max(4, Math.min(36, slot * 0.66));
  const y = (cents) => pad.t + innerH - (cents / top) * innerH;
  const every = Math.max(1, Math.ceil(buckets.length / 8)); // about 8 labels along the bottom
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * top);

  return (
    <div className="chart-scroll">
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Sales per ${period}`}>
      {ticks.map((t) => (
        <g key={t}>
          <line className="grid-line" x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} />
          <text x={pad.l - 8} y={y(t) + 4} textAnchor="end">{money(t)}</text>
        </g>
      ))}
      {buckets.map((b, i) => {
        const x = pad.l + i * slot + (slot - barW) / 2;
        // stack from the bottom: net, then TSM fee, then the payment fee
        const parts = [
          { cls: 'bar-net', cents: b.netCents },
          { cls: 'bar-tsm', cents: b.tsmFeeCents },
          { cls: 'bar-proc', cents: b.processingFeeCents },
        ];
        let used = 0;
        return (
          <g key={b.start}>
            {parts.map((p) => {
              if (p.cents <= 0) return null;
              const yTop = y(used + p.cents);
              const height = y(used) - yTop;
              used += p.cents;
              return <rect key={p.cls} className={p.cls} x={x} y={yTop} width={barW} height={Math.max(1, height)} rx="2" />;
            })}
            <rect className="bar-hover" x={pad.l + i * slot} y={pad.t} width={slot} height={innerH}>
              <title>{`${bucketTitle(period, b.start)}\nSales ${money(b.grossCents)} · you receive ${money(b.netCents)}\nTSM fee ${money(b.tsmFeeCents)} · payment fee ${money(b.processingFeeCents)}\n${b.orders} order${b.orders === 1 ? '' : 's'}, ${b.units} item${b.units === 1 ? '' : 's'}`}</title>
            </rect>
            {i % every === 0 && (
              <text x={pad.l + i * slot + slot / 2} y={H - 12} textAnchor="middle">{bucketLabel(period, b.start)}</text>
            )}
          </g>
        );
      })}
    </svg>
    </div>
  );
}

export function ChartLegend() {
  return (
    <div className="legend">
      <span><i style={{ background: 'var(--green)' }} />You receive</span>
      <span><i style={{ background: 'var(--accent)' }} />TSM fee</span>
      <span><i style={{ background: 'var(--amber)' }} />Payment (Apple) fee</span>
    </div>
  );
}
