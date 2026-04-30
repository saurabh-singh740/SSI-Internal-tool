import { useEffect, useRef } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, FolderKanban, Users, LogOut,
  ChevronRight, Clock, BarChart2, DollarSign, X,
  TrendingUp, Building2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { clsx } from 'clsx';

// ── Role-specific nav config ──────────────────────────────────────────────────

type NavItem = { to: string; label: string; icon: React.ElementType };

const ADMIN_NAV: NavItem[] = [
  { to: '/admin/dashboard', label: 'Dashboard',  icon: LayoutDashboard },
  { to: '/presales',        label: 'Pre-Sales',  icon: TrendingUp },
  { to: '/projects',        label: 'Projects',   icon: FolderKanban },
  { to: '/timesheets',      label: 'Timesheets', icon: Clock },
  { to: '/payments',        label: 'Payments',   icon: DollarSign },
  { to: '/partners',        label: 'Partners',   icon: Building2 },
  { to: '/users',           label: 'Users',      icon: Users },
];

const ENGINEER_NAV: NavItem[] = [
  { to: '/engineer/dashboard', label: 'Dashboard',    icon: LayoutDashboard },
  { to: '/projects',           label: 'My Projects',  icon: FolderKanban },
  { to: '/timesheets',         label: 'Timesheets',   icon: Clock },
  { to: '/work-summary',       label: 'Work Summary', icon: BarChart2 },
];

const CUSTOMER_NAV: NavItem[] = [
  { to: '/projects',         label: 'Projects',        icon: FolderKanban },
  { to: '/payments/history', label: 'Payment History', icon: DollarSign },
];

function getNav(role?: string): NavItem[] {
  if (role === 'ADMIN')    return ADMIN_NAV;
  if (role === 'ENGINEER') return ENGINEER_NAV;
  return CUSTOMER_NAV;
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

interface SidebarProps {
  /** Whether the sidebar is open (controls mobile slide-in/out) */
  open: boolean;
  /** Called when the sidebar should close (mobile backdrop / X button) */
  onClose: () => void;
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  const { user, logout } = useAuth();
  const navigate         = useNavigate();
  const closeButtonRef   = useRef<HTMLButtonElement>(null);

  const handleLogout = () => { logout().then(() => navigate('/login')); };
  const navItems      = getNav(user?.role);

  const roleBadgeColor: Record<string, string> = {
    ADMIN:    'bg-red-500/20 text-red-300',
    ENGINEER: 'bg-blue-500/20 text-blue-300',
    CUSTOMER: 'bg-emerald-500/20 text-emerald-300',
  };

  // Move focus into sidebar when it opens on mobile so keyboard users can navigate
  useEffect(() => {
    if (open) closeButtonRef.current?.focus();
  }, [open]);

  return (
    <aside
      // ── Positioning ────────────────────────────────────────────────────────
      // Always fixed to the left edge, full viewport height.
      // On mobile:  slides in/out via translateX.
      // On desktop (lg+): lg:translate-x-0 pins it in place regardless of `open`.
      //
      // The width is w-64 (256 px).  DashboardLayout adds lg:ml-64 to the main
      // content area so that on desktop the content sits beside (not under) the
      // sidebar, while on mobile the sidebar overlays the content.
      className={clsx(
        'fixed inset-y-0 left-0 z-40 flex flex-col w-64',
        'transition-transform duration-300 ease-in-out',
        // Mobile: driven by `open` prop
        open ? 'translate-x-0' : '-translate-x-full',
        // Desktop: always shown — overrides the mobile class above
        'lg:translate-x-0',
      )}
      style={{
        background:   'rgba(5, 8, 22, 0.92)',
        borderRight:  '1px solid rgba(255,255,255,0.07)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
      }}
      aria-label="Sidebar navigation"
    >
      {/* ── Logo + mobile close button ───────────────────────────────────── */}
      <div
        className="flex items-center justify-between gap-3 px-5 py-5 flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="flex-shrink-0 flex items-center justify-center rounded-lg px-2 py-1"
            style={{ background: '#ffffff', boxShadow: '0 2px 8px rgba(0,0,0,0.3)' }}
          >
            <img
              src="/assets/2.jpg"
              alt="StallionSI"
              className="object-contain"
              style={{ height: '28px', width: 'auto' }}
            />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink-100 leading-tight truncate">STALLION SI - IPM</p>
            <p className="text-xs text-ink-500">Project Management</p>
          </div>
        </div>

        {/* X button — only visible on mobile; hidden on lg+ */}
        <button
          ref={closeButtonRef}
          onClick={onClose}
          aria-label="Close sidebar"
          className="lg:hidden flex-shrink-0 flex items-center justify-center h-8 w-8 rounded-lg
                     text-ink-500 hover:text-ink-200 transition-colors"
          style={{ background: 'rgba(255,255,255,0.05)' }}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* ── Role badge ────────────────────────────────────────────────────── */}
      <div className="px-5 pt-4 pb-2 flex-shrink-0">
        <span
          className={clsx(
            'text-[10px] font-semibold uppercase tracking-widest px-2.5 py-1 rounded-full',
            roleBadgeColor[user?.role ?? ''] ?? 'text-ink-500',
          )}
        >
          {user?.role === 'CUSTOMER' ? 'Executive Ops' : user?.role}
        </span>
      </div>

      {/* ── Navigation ────────────────────────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto px-3 pb-4 space-y-0.5">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            // Close mobile sidebar when the user taps a link
            onClick={onClose}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium',
                'transition-all duration-200',
                isActive
                  ? 'text-brand-300'
                  : 'text-ink-400 hover:text-ink-100',
              )
            }
            style={({ isActive }) =>
              isActive
                ? {
                    background:  'rgba(99,102,241,0.15)',
                    border:      '1px solid rgba(99,102,241,0.25)',
                    boxShadow:   '0 0 16px rgba(99,102,241,0.10)',
                  }
                : {}
            }
          >
            {({ isActive }) => (
              <>
                <Icon className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                <span className="flex-1 truncate">{label}</span>
                {isActive && <ChevronRight className="h-3.5 w-3.5 opacity-50 flex-shrink-0" />}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* ── User footer ────────────────────────────────────────────────────── */}
      <div
        className="p-4 flex-shrink-0"
        style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}
      >
        <div className="flex items-center gap-3 mb-3 px-1">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-full text-white text-xs font-bold flex-shrink-0"
            style={{
              background:
                user?.role === 'ADMIN'
                  ? 'linear-gradient(135deg,#ef4444,#dc2626)'
                  : user?.role === 'ENGINEER'
                  ? 'linear-gradient(135deg,#6366f1,#7c3aed)'
                  : 'linear-gradient(135deg,#10b981,#059669)',
            }}
          >
            {(user?.name ?? user?.email ?? '?').charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink-100 truncate">{user?.name}</p>
            <p className="text-xs text-ink-500 truncate">{user?.email}</p>
          </div>
        </div>

        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm
                     text-ink-400 hover:text-ink-100 transition-all duration-200"
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          <LogOut className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
          Sign out
        </button>
      </div>
    </aside>
  );
}