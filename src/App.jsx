import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { App as CapApp } from "@capacitor/app";
import { AuthProvider, useAuth } from "./auth";
import { BASENAME } from "./config";
import { ROUTES } from "./routes";
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
import Expenses from "./pages/Expenses";
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

// Wire the Android hardware/gesture back button to SPA history: go back when
// there's somewhere to go, otherwise exit the app. No-op on the web.
function NativeBackButton() {
  const navigate = useNavigate();
  useEffect(() => {
    if (!window.Capacitor?.isNativePlatform?.()) return;
    let handle;
    CapApp.addListener("backButton", ({ canGoBack }) => {
      if (canGoBack && window.history.length > 1) navigate(-1);
      else CapApp.exitApp();
    }).then((h) => { handle = h; });
    return () => { handle?.remove(); };
  }, [navigate]);
  return null;
}

function Gate({ children }) {
  const { me, loading } = useAuth();
  if (loading) return <div className="grid h-full place-items-center"><Spinner className="h-8 w-8 text-brand-500" /></div>;
  if (!me) return <Navigate to={ROUTES.login} replace />;
  if (me.platformAdmin) return <Navigate to={ROUTES.admin} replace />;  // super-admins use the platform console
  return children;
}

function AdminGate({ children }) {
  const { me, loading } = useAuth();
  if (loading) return <div className="grid h-full place-items-center"><Spinner className="h-8 w-8 text-brand-500" /></div>;
  if (!me) return <Navigate to={ROUTES.login} replace />;
  if (!me.platformAdmin) return <Navigate to={ROUTES.home} replace />;
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
          <BrowserRouter basename={BASENAME}>
            <NativeBackButton />
            <Routes>
            <Route path={ROUTES.login} element={<Login />} />
            <Route path={ROUTES.publicInvoice} element={<PublicInvoice />} />{/* public, no-login shareable invoice */}
            <Route path={ROUTES.admin} element={<AdminGate><Admin /></AdminGate>} />
            <Route element={<Gate><Layout /></Gate>}>
              <Route index element={<Dashboard />} />
              <Route path={ROUTES.inventory} element={<Feature name="inventory" title="Inventory"><Inventory /></Feature>} />
              <Route path={ROUTES.purchases} element={<Feature name="purchases" title="Purchases"><Purchases /></Feature>} />
              <Route path={ROUTES.sales} element={<Feature name="sales" title="Sales"><Sales /></Feature>} />
              <Route path={ROUTES.parties} element={<Parties />} />
              <Route path={ROUTES.payments} element={<Payments />} />
              <Route path={ROUTES.expenses} element={<Expenses />} />
              <Route path={ROUTES.reports} element={<Feature name="reports" title="Reports"><Reports /></Feature>} />
              <Route path={ROUTES.accounting} element={<Feature name="accounting" title="Accounting & GST"><Accounting /></Feature>} />
              <Route path={ROUTES.manufacturing} element={<Feature name="manufacturing" title="Manufacturing"><Manufacturing /></Feature>} />
              <Route path={ROUTES.warehouses} element={<Feature name="multi_location" title="Warehouses"><Warehouses /></Feature>} />
              <Route path={ROUTES.team} element={<Feature name="multi_user" title="Team & Access"><Team /></Feature>} />
              <Route path={ROUTES.company} element={<CompanyProfile />} />
              <Route path={ROUTES.appearance} element={<Appearance />} />
              <Route path={ROUTES.billing} element={<Billing />} />
            </Route>
            <Route path="*" element={<Navigate to={ROUTES.home} replace />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
    </ThemeProvider>
  );
}
