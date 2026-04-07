import { Suspense, lazy } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import DashboardLayout from './components/layout/DashboardLayout';

// Route-level code splitting — each page is a separate JS chunk downloaded
// only when the user navigates to that route (reduces initial bundle ~70%).
const Login                    = lazy(() => import('./pages/Login'));
const SetupAdmin               = lazy(() => import('./pages/SetupAdmin'));
const Dashboard                = lazy(() => import('./pages/Dashboard'));
const EngineerDashboard        = lazy(() => import('./pages/EngineerDashboard'));
const Projects                 = lazy(() => import('./pages/Projects'));
const CreateProject            = lazy(() => import('./pages/CreateProject'));
const ViewProject              = lazy(() => import('./pages/ViewProject'));
const EditProject              = lazy(() => import('./pages/EditProject'));
const Users                    = lazy(() => import('./pages/Users'));
const Timesheets               = lazy(() => import('./pages/Timesheets'));
const TimesheetDashboard       = lazy(() => import('./pages/TimesheetDashboard'));
const ProjectTimesheetOverview = lazy(() => import('./pages/ProjectTimesheetOverview'));
const WorkSummary              = lazy(() => import('./pages/WorkSummary'));
const PaymentDashboard         = lazy(() => import('./pages/PaymentDashboard'));
const PaymentLog               = lazy(() => import('./pages/PaymentLog'));
const PaymentHistory           = lazy(() => import('./pages/PaymentHistory'));

// Minimal skeleton shown while a lazy chunk loads — prevents blank flash.
function PageSkeleton() {
  return (
    <div className="flex items-center justify-center h-screen" style={{ background: '#050816' }}>
      <div className="flex flex-col items-center gap-3">
        <div
          className="h-10 w-10 rounded-2xl animate-pulse"
          style={{ background: 'linear-gradient(135deg,#6366f1,#7c3aed)' }}
        />
        <div className="h-1.5 w-24 rounded-full animate-pulse" style={{ background: 'rgba(99,102,241,0.3)' }} />
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns the canonical dashboard path for a given role. */
function roleDashboard(role?: string): string {
  if (role === 'ADMIN')    return '/admin/dashboard';
  if (role === 'ENGINEER') return '/engineer/dashboard';
  return '/projects'; // CUSTOMER — no separate dashboard
}

// ── Guards ────────────────────────────────────────────────────────────────────

const ProtectedRoute: React.FC<{
  children:      React.ReactNode;
  adminOnly?:    boolean;
  allowedRoles?: string[];   // optional fine-grained role list
}> = ({ children, adminOnly = false, allowedRoles }) => {
  const { isAuthenticated, loading, user } = useAuth();
  const location = useLocation();

  if (loading) return <div className="flex items-center justify-center h-screen">Loading…</div>;

  // Not logged in → go to login, preserve the intended path so we can return after auth
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  // Role enforcement — redirect to the user's own dashboard, not a hardcoded path
  const role = user?.role;
  if (adminOnly && role !== 'ADMIN') return <Navigate to={roleDashboard(role)} replace />;
  if (allowedRoles && role && !allowedRoles.includes(role)) {
    return <Navigate to={roleDashboard(role)} replace />;
  }

  return <>{children}</>;
};

// Neutral /dashboard → push to the role-specific URL so email links work
function DashboardRedirect() {
  const { user, loading } = useAuth();
  if (loading) return null;
  return <Navigate to={roleDashboard(user?.role)} replace />;
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const { isAuthenticated, loading, user } = useAuth();

  if (loading) return (
    <div className="flex items-center justify-center h-screen text-gray-500">Loading…</div>
  );

  return (
    <Suspense fallback={<PageSkeleton />}>
    <Routes>
      {/* Already authenticated → push to the correct role dashboard */}
      <Route
        path="/login"
        element={
          isAuthenticated
            ? <Navigate to={roleDashboard(user?.role)} replace />
            : <Login />
        }
      />

      {/* First-run setup — public, but redirect to dashboard if already logged in.
          The backend enforces the bootstrap-once guard; the route itself is always
          reachable so the frontend can show the correct "already configured" message. */}
      <Route
        path="/setup"
        element={
          isAuthenticated
            ? <Navigate to={roleDashboard(user?.role)} replace />
            : <SetupAdmin />
        }
      />

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />

        {/* /dashboard — neutral redirector; works as the email link target */}
        <Route path="dashboard" element={<DashboardRedirect />} />

        {/* Role-specific dashboard URLs */}
        <Route
          path="admin/dashboard"
          element={<ProtectedRoute allowedRoles={['ADMIN']}><Dashboard /></ProtectedRoute>}
        />
        <Route
          path="engineer/dashboard"
          element={<ProtectedRoute allowedRoles={['ENGINEER']}><EngineerDashboard /></ProtectedRoute>}
        />

        {/* Projects */}
        <Route path="projects" element={<Projects />} />
        <Route path="projects/create" element={<ProtectedRoute adminOnly><CreateProject /></ProtectedRoute>} />
        <Route path="projects/:id" element={<ViewProject />} />
        <Route path="projects/:id/edit" element={<ProtectedRoute adminOnly><EditProject /></ProtectedRoute>} />

        {/* Users — admin only */}
        <Route path="users" element={<ProtectedRoute adminOnly><Users /></ProtectedRoute>} />

        {/* Timesheets */}
        <Route path="timesheets" element={<Timesheets />} />
        <Route path="timesheet/:projectId/:engineerId" element={<TimesheetDashboard />} />
        <Route path="timesheet/:projectId" element={<ProtectedRoute adminOnly><ProjectTimesheetOverview /></ProtectedRoute>} />

        {/* Engineer-specific */}
        <Route path="work-summary" element={<WorkSummary />} />

        {/* Payments — admin dashboard + log; customer history */}
        <Route
          path="payments"
          element={
            <ProtectedRoute adminOnly>
              <PaymentDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="payments/log"
          element={
            <ProtectedRoute adminOnly>
              <PaymentLog />
            </ProtectedRoute>
          }
        />
        <Route
          path="payments/history"
          element={
            <ProtectedRoute>
              <PaymentHistory />
            </ProtectedRoute>
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
    </Suspense>
  );
}