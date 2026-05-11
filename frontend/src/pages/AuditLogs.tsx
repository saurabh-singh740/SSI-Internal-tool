/**
 * AuditLogs — Premium Enterprise Audit Console
 *
 * Design language: information-dense, side-drawer detail, date-grouped rows,
 * collapsible analytics strip, sticky filter toolbar.
 * Inspired by Linear, Vercel, Datadog, Stripe dashboard patterns.
 */
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Shield, Search, RefreshCw, X, AlertCircle, AlertTriangle,
  Activity, User, Hash, Globe, Monitor, Download, Filter,
  ChevronDown, ChevronUp, Zap, Terminal, ArrowRight,
  XCircle, BarChart2, LogIn,
} from 'lucide-react';
import api from '../api/axios';
import Header from '../components/layout/Header';
import { clsx } from 'clsx';

// ── Types ─────────────────────────────────────────────────────────────────────

interface AuditLog {
  _id: string;
  action: string;
  module: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  actorId?: string;
  actorName?: string;
  actorEmail: string;
  actorRole: string;
  entityId?: string;
  entityLabel?: string;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

interface AuditStats {
  total: number;
  critical: number;
  high: number;
  failed: number;
  byModule: { _id: string; count: number }[];
  bySeverity: { _id: string; count: number }[];
  recentByDay: { _id: string; count: number }[];
  topActors: { _id: string; name?: string; count: number }[];
  window: string;
}

// ── Visual config ─────────────────────────────────────────────────────────────

const SEV = {
  LOW:      { dot: '#6b7280', label: 'Low',  rowBorder: 'transparent',             bg: 'transparent' },
  MEDIUM:   { dot: '#3b82f6', label: 'Med',  rowBorder: 'rgba(59,130,246,0.4)',    bg: 'rgba(59,130,246,0.03)' },
  HIGH:     { dot: '#f59e0b', label: 'High', rowBorder: 'rgba(245,158,11,0.6)',    bg: 'rgba(245,158,11,0.03)' },
  CRITICAL: { dot: '#ef4444', label: 'Crit', rowBorder: 'rgba(239,68,68,0.7)',     bg: 'rgba(239,68,68,0.04)' },
} as const;

const MOD_COLOR: Record<string, { bg: string; text: string; border: string }> = {
  AUTH:       { bg: 'rgba(139,92,246,0.12)', text: '#c4b5fd', border: 'rgba(139,92,246,0.2)' },
  USERS:      { bg: 'rgba(59,130,246,0.12)', text: '#93c5fd', border: 'rgba(59,130,246,0.2)' },
  PROJECTS:   { bg: 'rgba(16,185,129,0.12)', text: '#6ee7b7', border: 'rgba(16,185,129,0.2)' },
  DEALS:      { bg: 'rgba(6,182,212,0.12)',  text: '#67e8f9', border: 'rgba(6,182,212,0.2)' },
  TIMESHEETS: { bg: 'rgba(249,115,22,0.12)', text: '#fdba74', border: 'rgba(249,115,22,0.2)' },
  PAYMENTS:   { bg: 'rgba(234,179,8,0.12)',  text: '#fde047', border: 'rgba(234,179,8,0.2)' },
  PARTNERS:   { bg: 'rgba(236,72,153,0.12)', text: '#f9a8d4', border: 'rgba(236,72,153,0.2)' },
  SYSTEM:     { bg: 'rgba(107,114,128,0.12)',text: '#d1d5db', border: 'rgba(107,114,128,0.2)' },
};

const MOD_BAR: Record<string, string> = {
  AUTH: '#a78bfa', USERS: '#60a5fa', PROJECTS: '#34d399',
  DEALS: '#22d3ee', TIMESHEETS: '#fb923c', PAYMENTS: '#fbbf24',
  PARTNERS: '#f472b6', SYSTEM: '#9ca3af',
};

const MODULES    = ['AUTH','USERS','PROJECTS','DEALS','TIMESHEETS','PAYMENTS','PARTNERS','SYSTEM'];
const SEVERITIES = ['LOW','MEDIUM','HIGH','CRITICAL'];

// ── Action descriptions ───────────────────────────────────────────────────────

type DescFn = (l: AuditLog) => string;
const DESC: Record<string, DescFn> = {
  AUTH_LOGIN:                 l => `${a(l)} signed in`,
  AUTH_LOGOUT:                l => `${a(l)} signed out`,
  AUTH_LOGIN_FAILED:          l => `Failed login for ${l.actorEmail}${l.metadata?.reason ? ` — ${l.metadata.reason}` : ''}`,
  AUTH_ADMIN_REGISTERED:      l => `${a(l)} created admin account`,
  USER_CREATED:               l => `${a(l)} created ${l.entityLabel ?? 'user'}`,
  USER_UPDATED:               l => `${a(l)} updated ${l.entityLabel ?? 'user'}`,
  USER_DELETED:               l => `${a(l)} deleted ${l.entityLabel ?? 'user'}`,
  USER_ROLE_CHANGED:          l => `${a(l)} changed ${l.entityLabel ?? 'user'} role: ${l.oldValues?.role ?? '?'} → ${l.newValues?.role ?? '?'}`,
  PROJECT_CREATED:            l => `${a(l)} created project "${l.entityLabel ?? ''}"`,
  PROJECT_UPDATED:            l => `${a(l)} updated project "${l.entityLabel ?? ''}"`,
  PROJECT_DELETED:            l => `${a(l)} deleted project "${l.entityLabel ?? ''}"`,
  ENGINEER_ADDED:             l => `${a(l)} added engineer to "${l.entityLabel ?? ''}"`,
  ENGINEER_REMOVED:           l => `${a(l)} removed engineer from "${l.entityLabel ?? ''}"`,
  DEAL_CREATED:               l => `${a(l)} created deal "${l.entityLabel ?? ''}"`,
  DEAL_UPDATED:               l => `${a(l)} updated deal "${l.entityLabel ?? ''}"`,
  DEAL_STAGE_CHANGED:         l => `${a(l)} moved "${l.entityLabel ?? ''}" → ${l.newValues?.stage ?? '?'}`,
  DEAL_SOW_UPDATED:           l => `${a(l)} updated SOW for "${l.entityLabel ?? ''}"`,
  DEAL_RESOURCE_PLAN_UPDATED: l => `${a(l)} saved resource plan for "${l.entityLabel ?? ''}"`,
  DEAL_CONVERTED:             l => `${a(l)} converted "${l.entityLabel ?? ''}" to project`,
  DEAL_DELETED:               l => `${a(l)} deleted deal "${l.entityLabel ?? ''}"`,
  ATTACHMENT_UPLOADED:        l => `${a(l)} uploaded ${l.newValues?.fileName ?? 'file'} to "${l.entityLabel ?? ''}"`,
  ATTACHMENT_DELETED:         l => `${a(l)} deleted attachment ${l.entityLabel ?? ''}`,
  PAYMENT_CREATED:            l => `${a(l)} recorded payment for "${l.entityLabel ?? ''}"`,
  PAYMENT_UPDATED:            l => `${a(l)} updated payment for "${l.entityLabel ?? ''}"`,
  PAYMENT_DELETED:            l => `${a(l)} deleted payment from "${l.entityLabel ?? ''}"`,
  TIMESHEET_ENTRY_UPDATED:    l => `${a(l)} updated timesheet entry`,
  TIMESHEET_MONTH_LOCKED:     l => `${a(l)} locked timesheet month`,
  TIMESHEET_MONTH_UNLOCKED:   l => `${a(l)} unlocked timesheet month`,
  PARTNER_CREATED:            l => `${a(l)} created partner "${l.entityLabel ?? ''}"`,
  PARTNER_UPDATED:            l => `${a(l)} updated partner "${l.entityLabel ?? ''}"`,
  PARTNER_DELETED:            l => `${a(l)} deleted partner "${l.entityLabel ?? ''}"`,
};

function a(l: AuditLog): string { return l.actorName || l.actorEmail || 'System'; }

function getDesc(log: AuditLog): string {
  const fn = DESC[log.action] ?? DESC[log.action.toUpperCase().replace(/\./g, '_')];
  return fn ? fn(log) : log.action.replace(/_/g, ' ').toLowerCase().replace(/^./, c => c.toUpperCase());
}

function normAction(action: string): string {
  return action.toUpperCase().replace(/\./g, '_');
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTime(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(iso));
}

function fmtFull(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(new Date(iso));
}

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60)  return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function groupDate(iso: string): string {
  const d = new Date(iso);
  const t = new Date();
  if (d.toDateString() === t.toDateString()) return 'Today';
  const y = new Date(t); y.setDate(y.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }).format(d);
}

function parseBrowser(ua?: string): string {
  if (!ua) return '—';
  if (/Edg\//.test(ua))                          return 'Edge';
  if (/Chrome\//.test(ua) && !/Chromium/.test(ua)) return 'Chrome';
  if (/Firefox\//.test(ua))                       return 'Firefox';
  if (/Safari\//.test(ua))                        return 'Safari';
  return ua.slice(0, 32) + '…';
}

function parseOS(ua?: string): string {
  if (!ua) return '';
  if (/Windows NT 10/.test(ua)) return 'Windows';
  if (/Mac OS X/.test(ua))      return 'macOS';
  if (/Linux/.test(ua))         return 'Linux';
  if (/Android/.test(ua))       return 'Android';
  if (/iPhone|iPad/.test(ua))   return 'iOS';
  return '';
}

function displayIp(ip?: string): string {
  if (!ip) return '—';
  return ip === '::1' || ip === '127.0.0.1' ? 'localhost' : ip;
}

function humanField(k: string): string {
  return k.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase()).trim();
}

function renderVal(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'boolean')        return v ? 'Yes' : 'No';
  if (typeof v === 'object')         return JSON.stringify(v);
  return String(v);
}

function initials(name?: string, email?: string): string {
  const src = name || email || '?';
  return src.charAt(0).toUpperCase();
}

function groupLogs(logs: AuditLog[]): { date: string; items: AuditLog[] }[] {
  const map = new Map<string, AuditLog[]>();
  for (const log of logs) {
    const d = groupDate(log.createdAt);
    if (!map.has(d)) map.set(d, []);
    map.get(d)!.push(log);
  }
  return Array.from(map.entries()).map(([date, items]) => ({ date, items }));
}

// ── Analytics Strip ───────────────────────────────────────────────────────────

function StatPill({
  icon: Icon, value, label, color, sub, onClick, active,
}: {
  icon: React.ElementType; value: string | number; label: string;
  color: string; sub?: string; onClick?: () => void; active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all min-w-0',
        onClick ? 'cursor-pointer hover:brightness-110' : 'cursor-default',
        active  ? 'ring-1' : '',
      )}
      style={{
        background:  active ? `${color}22` : 'rgba(255,255,255,0.04)',
        border:      `1px solid ${active ? color + '55' : 'rgba(255,255,255,0.07)'}`,
        ringColor:   color,
      }}
    >
      <Icon className="h-3.5 w-3.5 flex-shrink-0" style={{ color }} />
      <span className="text-sm font-bold text-white leading-none">{value}</span>
      <div className="min-w-0">
        <span className="text-[10px] text-gray-500 whitespace-nowrap">{label}</span>
        {sub && <span className="text-[9px] text-gray-700 block truncate max-w-[80px]">{sub}</span>}
      </div>
    </button>
  );
}

function MiniSparkline({ days }: { days: { _id: string; count: number }[] }) {
  if (!days.length) return (
    <div className="flex items-center h-8">
      <span className="text-[10px] text-gray-700">No activity data</span>
    </div>
  );
  const max = Math.max(...days.map(d => d.count), 1);
  const W = 4, GAP = 1.5, H = 28;
  return (
    <div className="flex items-end gap-0">
      <svg width={days.length * (W + GAP)} height={H} className="overflow-visible">
        {days.map((d, i) => {
          const h = Math.max(2, Math.round((d.count / max) * H));
          const intensity = d.count / max;
          return (
            <rect key={d._id} x={i * (W + GAP)} y={H - h} width={W} height={h} rx={1}
                  fill={`rgba(99,102,241,${0.3 + intensity * 0.6})`}>
              <title>{d._id}: {d.count}</title>
            </rect>
          );
        })}
      </svg>
    </div>
  );
}

function AnalyticsSection({
  stats, statsLoading, filters, onFilterClick,
}: {
  stats: AuditStats | null;
  statsLoading: boolean;
  filters: { module: string; severity: string };
  onFilterClick: (type: 'module' | 'severity', val: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  const topModule = stats?.byModule?.[0];
  const topActor  = stats?.topActors?.[0];

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}
    >
      {/* Header row */}
      <div
        className="flex items-center justify-between px-4 py-2.5"
        style={{ borderBottom: collapsed ? 'none' : '1px solid rgba(255,255,255,0.06)' }}
      >
        <div className="flex items-center gap-2">
          <BarChart2 className="h-3.5 w-3.5 text-indigo-400" />
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Analytics</span>
          <span className="text-[10px] text-gray-700">last 30 days</span>
        </div>
        <button
          onClick={() => setCollapsed(v => !v)}
          className="text-[10px] text-gray-600 hover:text-gray-400 flex items-center gap-1 transition-colors"
        >
          {collapsed ? <><ChevronDown className="h-3 w-3" /> Show</> : <><ChevronUp className="h-3 w-3" /> Hide</>}
        </button>
      </div>

      {!collapsed && (
        <div className="px-4 py-3 space-y-3">
          {/* Stat pills row */}
          {statsLoading ? (
            <div className="flex flex-wrap gap-2">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-8 w-28 rounded-lg animate-pulse" style={{ background: 'rgba(255,255,255,0.06)' }} />
              ))}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <StatPill icon={Zap}           value={stats?.total    ?? 0} label="events"        color="#6366f1" />
              <StatPill icon={AlertCircle}   value={stats?.critical ?? 0} label="critical"      color="#ef4444"
                onClick={() => onFilterClick('severity', 'CRITICAL')}
                active={filters.severity === 'CRITICAL'} />
              <StatPill icon={AlertTriangle} value={stats?.high     ?? 0} label="high"          color="#f59e0b"
                onClick={() => onFilterClick('severity', 'HIGH')}
                active={filters.severity === 'HIGH'} />
              <StatPill icon={XCircle}       value={stats?.failed   ?? 0} label="failed logins" color="#f43f5e" />
              {topModule && (
                <StatPill icon={Activity}    value={topModule.count}       label="top module" sub={topModule._id} color="#10b981"
                  onClick={() => onFilterClick('module', topModule._id)}
                  active={filters.module === topModule._id} />
              )}
              {topActor && (
                <StatPill icon={User}        value={topActor.count}        label="most active"  sub={topActor.name || topActor._id} color="#8b5cf6" />
              )}
            </div>
          )}

          {/* Inline sparkline */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[9px] text-gray-700 uppercase tracking-widest">Daily activity</span>
              <span className="text-[9px] text-gray-700">
                {stats?.recentByDay.reduce((s, d) => s + d.count, 0) ?? 0} total
              </span>
            </div>
            <MiniSparkline days={stats?.recentByDay ?? []} />
          </div>

          {/* Module distribution (compact horizontal bars) */}
          {stats?.byModule && stats.byModule.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-1.5">
              {stats.byModule.slice(0, 8).map(({ _id, count }) => {
                const pct   = stats.total > 0 ? (count / stats.total) * 100 : 0;
                const color = MOD_BAR[_id] ?? '#9ca3af';
                return (
                  <button
                    key={_id}
                    onClick={() => onFilterClick('module', _id)}
                    className="flex items-center gap-2 group"
                  >
                    <span className="text-[10px] text-gray-500 w-14 flex-shrink-0 text-left truncate group-hover:text-gray-300 transition-colors">{_id}</span>
                    <div className="flex-1 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.07)' }}>
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                    </div>
                    <span className="text-[9px] text-gray-600 w-5 text-right">{count}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Sticky Toolbar ────────────────────────────────────────────────────────────

function Toolbar({
  filters, drafts, logCount, loading,
  onDraftChange, onApply, onClear, onRefresh,
}: {
  filters: { search: string; module: string; severity: string; from: string; to: string };
  drafts:  { search: string; module: string; severity: string; from: string; to: string };
  logCount: number; loading: boolean;
  onDraftChange: (k: string, v: string) => void;
  onApply:   () => void;
  onClear:   () => void;
  onRefresh: () => void;
}) {
  const hasActive = !!(filters.search || filters.module || filters.severity || filters.from || filters.to);
  const hasDraft  = JSON.stringify(filters) !== JSON.stringify(drafts);

  return (
    <div
      className="sticky top-0 z-30 px-4 py-2.5 flex flex-wrap items-center gap-2"
      style={{
        background:    'rgba(5,8,22,0.92)',
        backdropFilter:'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderBottom:  '1px solid rgba(255,255,255,0.07)',
      }}
    >
      {/* Search */}
      <div className="relative flex-1 min-w-[180px] max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-600 pointer-events-none" />
        <input
          value={drafts.search}
          onChange={e => onDraftChange('search', e.target.value)}
          onKeyDown={e => e.key === 'Enter' && onApply()}
          placeholder="Search action, email, entity…"
          className="w-full pl-8 pr-3 py-1.5 rounded-lg text-xs text-white placeholder-gray-700 outline-none transition-all"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)' }}
        />
      </div>

      {/* Module select */}
      <select
        value={drafts.module}
        onChange={e => onDraftChange('module', e.target.value)}
        className="px-2.5 py-1.5 rounded-lg text-xs text-gray-300 outline-none"
        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)' }}
      >
        <option value="">Module</option>
        {MODULES.map(m => <option key={m} value={m}>{m}</option>)}
      </select>

      {/* Severity select */}
      <select
        value={drafts.severity}
        onChange={e => onDraftChange('severity', e.target.value)}
        className="px-2.5 py-1.5 rounded-lg text-xs text-gray-300 outline-none"
        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)' }}
      >
        <option value="">Severity</option>
        {SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
      </select>

      {/* Date range */}
      <input type="date" value={drafts.from} onChange={e => onDraftChange('from', e.target.value)}
        className="px-2.5 py-1.5 rounded-lg text-xs text-gray-400 outline-none"
        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', colorScheme: 'dark' }} />
      <span className="text-gray-700 text-xs">—</span>
      <input type="date" value={drafts.to} onChange={e => onDraftChange('to', e.target.value)}
        className="px-2.5 py-1.5 rounded-lg text-xs text-gray-400 outline-none"
        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', colorScheme: 'dark' }} />

      {/* Actions */}
      {hasDraft && (
        <button
          onClick={onApply}
          className="px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-opacity"
          style={{ background: 'linear-gradient(135deg,#6366f1,#7c3aed)' }}
        >
          Apply
        </button>
      )}
      {hasActive && (
        <button onClick={onClear} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors">
          <X className="h-3 w-3" /> Clear
        </button>
      )}

      {/* Result count */}
      <div className="ml-auto flex items-center gap-2">
        <span className="text-[10px] text-gray-700">
          {logCount > 0 ? `${logCount} records` : ''}
        </span>
        <button
          onClick={onRefresh}
          className="flex items-center gap-1 text-xs text-gray-600 hover:text-gray-300 transition-colors"
        >
          <RefreshCw className={clsx('h-3.5 w-3.5', loading && 'animate-spin')} />
        </button>
      </div>
    </div>
  );
}

// ── Compact Log Row ───────────────────────────────────────────────────────────

function SevDot({ sev }: { sev: string }) {
  const cfg = SEV[sev as keyof typeof SEV] ?? SEV.LOW;
  return (
    <span
      className={clsx('h-1.5 w-1.5 rounded-full flex-shrink-0 inline-block', sev === 'CRITICAL' && 'animate-pulse')}
      style={{ background: cfg.dot }}
    />
  );
}

function ModTag({ mod }: { mod: string }) {
  if (!mod) return <span className="text-gray-700 text-[10px]">—</span>;
  const c = MOD_COLOR[mod] ?? MOD_COLOR.SYSTEM;
  return (
    <span
      className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide leading-none"
      style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}` }}
    >
      {mod.length > 5 ? mod.slice(0, 4) : mod}
    </span>
  );
}

function LogRow({
  log, selected, onClick,
}: { log: AuditLog; selected: boolean; onClick: () => void }) {
  const sev  = SEV[log.severity as keyof typeof SEV] ?? SEV.LOW;
  const norm = normAction(log.action);
  const desc = getDesc(log);

  return (
    <tr
      onClick={onClick}
      className="group cursor-pointer transition-all duration-100"
      style={{
        borderLeft:   `2px solid ${selected ? '#6366f1' : sev.rowBorder}`,
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        background:   selected ? 'rgba(99,102,241,0.06)' : sev.bg,
      }}
      onMouseEnter={e => { if (!selected) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.025)'; }}
      onMouseLeave={e => { if (!selected) (e.currentTarget as HTMLElement).style.background = sev.bg; }}
    >
      {/* Time */}
      <td className="px-3 py-2.5 whitespace-nowrap w-20">
        <p className="text-xs font-mono text-gray-500">{fmtTime(log.createdAt)}</p>
      </td>

      {/* Sev dot */}
      <td className="px-1 py-2.5 w-6">
        <SevDot sev={log.severity} />
      </td>

      {/* Module */}
      <td className="px-2 py-2.5 w-14">
        <ModTag mod={log.module} />
      </td>

      {/* Action + description — primary column */}
      <td className="px-3 py-2.5">
        <div className="flex items-baseline gap-2 min-w-0">
          <code className="text-[10px] font-mono text-indigo-400 flex-shrink-0 leading-none">
            {norm}
          </code>
          <span className="text-xs text-gray-400 truncate leading-none" title={desc}>
            {desc}
          </span>
        </div>
      </td>

      {/* Actor */}
      <td className="px-3 py-2.5 w-36 hidden md:table-cell">
        <div className="flex items-center gap-1.5 min-w-0">
          <div
            className="h-5 w-5 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0 text-white"
            style={{ background: 'rgba(99,102,241,0.3)' }}
          >
            {initials(log.actorName, log.actorEmail)}
          </div>
          <span className="text-[11px] text-gray-400 truncate">
            {log.actorName ?? (log.actorEmail ? log.actorEmail.split('@')[0] : '—')}
          </span>
        </div>
      </td>

      {/* Entity */}
      <td className="px-3 py-2.5 w-32 hidden lg:table-cell">
        <span className="text-[11px] text-gray-600 truncate block max-w-[112px]">
          {log.entityLabel ?? log.entityId ?? '—'}
        </span>
      </td>

      {/* Arrow */}
      <td className="px-2 py-2.5 w-6">
        <ArrowRight
          className="h-3 w-3 transition-colors opacity-0 group-hover:opacity-100"
          style={{ color: selected ? '#6366f1' : '#6b7280' }}
        />
      </td>
    </tr>
  );
}

// ── Date Group ────────────────────────────────────────────────────────────────

function DateGroup({
  date, items, selectedId, onSelect,
}: {
  date: string; items: AuditLog[]; selectedId: string | null;
  onSelect: (log: AuditLog) => void;
}) {
  return (
    <>
      <tr>
        <td colSpan={7} className="px-3 pt-4 pb-1.5">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold text-gray-600 uppercase tracking-widest whitespace-nowrap">{date}</span>
            <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.05)' }} />
            <span className="text-[9px] text-gray-700">{items.length} event{items.length !== 1 ? 's' : ''}</span>
          </div>
        </td>
      </tr>
      {items.map(log => (
        <LogRow
          key={log._id}
          log={log}
          selected={selectedId === log._id}
          onClick={() => onSelect(log)}
        />
      ))}
    </>
  );
}

// ── Diff Table ────────────────────────────────────────────────────────────────

function DiffTable({ old: o, next: n }: { old?: Record<string, unknown>; next?: Record<string, unknown> }) {
  if (!o && !n) return <p className="text-[10px] text-gray-700 italic">No field changes recorded</p>;
  const keys = Array.from(new Set([...Object.keys(o ?? {}), ...Object.keys(n ?? {})]));
  if (!keys.length) return <p className="text-[10px] text-gray-700 italic">No field changes recorded</p>;

  return (
    <div className="rounded-lg overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
      <div className="grid grid-cols-[1fr_1fr_1fr] px-3 py-1.5 gap-2"
           style={{ background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <span className="text-[9px] font-semibold text-gray-600 uppercase tracking-widest">Field</span>
        <span className="text-[9px] font-semibold uppercase tracking-widest" style={{ color: '#f87171' }}>Before</span>
        <span className="text-[9px] font-semibold uppercase tracking-widest" style={{ color: '#4ade80' }}>After</span>
      </div>
      {keys.map(k => {
        const ov = o?.[k], nv = n?.[k];
        const changed = JSON.stringify(ov) !== JSON.stringify(nv);
        return (
          <div key={k} className="grid grid-cols-[1fr_1fr_1fr] px-3 py-1.5 gap-2 items-start"
               style={{
                 borderBottom: '1px solid rgba(255,255,255,0.03)',
                 background: changed ? 'rgba(99,102,241,0.04)' : 'transparent',
               }}>
            <span className="text-[10px] text-gray-500 truncate">{humanField(k)}</span>
            <span className="text-[10px] font-mono break-all leading-tight"
                  style={{ color: ov !== undefined ? '#fca5a5' : '#374151' }}>
              {renderVal(ov)}
            </span>
            <span className="text-[10px] font-mono break-all leading-tight"
                  style={{ color: nv !== undefined ? '#86efac' : '#374151' }}>
              {renderVal(nv)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Detail Drawer ─────────────────────────────────────────────────────────────

function DetailDrawer({ log, onClose }: { log: AuditLog; onClose: () => void }) {
  const [showRaw, setShowRaw] = useState(false);
  const norm  = normAction(log.action);
  const desc  = getDesc(log);
  const sev   = SEV[log.severity as keyof typeof SEV] ?? SEV.LOW;
  const mod   = MOD_COLOR[log.module] ?? MOD_COLOR.SYSTEM;
  const browser = parseBrowser(log.userAgent);
  const os      = parseOS(log.userAgent);

  // Close on Escape
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [onClose]);

  return (
    <div
      className="fixed right-0 top-0 bottom-0 z-50 flex flex-col overflow-hidden"
      style={{
        width: 'min(420px, 100vw)',
        background:  'rgba(7,6,24,0.97)',
        borderLeft:  '1px solid rgba(255,255,255,0.09)',
        backdropFilter: 'blur(24px)',
      }}
    >
      {/* ── Drawer header ─────────────────────────────────────── */}
      <div className="px-5 py-4 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <code className="text-sm font-mono font-bold text-indigo-300 leading-tight break-all">{norm}</code>
          <button
            onClick={onClose}
            className="flex-shrink-0 h-6 w-6 rounded-md flex items-center justify-center text-gray-500 hover:text-white transition-colors"
            style={{ background: 'rgba(255,255,255,0.06)' }}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <p className="text-xs text-gray-300 mb-3 leading-relaxed">{desc}</p>
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wide"
            style={{ background: `${sev.dot}22`, color: sev.dot, border: `1px solid ${sev.dot}44` }}
          >
            {log.severity || '—'}
          </span>
          {log.module && (
            <span
              className="text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wide"
              style={{ background: mod.bg, color: mod.text, border: `1px solid ${mod.border}` }}
            >
              {log.module}
            </span>
          )}
          <span className="text-[10px] text-gray-600">{fmtFull(log.createdAt)}</span>
          <span className="text-[10px] text-gray-700">·</span>
          <span className="text-[10px] text-gray-700">{timeAgo(log.createdAt)}</span>
        </div>
      </div>

      {/* ── Scrollable body ────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">

        {/* Request context */}
        {(log.ipAddress || log.requestId || log.userAgent) && (
          <DrawerSection label="Request">
            <div className="space-y-2">
              {log.ipAddress && (
                <div className="flex items-center gap-2">
                  <Globe className="h-3 w-3 text-gray-600 flex-shrink-0" />
                  <code className="text-xs text-gray-300">{displayIp(log.ipAddress)}</code>
                  {log.ipAddress === '::1' && <span className="text-[9px] text-gray-700 bg-gray-800 px-1 rounded">local</span>}
                </div>
              )}
              {log.userAgent && (
                <div className="flex items-center gap-2">
                  <Monitor className="h-3 w-3 text-gray-600 flex-shrink-0" />
                  <span className="text-xs text-gray-400">
                    {browser}{os ? ` · ${os}` : ''}
                  </span>
                </div>
              )}
              {log.requestId && (
                <div className="flex items-start gap-2">
                  <Hash className="h-3 w-3 text-gray-600 flex-shrink-0 mt-0.5" />
                  <code className="text-[10px] text-gray-600 break-all leading-relaxed">{log.requestId}</code>
                </div>
              )}
            </div>
          </DrawerSection>
        )}

        {/* Actor */}
        <DrawerSection label="Actor">
          <div className="flex items-center gap-3">
            <div
              className="h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 text-white"
              style={{ background: 'linear-gradient(135deg,#6366f1,#7c3aed)' }}
            >
              {initials(log.actorName, log.actorEmail)}
            </div>
            <div className="min-w-0">
              <p className="text-sm text-gray-200 font-medium truncate">{log.actorName || log.actorEmail || 'System'}</p>
              {log.actorName && <p className="text-[10px] text-gray-500 truncate">{log.actorEmail}</p>}
              {log.actorRole && log.actorRole !== 'UNKNOWN' && (
                <p className="text-[9px] text-gray-700 uppercase tracking-widest">{log.actorRole}</p>
              )}
            </div>
          </div>
        </DrawerSection>

        {/* Changed fields */}
        <DrawerSection label="Changed Fields">
          <DiffTable old={log.oldValues} next={log.newValues} />
        </DrawerSection>

        {/* Metadata */}
        {log.metadata && Object.keys(log.metadata).length > 0 && (
          <DrawerSection label="Context">
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(log.metadata).map(([k, v]) => (
                <div key={k} className="flex items-center gap-1.5 px-2 py-1 rounded"
                     style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.12)' }}>
                  <span className="text-[9px] text-gray-500">{humanField(k)}:</span>
                  <span className="text-[10px] text-indigo-300 font-mono">{renderVal(v)}</span>
                </div>
              ))}
            </div>
          </DrawerSection>
        )}

        {/* Raw JSON */}
        {(log.oldValues || log.newValues) && (
          <DrawerSection label="Raw JSON">
            <button
              onClick={() => setShowRaw(v => !v)}
              className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors flex items-center gap-1 mb-2"
            >
              <Terminal className="h-2.5 w-2.5" />
              {showRaw ? 'Hide' : 'Show raw JSON'}
            </button>
            {showRaw && (
              <div className="space-y-2">
                {log.oldValues && (
                  <pre className="text-[10px] rounded-lg p-3 overflow-x-auto leading-relaxed"
                       style={{ background: 'rgba(0,0,0,0.5)', color: '#fca5a5' }}>
                    {JSON.stringify(log.oldValues, null, 2)}
                  </pre>
                )}
                {log.newValues && (
                  <pre className="text-[10px] rounded-lg p-3 overflow-x-auto leading-relaxed"
                       style={{ background: 'rgba(0,0,0,0.5)', color: '#86efac' }}>
                    {JSON.stringify(log.newValues, null, 2)}
                  </pre>
                )}
              </div>
            )}
          </DrawerSection>
        )}
      </div>
    </div>
  );
}

function DrawerSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
      <p className="text-[9px] font-semibold text-gray-600 uppercase tracking-widest mb-3">{label}</p>
      {children}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AuditLogs() {
  const [logs,         setLogs]         = useState<AuditLog[]>([]);
  const [stats,        setStats]        = useState<AuditStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [nextCursor,   setNextCursor]   = useState<string | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [loadingMore,  setLoadingMore]  = useState(false);
  const [error,        setError]        = useState('');
  const [selected,     setSelected]     = useState<AuditLog | null>(null);

  // Draft (live-typed) vs committed (applied) filters
  const [drafts,  setDrafts]  = useState({ search: '', module: '', severity: '', from: '', to: '' });
  const [filters, setFilters] = useState({ search: '', module: '', severity: '', from: '', to: '' });

  const hasActive = !!(filters.search || filters.module || filters.severity || filters.from || filters.to);

  const buildParams = useCallback((cursor?: string) => {
    const p = new URLSearchParams();
    if (filters.search)   p.set('search',   filters.search);
    if (filters.module)   p.set('module',   filters.module);
    if (filters.severity) p.set('severity', filters.severity);
    if (filters.from)     p.set('from',     filters.from);
    if (filters.to)       p.set('to',       filters.to);
    if (cursor)           p.set('cursor',   cursor);
    p.set('limit', '50');
    return p.toString();
  }, [filters]);

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const res = await api.get('/audit-logs/stats');
      setStats(res.data.stats);
    } catch { /* silent — analytics are non-critical */ }
    finally { setStatsLoading(false); }
  }, []);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError('');
    setSelected(null);
    try {
      const res = await api.get(`/audit-logs?${buildParams()}`);
      setLogs(res.data.logs ?? []);
      setNextCursor(res.data.nextCursor ?? null);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  }, [buildParams]);

  useEffect(() => { fetchStats(); }, [fetchStats]);
  useEffect(() => { fetchLogs(); },  [fetchLogs]);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await api.get(`/audit-logs?${buildParams(nextCursor)}`);
      setLogs(prev => [...prev, ...(res.data.logs ?? [])]);
      setNextCursor(res.data.nextCursor ?? null);
    } catch { /* silent */ }
    finally { setLoadingMore(false); }
  };

  const applyFilters = useCallback(() => setFilters({ ...drafts }), [drafts]);
  const clearFilters = () => {
    const empty = { search: '', module: '', severity: '', from: '', to: '' };
    setDrafts(empty);
    setFilters(empty);
  };

  // Quick-filter from analytics pills
  const handleAnalyticsFilter = (type: 'module' | 'severity', val: string) => {
    const current = type === 'module' ? filters.module : filters.severity;
    const next = current === val ? '' : val;
    const updated = { ...filters, [type]: next };
    setDrafts(updated);
    setFilters(updated);
  };

  // CSV export
  const exporting = useRef(false);
  const handleExport = async () => {
    if (exporting.current) return;
    exporting.current = true;
    try {
      const res  = await api.get(`/audit-logs?${buildParams()}&limit=1000`);
      const rows: AuditLog[] = res.data.logs ?? [];
      const header = ['Timestamp','Module','Severity','Action','Description','Actor Name','Actor Email','Actor Role','Entity','IP','Request ID'];
      const csv = [
        header.join(','),
        ...rows.map(r => [
          fmtFull(r.createdAt), r.module || '', r.severity || '',
          r.action, getDesc(r),
          r.actorName || '', r.actorEmail, r.actorRole || '',
          r.entityLabel || r.entityId || '',
          r.ipAddress || '', r.requestId || '',
        ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')),
      ].join('\n');
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
      const a   = Object.assign(document.createElement('a'), {
        href: url, download: `audit-${new Date().toISOString().slice(0, 10)}.csv`,
      });
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* silent */ }
    finally { exporting.current = false; }
  };

  const groups = useMemo(() => groupLogs(logs), [logs]);

  return (
    <div className="flex flex-col min-h-screen" style={{ background: '#050816' }}>
      <Header
        title="Audit Logs"
        subtitle="Immutable security audit trail"
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={handleExport}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:text-gray-200 transition-colors"
              style={{ border: '1px solid rgba(255,255,255,0.08)' }}
            >
              <Download className="h-3.5 w-3.5" /> Export CSV
            </button>
          </div>
        }
      />

      {/* ── Page body — flex row to accommodate side drawer ───────── */}
      <div className="flex flex-1 min-h-0 relative">

        {/* ── Main column ─────────────────────────────────────────── */}
        <div
          className="flex-1 min-w-0 flex flex-col transition-all duration-200"
          style={{ marginRight: selected ? 'min(420px, 100vw)' : 0 }}
        >

          {/* Analytics strip */}
          <div className="px-4 pt-4 pb-0">
            <AnalyticsSection
              stats={stats}
              statsLoading={statsLoading}
              filters={filters}
              onFilterClick={handleAnalyticsFilter}
            />
          </div>

          {/* Sticky toolbar */}
          <Toolbar
            filters={filters}
            drafts={drafts}
            logCount={logs.length}
            loading={loading}
            onDraftChange={(k, v) => setDrafts(d => ({ ...d, [k]: v }))}
            onApply={applyFilters}
            onClear={clearFilters}
            onRefresh={() => { fetchStats(); fetchLogs(); }}
          />

          {/* Log table */}
          <div className="flex-1 overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.015)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <th className="px-3 py-2 text-left text-[9px] font-semibold text-gray-700 uppercase tracking-widest w-20">Time</th>
                  <th className="px-1 py-2 w-6" />
                  <th className="px-2 py-2 text-left text-[9px] font-semibold text-gray-700 uppercase tracking-widest w-14">Mod</th>
                  <th className="px-3 py-2 text-left text-[9px] font-semibold text-gray-700 uppercase tracking-widest">Action · Description</th>
                  <th className="px-3 py-2 text-left text-[9px] font-semibold text-gray-700 uppercase tracking-widest w-36 hidden md:table-cell">Actor</th>
                  <th className="px-3 py-2 text-left text-[9px] font-semibold text-gray-700 uppercase tracking-widest w-32 hidden lg:table-cell">Entity</th>
                  <th className="px-2 py-2 w-6" />
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={7} className="py-16 text-center">
                      <div className="flex items-center justify-center gap-2 text-gray-600 text-xs">
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Loading audit trail…
                      </div>
                    </td>
                  </tr>
                )}
                {!loading && error && (
                  <tr>
                    <td colSpan={7} className="py-12 text-center">
                      <div className="flex items-center justify-center gap-2 text-red-400 text-xs">
                        <AlertCircle className="h-3.5 w-3.5" /> {error}
                      </div>
                    </td>
                  </tr>
                )}
                {!loading && !error && logs.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-20 text-center">
                      <Shield className="h-8 w-8 text-gray-800 mx-auto mb-3" />
                      <p className="text-gray-600 text-sm font-medium">No audit events found</p>
                      <p className="text-gray-700 text-xs mt-1">
                        {hasActive ? 'Try adjusting your filters' : 'Actions will appear here as they occur'}
                      </p>
                    </td>
                  </tr>
                )}
                {!loading && !error && groups.map(({ date, items }) => (
                  <DateGroup
                    key={date}
                    date={date}
                    items={items}
                    selectedId={selected?._id ?? null}
                    onSelect={log => setSelected(prev => prev?._id === log._id ? null : log)}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* Load more footer */}
          {(nextCursor || loadingMore) && !loading && (
            <div
              className="flex items-center justify-between px-4 py-2.5"
              style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
            >
              <span className="text-[10px] text-gray-700">{logs.length} records loaded</span>
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-200 disabled:opacity-50 transition-colors"
              >
                {loadingMore
                  ? <><RefreshCw className="h-3 w-3 animate-spin" /> Loading…</>
                  : <><ChevronDown className="h-3 w-3" /> Load 50 more</>}
              </button>
            </div>
          )}
        </div>

        {/* ── Side Drawer ──────────────────────────────────────────── */}
        {selected && (
          <DetailDrawer log={selected} onClose={() => setSelected(null)} />
        )}
      </div>
    </div>
  );
}
