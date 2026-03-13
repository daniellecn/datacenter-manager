import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Navigate, Outlet, Route, Routes, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import { useMe } from "@/api/auth";
import { AppLayout } from "@/components/layout/AppLayout";
import { Spinner } from "@/components/common/Spinner";

// Lazy-load all pages
const Login = lazy(() => import("@/pages/Login"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const DataCenters = lazy(() => import("@/pages/DataCenters"));
const Rooms = lazy(() => import("@/pages/Rooms"));
const Corridors = lazy(() => import("@/pages/Corridors"));
const Racks = lazy(() => import("@/pages/Racks"));
const Devices = lazy(() => import("@/pages/Devices"));
const DeviceDetail = lazy(() => import("@/pages/DeviceDetail"));
const Licenses = lazy(() => import("@/pages/Licenses"));
const NetworkConnections = lazy(() => import("@/pages/NetworkConnections"));
const VLANs = lazy(() => import("@/pages/VLANs"));
const IPSpace = lazy(() => import("@/pages/IPSpace"));
const SANFabrics = lazy(() => import("@/pages/SANFabrics"));
const Virtual = lazy(() => import("@/pages/Virtual"));
const Integrations = lazy(() => import("@/pages/Integrations"));
const IntegrationDetail = lazy(() => import("@/pages/IntegrationDetail"));
const Alerts = lazy(() => import("@/pages/Alerts"));
const AuditLog = lazy(() => import("@/pages/AuditLog"));
const UserManagement = lazy(() => import("@/pages/UserManagement"));
const Settings = lazy(() => import("@/pages/Settings"));
const ChangePassword = lazy(() => import("@/pages/ChangePassword"));
const Topology = lazy(() => import("@/pages/Topology"));
const TreeView = lazy(() => import("@/pages/TreeView"));

function PageLoader() {
  return (
    <div className="flex h-full items-center justify-center">
      <Spinner size="lg" />
    </div>
  );
}

// Fetches /me and syncs user into store; redirects to /login on 401
function AuthSync() {
  const { accessToken, setUser } = useAuthStore();
  const navigate = useNavigate();
  const { data, isError } = useMe();

  useEffect(() => {
    if (data) setUser(data);
  }, [data, setUser]);

  useEffect(() => {
    if (isError && !accessToken) navigate("/login", { replace: true });
  }, [isError, accessToken, navigate]);

  return null;
}

// Guard: redirects to /login if no access token is in the store
function ProtectedRoute() {
  const accessToken = useAuthStore((s) => s.accessToken);
  if (!accessToken) return <Navigate to="/login" replace />;
  return (
    <>
      <AuthSync />
      <Outlet />
    </>
  );
}

// Guard: redirects to /dashboard if already authenticated
function GuestRoute() {
  const accessToken = useAuthStore((s) => s.accessToken);
  if (accessToken) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* Public */}
          <Route element={<GuestRoute />}>
            <Route path="/login" element={<Login />} />
          </Route>

          {/* Change password — accessible even when must_change_password is true */}
          <Route path="/change-password" element={<ChangePassword />} />

          {/* Protected app shell */}
          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />

              {/* Physical */}
              <Route path="/datacenters" element={<DataCenters />} />
              <Route path="/rooms" element={<Rooms />} />
              <Route path="/corridors" element={<Corridors />} />
              <Route path="/racks" element={<Racks />} />
              <Route path="/devices" element={<Devices />} />
              <Route path="/devices/:id" element={<DeviceDetail />} />
              <Route path="/licenses" element={<Licenses />} />

              {/* Network */}
              <Route path="/network-connections" element={<NetworkConnections />} />
              <Route path="/vlans" element={<VLANs />} />
              <Route path="/ip-space" element={<IPSpace />} />
              <Route path="/san-fabrics" element={<SANFabrics />} />

              {/* Virtual */}
              <Route path="/virtual" element={<Virtual />} />

              {/* Topology */}
              <Route path="/topology" element={<Topology />} />
              <Route path="/tree" element={<TreeView />} />

              {/* Management */}
              <Route path="/integrations" element={<Integrations />} />
              <Route path="/integrations/:id" element={<IntegrationDetail />} />
              <Route path="/alerts" element={<Alerts />} />
              <Route path="/audit" element={<AuditLog />} />
              <Route path="/users" element={<UserManagement />} />
              <Route path="/settings" element={<Settings />} />
            </Route>
          </Route>

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
