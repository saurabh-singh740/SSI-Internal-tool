import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Bell, Search, CheckCheck, Menu, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Sidebar from './Sidebar';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/axios';

// ── Notification bell dropdown ────────────────────────────────────────────────

interface Notification {
  _id: string;
  message: string;
  type: string;
  read: boolean;
  createdAt: string;
  project?: { name: string; code: string };
}

function NotificationBell() {
  const queryClient                = useQueryClient();
  const [open, setOpen]            = useState(false);
  const ref                        = useRef<HTMLDivElement>(null);

  // Unread count — polls every 60 s, deduped across all component instances
  const { data: countData } = useQuery({
    queryKey: ['notifications-unread-count'],
    queryFn: () => api.get('/notifications/unread-count').then((r) => r.data.count ?? 0),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const count = countData ?? 0;

  // Notification list — fetched on demand when panel opens
  const { data: notifsData, isFetching: loading } = useQuery({
    queryKey: ['notifications-list'],
    queryFn: () => api.get('/notifications?limit=15').then((r) => r.data.notifications || []),
    enabled: open,
    staleTime: 30_000,
  });
  const notifications: Notification[] = notifsData ?? [];

  const openPanel = () => setOpen(true);

  const markAllRead = async () => {
    await api.patch('/notifications/read-all').catch(() => {});
    queryClient.setQueryData(['notifications-list'], (prev: Notification[] = []) =>
      prev.map((n) => ({ ...n, read: true }))
    );
    queryClient.setQueryData(['notifications-unread-count'], 0);
  };

  const markOneRead = async (id: string) => {
    await api.patch(`/notifications/${id}/read`).catch(() => {});
    queryClient.setQueryData(['notifications-list'], (prev: Notification[] = []) =>
      prev.map((n) => (n._id === id ? { ...n, read: true } : n))
    );
    queryClient.setQueryData(['notifications-unread-count'], (c: number = 0) => Math.max(0, c - 1));
  };

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        className="btn-icon relative"
        title="Notifications"
        aria-label="Open notifications"
        onClick={() => setOpen((v) => !v)}
      >
        <Bell className="h-4 w-4" />
        {count > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full text-white text-[9px] font-bold flex items-center justify-center leading-none"
            style={{
              background: 'linear-gradient(135deg,#6366f1,#4f46e5)',
              boxShadow: '0 0 8px rgba(99,102,241,0.6)',
            }}
          >
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-10 w-80 rounded-2xl z-50 overflow-hidden backdrop-blur-xl"
          style={{
            background: 'rgba(10, 10, 25, 0.85)',
            border: '1px solid rgba(255,255,255,0.10)',
            boxShadow: '0 20px 60px rgba(0,0,0,0.6), 0 0 30px rgba(99,102,241,0.08)',
          }}
        >
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
          >
            <h3 className="text-sm font-medium text-ink-100">Notifications</h3>
            {count > 0 && (
              <button
                onClick={markAllRead}
                className="flex items-center gap-1 text-xs text-brand-400 hover:text-brand-300 font-medium transition-colors"
              >
                <CheckCheck className="h-3.5 w-3.5" /> Mark all read
              </button>
            )}
          </div>

          <div className="max-h-72 overflow-y-auto">
            {loading ? (
              <div className="p-4 space-y-2">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="skeleton h-8 w-full" />
                ))}
              </div>
            ) : notifications.length === 0 ? (
              <div className="p-6 text-center text-sm text-ink-400">No notifications</div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n._id}
                  onClick={() => !n.read && markOneRead(n._id)}
                  className="px-4 py-3 cursor-pointer transition-all duration-150"
                  style={{
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    background: !n.read ? 'rgba(99,102,241,0.05)' : 'transparent',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = !n.read
                      ? 'rgba(99,102,241,0.05)'
                      : 'transparent')
                  }
                >
                  <div className="flex items-start gap-2">
                    {!n.read && (
                      <span
                        className="h-1.5 w-1.5 rounded-full bg-brand-400 flex-shrink-0 mt-1.5"
                        style={{ boxShadow: '0 0 6px rgba(99,102,241,0.8)' }}
                      />
                    )}
                    <div className={!n.read ? '' : 'ml-3.5'}>
                      <p className="text-xs text-ink-200 leading-snug">{n.message}</p>
                      <p className="text-xs text-ink-500 mt-0.5">
                        {new Date(n.createdAt).toLocaleDateString('en-US', {
                          month: 'short', day: 'numeric',
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Global search ─────────────────────────────────────────────────────────────

function GlobalSearch() {
  const navigate = useNavigate();
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Cmd/Ctrl+K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = value.trim();
    if (!q) return;
    navigate(`/projects?search=${encodeURIComponent(q)}`);
    setValue('');
    inputRef.current?.blur();
  };

  return (
    <form onSubmit={handleSubmit} className="relative w-full max-w-xs">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-500 pointer-events-none" />
      <input
        id="global-search"
        name="search"
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-full pl-9 pr-14 py-2 text-sm text-ink-100 rounded-xl
                   placeholder:text-ink-500 focus:outline-none transition-all duration-200"
        style={{
          background:  'rgba(255,255,255,0.05)',
          border:      '1px solid rgba(255,255,255,0.09)',
          backdropFilter: 'blur(8px)',
        }}
        onFocus={(e) => {
          e.currentTarget.style.background   = 'rgba(255,255,255,0.08)';
          e.currentTarget.style.borderColor  = 'rgba(99,102,241,0.45)';
          e.currentTarget.style.boxShadow    = '0 0 0 3px rgba(99,102,241,0.12)';
        }}
        onBlur={(e) => {
          e.currentTarget.style.background  = 'rgba(255,255,255,0.05)';
          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.09)';
          e.currentTarget.style.boxShadow   = 'none';
        }}
        placeholder="Search projects… (⌘K)"
        aria-label="Search projects"
      />
      <kbd
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-ink-500 rounded px-1.5 py-0.5 font-mono hidden sm:block pointer-events-none"
        style={{ border: '1px solid rgba(255,255,255,0.08)' }}
      >
        ↵
      </kbd>
    </form>
  );
}

// ── Topbar ────────────────────────────────────────────────────────────────────

interface TopbarProps {
  /** Called when the hamburger button is pressed */
  onMenuToggle: () => void;
  /** Current open state — used to toggle between Menu/X icon */
  sidebarOpen: boolean;
}

function Topbar({ onMenuToggle, sidebarOpen }: TopbarProps) {
  const { user } = useAuth();

  return (
    <header
      className="h-14 px-4 flex items-center gap-3 flex-shrink-0 sticky top-0 z-30 backdrop-blur-xl"
      style={{
        background:   'rgba(5, 8, 22, 0.72)',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
      }}
    >
      {/* ── Hamburger (mobile only — hidden on lg+) ──────────────────────── */}
      <button
        onClick={onMenuToggle}
        aria-label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
        aria-expanded={sidebarOpen}
        aria-controls="sidebar"
        className="lg:hidden flex-shrink-0 flex items-center justify-center h-9 w-9 rounded-xl
                   text-ink-400 hover:text-ink-100 transition-colors"
        style={{ background: 'rgba(255,255,255,0.05)' }}
      >
        {sidebarOpen
          ? <X    className="h-4 w-4" />
          : <Menu className="h-4 w-4" />}
      </button>

      {/* ── Search ───────────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0">
        <GlobalSearch />
      </div>

      {/* ── Right actions ────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <NotificationBell />

        <div
          className="flex items-center gap-2.5 pl-3 ml-1"
          style={{ borderLeft: '1px solid rgba(255,255,255,0.08)' }}
        >
          <div
            className="h-8 w-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
            style={{
              background: 'linear-gradient(135deg, #6366f1, #7c3aed)',
              boxShadow:  '0 0 12px rgba(99,102,241,0.45)',
            }}
          >
            {(user?.name ?? user?.email ?? '?').charAt(0).toUpperCase()}
          </div>
          <div className="hidden sm:block leading-tight">
            <p className="text-sm font-medium text-ink-100">{user?.name}</p>
            <p className="text-xs text-ink-500">{user?.role === 'CUSTOMER' ? 'Executive Ops' : user?.role}</p>
          </div>
        </div>
      </div>
    </header>
  );
}

// ── Gradient background orbs ──────────────────────────────────────────────────

function GradientBackground() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
      <div className="absolute inset-0" style={{ background: '#050816' }} />
      <div
        className="absolute -top-32 -left-32 w-[700px] h-[600px] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(109,40,217,0.22) 0%, transparent 70%)',
          filter: 'blur(72px)',
        }}
      />
      <div
        className="absolute -bottom-40 right-0 w-[650px] h-[550px] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(79,70,229,0.18) 0%, transparent 70%)',
          filter: 'blur(72px)',
        }}
      />
      <div
        className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[350px] rounded-full"
        style={{
          background: 'radial-gradient(ellipse, rgba(124,58,237,0.08) 0%, transparent 65%)',
          filter: 'blur(90px)',
        }}
      />
    </div>
  );
}

// ── Layout ────────────────────────────────────────────────────────────────────

export default function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location                      = useLocation();

  // ── Auto-close on route change (tapping a nav link on mobile) ────────────
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  // ── Close on ESC ─────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSidebarOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // ── Lock body scroll while mobile sidebar is open ────────────────────────
  // Prevents the page from scrolling underneath the overlay.
  useEffect(() => {
    document.body.style.overflow = sidebarOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [sidebarOpen]);

  return (
    <div className="relative flex h-screen overflow-hidden">
      <GradientBackground />

      {/* ── Mobile backdrop ────────────────────────────────────────────────
          Sits between the sidebar (z-40) and the content (z-0).
          Clicking it closes the sidebar.
          Hidden on desktop (lg:hidden). */}
      <div
        className={`
          fixed inset-0 z-30 lg:hidden
          bg-black/60 backdrop-blur-sm
          transition-opacity duration-300
          ${sidebarOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}
        `}
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />

      {/* ── Sidebar ────────────────────────────────────────────────────────
          Width: w-64 (256 px).
          Mobile:  translates in/out based on `sidebarOpen`.
          Desktop: always visible via lg:translate-x-0 in Sidebar.tsx.       */}
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* ── Main content area ──────────────────────────────────────────────
          Desktop (lg+): lg:ml-64 pushes content right so it sits BESIDE the
          sidebar (sidebar is fixed, not in flow).
          Mobile: no margin — sidebar overlays rather than pushing content.
          transition-[margin] animates the shift when toggling on tablets.   */}
      <div className="flex flex-col flex-1 min-h-screen overflow-hidden lg:ml-64">
        <Topbar
          onMenuToggle={() => setSidebarOpen((prev) => !prev)}
          sidebarOpen={sidebarOpen}
        />
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}