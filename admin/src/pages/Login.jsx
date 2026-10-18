import { useState } from 'react';
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { Alert, Button, Field } from '../components/ui.jsx';
import { useTitle } from '../hooks.js';

export default function Login() {
  useTitle('Sign in');
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const kind = params.get('as') === 'seller' ? 'seller' : 'staff';
  const [identity, setIdentity] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (kind === 'staff' && auth.staff) return <Navigate to="/staff" replace />;
  if (kind === 'seller' && auth.seller) return <Navigate to="/seller" replace />;

  const choose = (next) => {
    setParams({ as: next }, { replace: true });
    setError('');
    auth.clearNotice();
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (kind === 'staff') await auth.signInStaff(identity.trim(), password);
      else await auth.signInSeller(identity.trim(), password);
      const from = location.state?.from;
      navigate(from && from.startsWith(`/${kind}`) ? from : `/${kind}`, { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={submit}>
        <div className="brand">
          <div className="brand-mark">TSM</div>
          <div>
            <div className="brand-name">The Sealed Market</div>
          </div>
        </div>
        <h1>Sign in</h1>
        <p className="sub">{kind === 'staff' ? 'TSM staff console' : 'Seller portal for approved sellers'}</p>

        <div className="seg" role="tablist" aria-label="Sign in as">
          <button type="button" role="tab" aria-selected={kind === 'staff'} className={kind === 'staff' ? 'active' : ''} onClick={() => choose('staff')}>TSM staff</button>
          <button type="button" role="tab" aria-selected={kind === 'seller'} className={kind === 'seller' ? 'active' : ''} onClick={() => choose('seller')}>Seller</button>
        </div>

        <div className="stack">
          {auth.notice && <Alert tone="warn">{auth.notice}</Alert>}
          <Field label={kind === 'staff' ? 'Staff email' : 'Email or username'}>
            <input className="input" name="identity" autoComplete="username" autoFocus value={identity} onChange={(e) => setIdentity(e.target.value)} required />
          </Field>
          <Field label="Password">
            <input className="input" type="password" name="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </Field>
          {error && <Alert tone="error">{error}</Alert>}
          <Button type="submit" loading={busy}>Sign in</Button>
        </div>

        {import.meta.env.DEV && (
          <div className="demo-box">
            <strong>Development logins</strong>
            <div style={{ marginTop: 6 }}>
              {kind === 'staff' ? (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setIdentity('admin@tsm.test'); setPassword('AdminPass1!'); }}>
                  Fill in <code>admin@tsm.test</code>
                </button>
              ) : (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setIdentity('seller@tsm.test'); setPassword('Password1!'); }}>
                  Fill in <code>seller@tsm.test</code> (Demo Seller)
                </button>
              )}
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
