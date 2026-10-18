import { useState } from 'react';
import { sellerApi } from '../../api.js';
import { Alert, Badge, Button, Card, Empty, ErrorBox, Loading, PageHeader, Pagination, Stars, useToast } from '../../components/ui.jsx';
import { date } from '../../format.js';
import { useApi, useTitle } from '../../hooks.js';

const LIMIT = 20;

/** One review with the seller's answer (or a box to write one). */
function ReviewCard({ review, onChanged }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(review.sellerResponse || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await sellerApi.post(`/api/seller/reviews/${review.id}/respond`, { response: text });
      toast(review.sellerResponse ? 'Reply updated' : 'Reply posted. Shoppers can read it with the review.');
      setEditing(false);
      await onChanged();
    } catch (e) {
      setError(e.fieldErrors.response || e.message);
    }
    setBusy(false);
  };

  return (
    <article className="review-card">
      <div className="row-between">
        <Stars value={review.rating} />
        <span className="muted small">{date(review.createdAt)}</span>
      </div>
      <div className="small" style={{ margin: '4px 0' }}>
        <strong>{review.reviewer}</strong> bought <strong>{review.productName}</strong>
        {review.boxLabel && <> ({review.boxLabel})</>}
        <span className="muted"> · order {review.orderNumber}</span>
      </div>
      {review.comment ? <p style={{ margin: '6px 0' }}>{review.comment}</p> : <p className="muted" style={{ margin: '6px 0' }}>No comment, just the stars.</p>}

      {editing ? (
        <div className="review-reply">
          <label className="field-label" htmlFor={`reply-${review.id}`}>Your reply (shoppers can read it)</label>
          <textarea id={`reply-${review.id}`} className="input" rows={3} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} autoFocus />
          {error && <Alert tone="error">{error}</Alert>}
          <div className="row" style={{ marginTop: 8 }}>
            <Button onClick={save} loading={busy} disabled={text.trim().length < 2}>{review.sellerResponse ? 'Save reply' : 'Post reply'}</Button>
            <Button variant="ghost" onClick={() => { setEditing(false); setText(review.sellerResponse || ''); setError(''); }} disabled={busy}>Cancel</Button>
            <span className="faint small">{text.length}/1000</span>
          </div>
        </div>
      ) : review.sellerResponse ? (
        <div className="review-reply">
          <div className="row-between"><strong className="small">Your reply</strong><span className="muted small">{date(review.sellerRespondedAt)}</span></div>
          <p style={{ margin: '4px 0 8px' }}>{review.sellerResponse}</p>
          <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>Edit reply</Button>
        </div>
      ) : (
        <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>Reply</Button>
      )}
    </article>
  );
}

export default function Reviews() {
  useTitle('Reviews');
  const [productId, setProductId] = useState('all');
  const [rating, setRating] = useState('all');
  const [answered, setAnswered] = useState('all');
  const [offset, setOffset] = useState(0);
  const { data, error, loading, reload } = useApi(
    () => sellerApi.get('/api/seller/reviews', { productId, rating, answered, limit: LIMIT, offset }),
    [productId, rating, answered, offset],
  );
  const reset = (setter) => (value) => { setter(value); setOffset(0); };

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorBox error={error} onRetry={reload} />;

  const { summary, products } = data;
  const unanswered = products.reduce((sum, p) => sum + p.unanswered, 0);
  const filtered = productId !== 'all' || rating !== 'all' || answered !== 'all';

  return (
    <>
      <PageHeader
        title="Reviews"
        subtitle="What buyers say about the items they bought from you. Answer a review and shoppers see your reply right under it."
      />
      <div className="stack">
        {unanswered > 0 && !filtered && (
          <Alert tone="info">
            <span><strong>{unanswered}</strong> review{unanswered === 1 ? ' has' : 's have'} no reply from you yet.</span>
            <Button size="sm" variant="secondary" onClick={() => reset(setAnswered)('no')}>Show them</Button>
          </Alert>
        )}

        <div className="grid grid-2">
          <Card title="Your rating">
            {summary.count ? (
              <div className="row" style={{ alignItems: 'flex-start', gap: 24 }}>
                <div>
                  <div style={{ fontSize: 40, fontWeight: 800, lineHeight: 1 }}>{summary.average.toFixed(1)}</div>
                  <Stars value={summary.average} />
                  <div className="muted small" style={{ marginTop: 4 }}>{summary.count} review{summary.count === 1 ? '' : 's'}</div>
                </div>
                <div className="grow" style={{ minWidth: 180 }}>
                  {[5, 4, 3, 2, 1].map((n) => (
                    <div className="bar-row" key={n}>
                      <button type="button" className="link-btn" onClick={() => reset(setRating)(rating === String(n) ? 'all' : String(n))} aria-label={`Show ${n}-star reviews`}>{n} ★</button>
                      <div className="bar-track"><div className="bar-fill" style={{ width: `${(summary.distribution[n] / summary.count) * 100}%` }} /></div>
                      <span className="muted small">{summary.distribution[n]}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : <p className="muted" style={{ margin: 0 }}>No reviews yet. Buyers can rate an item once it has arrived.</p>}
          </Card>
          <Card title="By product">
            {products.length ? (
              <div className="stack" style={{ gap: 8 }}>
                {products.map((p) => (
                  <div key={p.productId} className="row-between">
                    <button type="button" className="link-btn" onClick={() => reset(setProductId)(productId === p.productId ? 'all' : p.productId)}>
                      {productId === p.productId ? '✓ ' : ''}{p.productName}
                    </button>
                    <span className="row" style={{ gap: 8 }}>
                      <Stars value={p.average} count={p.count} />
                      {p.unanswered > 0 && <Badge tone="amber">{p.unanswered} to answer</Badge>}
                    </span>
                  </div>
                ))}
              </div>
            ) : <p className="muted" style={{ margin: 0 }}>Reviews are grouped by product here.</p>}
          </Card>
        </div>

        <Card padded={false}>
          <div className="filters">
            <select className="input" value={productId} onChange={(e) => reset(setProductId)(e.target.value)} aria-label="Product">
              <option value="all">All products</option>
              {products.map((p) => <option key={p.productId} value={p.productId}>{p.productName}</option>)}
            </select>
            <select className="input" value={rating} onChange={(e) => reset(setRating)(e.target.value)} aria-label="Stars">
              <option value="all">Any rating</option>
              {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} star{n === 1 ? '' : 's'}</option>)}
            </select>
            <select className="input" value={answered} onChange={(e) => reset(setAnswered)(e.target.value)} aria-label="Replies">
              <option value="all">With or without a reply</option>
              <option value="no">Waiting for my reply</option>
              <option value="yes">I replied</option>
            </select>
            {filtered && <Button size="sm" variant="secondary" onClick={() => { setProductId('all'); setRating('all'); setAnswered('all'); setOffset(0); }}>Clear filters ✕</Button>}
          </div>
          {data.items.length ? (
            <div>
              {data.items.map((r) => <ReviewCard key={r.id} review={r} onChanged={reload} />)}
            </div>
          ) : <Empty title={filtered ? 'No reviews match' : 'No reviews yet'} />}
          <Pagination total={data.total} limit={LIMIT} offset={offset} onChange={setOffset} />
        </Card>
      </div>
    </>
  );
}
