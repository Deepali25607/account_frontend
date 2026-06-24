import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth";
import { ThemeProvider } from "./theme";
import { ToastProvider, Spinner } from "./ui";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Inventory from "./pages/Inventory";
import Purchases from "./pages/Purchases";
import Sales from "./pages/Sales";
import Parties from "./pages/Parties";
import Payments from "./pages/Payments";
import Reports from "./pages/Reports";
import Accounting from "./pages/Accounting";
import Manufacturing from "./pages/Manufacturing";
import Warehouses from "./pages/Warehouses";
import Team from "./pages/Team";
import Appearance from "./pages/Appearance";
import CompanyProfile from "./pages/CompanyProfile";
import Billing from "./pages/Billing";
import Locked from "./pages/Locked";
import Admin from "./pages/Admin";
import PublicInvoice from "./pages/PublicInvoice";

function Gate({ children }) {
  const { me, loading } = useAuth();
  if (loading) return <div className="grid h-full place-items-center"><Spinner className="h-8 w-8 text-brand-500" /></div>;
  if (!me) return <Navigate to="/login" replace />;
  if (me.platformAdmin) return <Navigate to="/admin" replace />;  // super-admins use the platform console
  return children;
}

function AdminGate({ children }) {
  const { me, loading } = useAuth();
  if (loading) return <div className="grid h-full place-items-center"><Spinner className="h-8 w-8 text-brand-500" /></div>;
  if (!me) return <Navigate to="/login" replace />;
  if (!me.platformAdmin) return <Navigate to="/" replace />;
  return children;
}

function Feature({ name, title, children }) {
  const { can } = useAuth();
  return can(name) ? children : <Locked feature={name} title={title} />;
}

export default function App() {
  return (
    <ThemeProvider>
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/i" element={<PublicInvoice />} />{/* public, no-login shareable invoice */}
            <Route path="/admin" element={<AdminGate><Admin /></AdminGate>} />
            <Route element={<Gate><Layout /></Gate>}>
              <Route index element={<Dashboard />} />
              <Route path="inventory" element={<Feature name="inventory" title="Inventory"><Inventory /></Feature>} />
              <Route path="purchases" element={<Feature name="purchases" title="Purchases"><Purchases /></Feature>} />
              <Route path="sales" element={<Feature name="sales" title="Sales"><Sales /></Feature>} />
              <Route path="parties" element={<Parties />} />
              <Route path="payments" element={<Payments />} />
              <Route path="reports" element={<Feature name="reports" title="Reports"><Reports /></Feature>} />
              <Route path="accounting" element={<Feature name="accounting" title="Accounting & GST"><Accounting /></Feature>} />
              <Route path="manufacturing" element={<Feature name="manufacturing" title="Manufacturing"><Manufacturing /></Feature>} />
              <Route path="warehouses" element={<Feature name="multi_location" title="Warehouses"><Warehouses /></Feature>} />
              <Route path="team" element={<Feature name="multi_user" title="Team & Access"><Team /></Feature>} />
              <Route path="company" element={<CompanyProfile />} />
              <Route path="appearance" element={<Appearance />} />
              <Route path="billing" element={<Billing />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
    </ThemeProvider>
  );
}
