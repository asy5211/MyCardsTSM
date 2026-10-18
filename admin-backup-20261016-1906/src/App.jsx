import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import Shell from './layout/Shell.jsx';
import Login from './pages/Login.jsx';
import ApplicationDetail from './pages/staff/ApplicationDetail.jsx';
import Applications from './pages/staff/Applications.jsx';
import Audit from './pages/staff/Audit.jsx';
import Brands from './pages/staff/Brands.jsx';
import Catalog from './pages/staff/Catalog.jsx';
import StaffDashboard from './pages/staff/Dashboard.jsx';
import Offers from './pages/staff/Offers.jsx';
import Payouts from './pages/staff/Payouts.jsx';
import ProductForm from './pages/staff/ProductForm.jsx';
import SellerDetail from './pages/staff/SellerDetail.jsx';
import Sellers from './pages/staff/Sellers.jsx';
import UserDetail from './pages/staff/UserDetail.jsx';
import Users from './pages/staff/Users.jsx';
import Earnings from './pages/seller/Earnings.jsx';
import ListingForm from './pages/seller/ListingForm.jsx';
import Listings from './pages/seller/Listings.jsx';
import SellerDashboard from './pages/seller/Dashboard.jsx';

function Guard({ kind, children }) {
  const auth = useAuth();
  const location = useLocation();
  const signedIn = kind === 'staff' ? auth.staff : auth.seller;
  if (!signedIn) return <Navigate to={`/login?as=${kind}`} replace state={{ from: location.pathname }} />;
  return children;
}

function Home() {
  const { staff, seller } = useAuth();
  if (staff) return <Navigate to="/staff" replace />;
  if (seller) return <Navigate to="/seller" replace />;
  return <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />

      <Route path="/staff" element={<Guard kind="staff"><Shell kind="staff" /></Guard>}>
        <Route index element={<StaffDashboard />} />
        <Route path="applications" element={<Applications />} />
        <Route path="applications/:id" element={<ApplicationDetail />} />
        <Route path="catalog" element={<Catalog />} />
        <Route path="catalog/new" element={<ProductForm />} />
        <Route path="catalog/:id" element={<ProductForm />} />
        <Route path="brands" element={<Brands />} />
        <Route path="sellers" element={<Sellers />} />
        <Route path="sellers/:id" element={<SellerDetail />} />
        <Route path="offers" element={<Offers />} />
        <Route path="users" element={<Users />} />
        <Route path="users/:id" element={<UserDetail />} />
        <Route path="payouts" element={<Payouts />} />
        <Route path="audit" element={<Audit />} />
      </Route>

      <Route path="/seller" element={<Guard kind="seller"><Shell kind="seller" /></Guard>}>
        <Route index element={<SellerDashboard />} />
        <Route path="listings" element={<Listings />} />
        <Route path="listings/new" element={<ListingForm />} />
        <Route path="listings/:id" element={<ListingForm />} />
        <Route path="earnings" element={<Earnings />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
