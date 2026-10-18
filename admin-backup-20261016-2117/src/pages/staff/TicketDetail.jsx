import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { staffApi } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { Alert, Button, Card, ConfirmModal, ErrorBox, Field, KeyValue, Loading, Modal, MoneyField, PageHeader, PromptModal, Stat, StatusBadge, Thread, useToast } from '../../components/ui.jsx';
import { TICKET_STATUS, centsToDollars, dateTime, dollarsToCents, money } from '../../format.js';
import { useApi, useTitle } from '../../hooks.js';

/** Sends (or replaces) TSM's price. */
function OfferModal({ ticket, onSent, onClose }) {
  const toast = useToast();
  const [amount, setAmount] = useState(ticket.offerCents ? centsToDollars(ticket.offerCents) : '');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');

  const send = async () => {
    const cents = dollarsToCents(amount);
    if (!cents) {
      setErrors({ amountCents: 'Enter the price in dollars, like 1250.00' });
      return;
    }
    setBusy(true);
    setErrors({});
    setError('');
    try {
      await staffApi.post(`/api/staff/tickets/${ticket.id}/offer`, { amountCents: cents, message: message.trim() || null });
      toast(`Offer of ${money(cents)} sent`);
      onSent();
      onClose();
    } catch (e) {
      setErrors(e.fieldErrors);
      if (!Object.keys(e.fieldErrors).length) setError(e.message);
      setBusy(false);
    }
  };

  return (
    <Modal
      title={ticket.offerCents ? 'Send a new price' : 'Send a price offer'}
      onClose={busy ? () => {} : onClose}
      footer={(<><Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button><Button onClick={send} loading={busy}>Send offer</Button></>)}
    >
      <p className="muted" style={{ marginTop: 0 }}>
        The seller asks <strong>{money(ticket.askingTotalCents)}</strong> for the items still in the deal. They see your price in the app and can accept, decline or counter it.
        {ticket.offerCents ? ` The current price on the table is ${money(ticket.offerCents)}, named by ${ticket.offerBy === 'staff' ? 'TSM' : 'the seller'}.` : ''}
      </p>
      <MoneyField label="Your price for all the items" required value={amount} onChange={setAmount} error={errors.amountCents} hint="One total for the whole ticket." />
      <Field label="Message to the seller (optional)">
        <textarea className="input" rows={3} maxLength={2000} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="For example: we can pick up on Friday." />
      </Field>
      {error && <Alert tone="error">{error}</Alert>}
    </Modal>
  );
}

export default function TicketDetail() {
  const { id } = useParams();
  const { canWrite } = useAuth();
  const toast = useToast();
  const { data: t, error, loading, reload } = useApi(() => staffApi.get(`/api/staff/tickets/${id}`), [id]);
  const [dialog, setDialog] = useState(null);
  const [busy, setBusy] = useState(false);
  useTitle(t ? t.ticketNumber : 'Ticket');

  if (loading && !t) return <Loading />;
  if (error && !t) return <ErrorBox error={error} onRetry={reload} />;

  const final = t.status === 'declined' || t.status === 'completed';
  const open = ['submitted', 'in_review', 'offer_sent', 'countered'].includes(t.status);
  const itemsEditable = open;
  const live = t.items.filter((i) => !i.removedByAdmin);

  /** Runs one simple action and shows the new state. */
  const act = async (path, body, done) => {
    setBusy(true);
    try {
      await staffApi.post(`/api/staff/tickets/${id}/${path}`, body);
      toast(done);
      await reload();
    } catch (e) {
      toast(e.message, 'error');
    }
    setBusy(false);
  };

  const setRemoved = (item, removed) => act(`items/${item.id}`, { removed }, removed ? `${item.productName} removed from the deal` : `${item.productName} is back in the deal`);

  let actions = null;
  if (canWrite) {
    actions = (
      <>
        {t.status === 'submitted' && <Button variant="secondary" loading={busy} onClick={() => act('start-review', {}, 'Marked as in review')}>Start review</Button>}
        {t.status === 'countered' && <Button loading={busy} onClick={() => setDialog('acceptCounter')}>Accept {money(t.offerCents)}</Button>}
        {open && <Button variant={t.status === 'countered' ? 'secondary' : 'primary'} onClick={() => setDialog('offer')}>{t.offerCents ? 'Send a new price' : 'Send a price'}</Button>}
        {t.status === 'accepted' && <Button onClick={() => setDialog('complete')}>Mark completed (payment sent)</Button>}
        {open && <Button variant="danger" onClick={() => setDialog('decline')}>Decline</Button>}
      </>
    );
  }

  return (
    <>
      <PageHeader
        back={{ to: '/staff/tickets', label: 'All tickets' }}
        title={t.ticketNumber}
        subtitle={<>From <Link to={`/staff/sellers/${t.seller.id}`}>{t.seller.displayName || t.seller.username}</Link> · {t.seller.email} · opened {dateTime(t.createdAt)}</>}
        actions={actions}
      />
      <div className="stack">
        {t.status === 'countered' && <Alert tone="warn"><span>The seller countered with <strong>{money(t.offerCents)}</strong>. Accept it, or send a different price.</span></Alert>}
        {t.status === 'accepted' && <Alert tone="success"><span>Price agreed at <strong>{money(t.offerCents)}</strong>. Pay the seller outside the app, then mark the ticket completed.</span></Alert>}
        {t.status === 'declined' && <Alert tone="error"><span>This ticket was declined{t.decisionNote ? `: ${t.decisionNote}` : '.'}</span></Alert>}
        {t.status === 'completed' && <Alert tone="info"><span>Completed {dateTime(t.closedAt)} at {money(t.offerCents)}.</span></Alert>}
        {!canWrite && <Alert tone="info"><span>You can read this ticket. Sending prices and closing tickets needs an admin.</span></Alert>}

        <div className="grid grid-stats">
          <Stat label="Status" value={<StatusBadge map={TICKET_STATUS} value={t.status} />} />
          <Stat label="They ask" value={money(t.askingTotalCents)} hint={`${live.length} item${live.length === 1 ? '' : 's'} in the deal`} />
          <Stat
            label="Price on the table"
            value={t.offerCents === null ? '—' : money(t.offerCents)}
            tone={t.offerCents === null ? undefined : 'gold'}
            hint={t.offerCents === null ? 'No price yet' : `Named by ${t.offerBy === 'staff' ? 'TSM' : 'the seller'}`}
          />
        </div>

        <Card title={`Items (${t.items.length})`} padded={false}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Product</th>
                  <th scope="col">Where from</th>
                  <th scope="col" className="num">Qty</th>
                  <th scope="col" className="num">Lowest price each</th>
                  <th scope="col" className="num">Line total</th>
                  {canWrite && itemsEditable && <th scope="col" />}
                </tr>
              </thead>
              <tbody>
                {t.items.map((i) => (
                  <tr key={i.id} style={i.removedByAdmin ? { opacity: 0.55 } : undefined}>
                    <td>
                      <strong style={i.removedByAdmin ? { textDecoration: 'line-through' } : undefined}>{i.productName}</strong>
                      {i.removedByAdmin && <div className="muted small">Removed from the deal</div>}
                    </td>
                    <td>{i.source || '—'}</td>
                    <td className="num">{i.quantity}</td>
                    <td className="num">{i.minPricePerItemCents > 0 ? money(i.minPricePerItemCents) : <span className="muted">No minimum</span>}</td>
                    <td className="num">{i.minPricePerItemCents > 0 ? money(i.minPricePerItemCents * i.quantity) : <span className="muted">—</span>}</td>
                    {canWrite && itemsEditable && (
                      <td className="right">
                        <Button size="sm" variant="ghost" disabled={busy} onClick={() => setRemoved(i, !i.removedByAdmin)}>{i.removedByAdmin ? 'Put back' : 'Remove'}</Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Negotiation">
          <Thread
            messages={t.messages}
            canSend={canWrite && !final}
            closedText={final ? 'This ticket is closed.' : 'Only admins can write on tickets.'}
            placeholder="Write to the seller…"
            onSend={async (body) => {
              await staffApi.post(`/api/staff/tickets/${id}/messages`, { body });
              await reload();
            }}
          />
        </Card>

        <Card title="Seller">
          <KeyValue rows={[
            ['Store', t.seller.displayName || '—'],
            ['Username', t.seller.username],
            ['Email', t.seller.email],
          ]} />
        </Card>
      </div>

      {dialog === 'offer' && <OfferModal ticket={t} onSent={reload} onClose={() => setDialog(null)} />}
      {dialog === 'acceptCounter' && (
        <ConfirmModal
          title="Accept their price?"
          confirmLabel={`Accept ${money(t.offerCents)}`}
          onConfirm={async () => {
            await staffApi.post(`/api/staff/tickets/${id}/accept-counter`);
            toast('Counter offer accepted');
            reload();
          }}
          onClose={() => setDialog(null)}
        >
          <p>You agree to pay {money(t.offerCents)} for the items still in the deal. The seller is told, and the ticket moves to Accepted.</p>
        </ConfirmModal>
      )}
      {dialog === 'decline' && (
        <PromptModal
          title="Decline this ticket?"
          description="The seller is told that TSM can’t move forward. This closes the ticket."
          label="Reason shown to the seller (optional)"
          confirmLabel="Decline ticket"
          required={false}
          danger
          onConfirm={async (note) => {
            await staffApi.post(`/api/staff/tickets/${id}/decline`, { note: note || null });
            toast('Ticket declined');
            reload();
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'complete' && (
        <ConfirmModal
          title="Mark as completed?"
          confirmLabel="Mark completed"
          onConfirm={async () => {
            await staffApi.post(`/api/staff/tickets/${id}/complete`);
            toast('Ticket completed');
            reload();
          }}
          onClose={() => setDialog(null)}
        >
          <p>Only do this after you have paid {money(t.offerCents ?? 0)} to the seller outside the app. The ticket closes and the seller is told the payment was sent.</p>
        </ConfirmModal>
      )}
    </>
  );
}
