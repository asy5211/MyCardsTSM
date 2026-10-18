import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { staffApi } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { Alert, Button, Card, ErrorBox, Field, KeyValue, Loading, Modal, PageHeader, PromptModal, StatusBadge, useToast } from '../../components/ui.jsx';
import { APPLICATION_STATUS, DOC_TYPE_LABEL, bytes, dateTime, sourceLabel } from '../../format.js';
import { useApi, useTitle } from '../../hooks.js';

function ApproveModal({ application, onDone, onClose }) {
  const [displayName, setDisplayName] = useState(application.businessName);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fieldError, setFieldError] = useState('');

  const approve = async () => {
    setBusy(true);
    setError('');
    setFieldError('');
    try {
      const body = {};
      if (displayName.trim()) body.displayName = displayName.trim();
      if (note.trim()) body.note = note.trim();
      const r = await staffApi.post(`/api/staff/seller-applications/${application.id}/approve`, body);
      onDone(r.application);
      onClose();
    } catch (e) {
      setFieldError(e.fieldErrors.displayName || '');
      setError(e.fieldErrors.displayName ? '' : e.message);
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Approve seller"
      onClose={busy ? () => {} : onClose}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={approve} loading={busy}>Approve seller</Button>
        </>
      )}
    >
      <p className="muted">
        This creates their seller account. They can then sign in to the seller portal and list products from your catalog.
      </p>
      <Field label="Store name shown to shoppers" error={fieldError} hint="Taken from the business name. Change it if you prefer a different public name.">
        <input className="input" value={displayName} maxLength={80} onChange={(e) => setDisplayName(e.target.value)} />
      </Field>
      <Field label="Note to the applicant (optional)">
        <textarea className="input" rows={2} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
      </Field>
      {error && <Alert tone="error">{error}</Alert>}
    </Modal>
  );
}

export default function ApplicationDetail() {
  const { id } = useParams();
  const { canWrite } = useAuth();
  const toast = useToast();
  const { data, error, loading, reload } = useApi(() => staffApi.get(`/api/staff/seller-applications/${id}`), [id]);
  const [dialog, setDialog] = useState(null);
  const [busy, setBusy] = useState(false);
  const [docError, setDocError] = useState('');
  const a = data?.application;
  useTitle(a ? a.businessName : 'Application');

  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorBox error={error} onRetry={reload} />;

  const open = a.status === 'submitted' || a.status === 'under_review';

  const startReview = async () => {
    setBusy(true);
    try {
      await staffApi.post(`/api/staff/seller-applications/${id}/start-review`);
      toast('Marked as under review');
      reload();
    } catch (e) {
      toast(e.message, 'error');
    }
    setBusy(false);
  };

  const viewDoc = async (doc) => {
    setDocError('');
    try {
      await staffApi.openFile(`/api/staff/seller-applications/${id}/documents/${doc.id}`);
    } catch (e) {
      setDocError(e.status === 404 ? `“${doc.filename}” is not on the server (the demo applicant’s documents are sample records only).` : e.message);
    }
  };

  return (
    <>
      <PageHeader
        back={{ to: '/staff/applications', label: 'All applications' }}
        title={a.businessName}
        subtitle={`Applied ${dateTime(a.submittedAt)}`}
        actions={open && canWrite && (
          <>
            {a.status === 'submitted' && <Button variant="secondary" loading={busy} onClick={startReview}>Start review</Button>}
            <Button variant="danger" onClick={() => setDialog('decline')}>Decline</Button>
            <Button onClick={() => setDialog('approve')}>Approve</Button>
          </>
        )}
      />
      <div className="stack">
        {a.isTest && <Alert tone="info">This is a development “test” application.</Alert>}
        {open && !canWrite && <Alert tone="info">You can look at this application, but only admins can approve or decline it.</Alert>}
        <div className="grid grid-2">
          <Card title="Business">
            <KeyValue rows={[
              ['Status', <StatusBadge key="s" map={APPLICATION_STATUS} value={a.status} />],
              ['Business name', a.businessName],
              ['Address', a.businessAddress],
              ['Contact email', a.contactEmail],
              ['Phone', a.phoneNumber],
              ['Sources product from', a.sourceType === 'test' ? 'Test' : sourceLabel(a.sourceType)],
              ['Distributors named', a.distributorList],
            ]} />
          </Card>
          <Card title="Applicant account">
            <KeyValue rows={[
              ['Username', a.applicant.username],
              ['Email', a.applicant.email],
              ['Reviewed', a.reviewedAt ? `${dateTime(a.reviewedAt)}${a.reviewedBy ? ` by ${a.reviewedBy}` : ''}` : 'Not yet'],
              ['Decision note', a.decisionNote],
              ['Seller account', a.sellerProfile ? `${a.sellerProfile.displayName} (${a.sellerProfile.status})` : 'None'],
            ]} />
          </Card>
        </div>

        <Card title={`Documents (${a.documents.length})`}>
          {docError && <Alert tone="warn">{docError}</Alert>}
          {a.documents.length ? (
            <ul className="doc-list" style={{ marginTop: docError ? 12 : 0 }}>
              {a.documents.map((d) => (
                <li key={d.id}>
                  <div>
                    <strong>{DOC_TYPE_LABEL[d.type] || d.type}</strong>
                    <div className="muted small">{d.filename} · {bytes(d.sizeBytes)} · uploaded {dateTime(d.uploadedAt)}</div>
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => viewDoc(d)}>View</Button>
                </li>
              ))}
            </ul>
          ) : <p className="muted" style={{ margin: 0 }}>No documents were uploaded.</p>}
          <p className="faint small" style={{ margin: '12px 0 0' }}>Opening a document is recorded in the activity log.</p>
        </Card>
      </div>

      {dialog === 'approve' && <ApproveModal application={a} onDone={() => { toast('Seller approved'); reload(); }} onClose={() => setDialog(null)} />}
      {dialog === 'decline' && (
        <PromptModal
          title="Decline application"
          description="The applicant sees this reason in the app, so be specific about what to fix."
          label="Reason"
          placeholder="For example: The city permit has expired. Please upload a current one."
          confirmLabel="Decline application"
          danger
          onConfirm={async (note) => {
            await staffApi.post(`/api/staff/seller-applications/${id}/decline`, { note });
            toast('Application declined');
            reload();
          }}
          onClose={() => setDialog(null)}
        />
      )}
    </>
  );
}
