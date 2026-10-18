import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, publicApi, readSession, sellerApi, setUnauthorizedHandler, staffApi, writeSession } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const navigate = useNavigate();
  const [staff, setStaff] = useState(() => readSession('staff'));
  const [seller, setSeller] = useState(() => readSession('seller'));
  const [notice, setNotice] = useState('');

  const signOut = useCallback((kind, message = '') => {
    writeSession(kind, null);
    if (kind === 'staff') setStaff(null);
    else setSeller(null);
    setNotice(message);
    navigate(`/login?as=${kind}`, { replace: true });
  }, [navigate]);

  // Any 401 from the API (token expired, account suspended) lands here.
  useEffect(() => {
    setUnauthorizedHandler((kind) => signOut(kind, 'Your sign-in ended. Please sign in again.'));
  }, [signOut]);

  const signInStaff = useCallback(async (email, password) => {
    const result = await publicApi.post('/api/staff/login', { email, password });
    const session = { token: result.token, staff: result.staff };
    writeSession('staff', session);
    setStaff(session);
    setNotice('');
  }, []);

  const signInSeller = useCallback(async (login, password) => {
    const result = await publicApi.post('/api/auth/login', { login, password });
    // Being a TSM customer isn't enough: only approved, active sellers may enter the portal.
    writeSession('seller', { token: result.token, user: result.user });
    try {
      const profile = await sellerApi.get('/api/seller/me');
      const session = { token: result.token, user: result.user, profile };
      writeSession('seller', session);
      setSeller(session);
      setNotice('');
    } catch (e) {
      writeSession('seller', null);
      if (e instanceof ApiError && e.code === 'not_a_seller') {
        throw new ApiError(403, 'not_a_seller', 'This account is not an approved seller yet. Apply from the TSM app (Account → Seller Application); once TSM staff approve it you can sign in here.');
      }
      throw e;
    }
  }, []);

  const refreshSeller = useCallback(async () => {
    const profile = await sellerApi.get('/api/seller/me');
    const next = { ...readSession('seller'), profile };
    writeSession('seller', next);
    setSeller(next);
    return profile;
  }, []);

  const value = useMemo(() => ({
    staff,
    seller,
    notice,
    clearNotice: () => setNotice(''),
    signInStaff,
    signInSeller,
    refreshSeller,
    signOut,
    // "support" staff can look at everything but not change it
    canWrite: Boolean(staff && ['super_admin', 'admin'].includes(staff.staff.role)),
  }), [staff, seller, notice, signInStaff, signInSeller, refreshSeller, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
