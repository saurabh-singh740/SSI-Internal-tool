import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Shield, ChevronDown, ChevronUp, Search, Filter,
  RefreshCw, X, AlertTriangle, AlertCircle, Activity, Clock,
  User, Hash, Globe, Monitor, ArrowRight, Download,
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
  byModule: { _id: string; count: number }[];
  bySeverity: { _id: string; count: number }[];
  recentByDay: { _id: string; count: number }[];
  window: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MODULES    = ['AUTH','USERS','PROJECTS','DEALS','TIMESHEETS','PAYMENTS','PARTNERS','SYSTEM'];
const SEVERITIES = ['LOW','MEDIUM','HIGH','CRITICAL'];

const SEVERITY_STYLE: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  LOW:      { bg: 'rgba(107,114,128,0.15)', text: '#9ca3af', border: 'rgba(107,114,128,0.25)', dot: '#6b7280' },
  MEDIUM:   { bg: 'rgba(59,130,246,0.15)',  text: '#93c5fd', border: 'rgba(59,130,246,0.3)',   dot: '#3b82f6' },
  HIGH:     { bg: 'rgba(245,158,11,0.15)',  text: '#fcd34d', border: 'rgba(245,158,11,0.3)',   dot: '#f59e0b' },
  CRITICAL: { bg: 'rgba(239,68,68,0.15)',   text: '#fca5a5', border: 'rgba(239,68,68,0.3)',    dot: '#ef4444' },
};

const MODULE_STYLE: Record<string, { bg: string; text: string }> = {
  AUTH:       { bg: 'rgba(139,92,246,0.15)', text: '#c4b5fd' },
  USERS:      { bg: 'rgba(59,130,246,0.15)', text: '#93c5fd' },
  PROJECTS:   { bg: 'rgba(16,185,129,0.15)', text: '#6ee7b7' },
  DEALS:      { bg: 'rgba(6,182,212,0.15)',  text: '#67e8f9' },
  TIMESHEETS: { bg: 'rgba(249,115,22,0.15)', text: '#fdba74' },
  PAYMENTS:   { bg: 'rgba(234,179,8,0.15)',  text: '#fde047' },
  PARTNERS:   { bg: 'rgba(236,72,153,0.15)', text: '#f9a8d4' },
  SYSTEM:     { bg: 'rgba(107,114,128,0.15)',text: '#d1d5db' },
};

const MODULE_BAR_COLOR: Record<string, string> = {
  AUTH: '#a78bfa', USERS: '#60a5fa', PROJECTS: '#34d399',
  DEALS: '#22d3ee', TIMESHEETS: '#fb923c', PAYMENTS: '#fbbf24',
  PARTNERS: '#f472b6', SYSTEM: '#9ca3af',
};

// ── Action catalogue — human-readable + context template ─────────────────────

interface ActionMeta { label: string; desc: (log: AuditLog) => string }

const ACTION_META: Record<string, ActionMeta> = {
  AUTH_LOGIN:                    { label: 'Signed In',              desc: l => `${actor(l)} signed in` },
  AUTH_LOGOUT:                   { label: 'Signed Out',             desc: l => `${actor(l)} signed out` },
  AUTH_LOGIN_FAILED:             { label: 'Login Failed',           desc: l => `Failed login attempt for ${l.actorEmail}${l.metadata?.reason ? ` (${l.metadata.reason})` : ''}` },
  AUTH_ADMIN_REGISTERED:         { label: 'Admin Created',          desc: l => `${actor(l)} created admin account` },
  USER_CREATED:                  { label: 'User Created',           desc: l => `${actor(l)} created user ${l.entityLabel ?? ''}` },
  USER_UPDATED:                  { label: 'User Updated',           desc: l => `${actor(l)} updated ${l.entityLabel ?? 'user'}` },
  USER_DELETED:                  { label: 'User Deleted',           desc: l => `${actor(l)} deleted user ${l.entityLabel ?? ''}` },
  USER_ROLE_CHANGED:             { label: 'Role Changed',           desc: l => `${actor(l)} changed ${l.entityLabel ?? 'user'} role${l.oldValues?.role ? ` from ${l.oldValues.role}` : ''} to ${l.newValues?.role ?? '?'}` },
  PROJECT_CREATED:               { label: 'Project Created',        desc: l => `${actor(l)} created project "${l.entityLabel ?? ''}"` },
  PROJECT_UPDATED:               { label: 'Project Updated',        desc: l => `${actor(l)} updated project "${l.entityLabel ?? ''}"` },
  PROJECT_DELETED:               { label: 'Project Deleted',        desc: l => `${actor(l)} deleted project "${l.entityLabel ?? ''}"` },
  ENGINEER_ADDED:                { label: 'Engineer Added',         desc: l => `${actor(l)} added engineer to "${l.entityLabel ?? ''}"` },
  ENGINEER_REMOVED:              { label: 'Engineer Removed',       desc: l => `${actor(l)} removed engineer from "${l.entityLabel ?? ''}"` },
  DEAL_CREATED:                  { label: 'Deal Created',           desc: l => `${actor(l)} created deal "${l.entityLabel ?? ''}"` },
  DEAL_UPDATED:                  { label: 'Deal Updated',           desc: l => `${actor(l)} updated deal "${l.entityLabel ?? ''}"` },
  DEAL_STAGE_CHANGED:            { label: 'Stage Changed',          desc: l => `${actor(l)} moved "${l.entityLabel ?? ''}" to ${l.newValues?.stage ?? '?'}` },
  DEAL_SOW_UPDATED:              { label: 'SOW Updated',            desc: l => `${actor(l)} updated SOW for "${l.entityLabel ?? ''}"` },
  DEAL_RESOURCE_PLAN_UPDATED:    { label: 'Resource Plan Updated',  desc: l => `${actor(l)} saved resource plan for "${l.entityLabel ?? ''}"` },
  DEAL_CONVERTED:                { label: 'Deal → Project',         desc: l => `${actor(l)} converted "${l.entityLabel ?? ''}" to project` },
  DEAL_DELETED:                  { label: 'Deal Deleted',           desc: l => `${actor(l)} deleted deal "${l.entityLabel ?? ''}"` },
  ATTACHMENT_UPLOADED:           { label: 'File Uploaded',          desc: l => `${actor(l)} uploaded ${l.entityLabel ?? 'file'} to "${l.metadata?.dealTitle ?? l.entityId ?? ''}"` },
  ATTACHMENT_DELETED:            { label: 'File Deleted',           desc: l => `${actor(l)} deleted ${l.entityLabel ?? 'attachment'}` },
  PAYMENT_CREATED:               { label: 'Payment Recorded',       desc: l => `${actor(l)} recorded payment for "${l.entityLabel ?? ''}"` },
  PAYMENT_UPDATED:               { label: 'Payment Updated',        desc: l => `${actor(l)} updated payment for "${l.entityLabel ?? ''}"` },
  PAYMENT_DELETED:               { label: 'Payment Deleted',        desc: l => `${actor(l)} deleted payment from "${l.entityLabel ?? ''}"` },
  TIMESHEET_ENTRY_UPDATED:       { label: 'Timesheet Updated',      desc: l => `${actor(l)} updated timesheet entry` },
  TIMESHEET_MONTH_LOCKED:        { label: 'Month Locked',           desc: l => `${actor(l)} locked timesheet month` },
  TIMESHEET_MONTH_UNLOCKED:      { label: 'Month Unlocked',         desc: l => `${actor(l)} unlocked timesheet month` },
  PARTNER_CREATED:               { label: 'Partner Created',        desc: l => `${actor(l)} created partner "${l.entityLabel ?? ''}"` },
  PARTNER_UPDATED:               { label: 'Partner Updated',        desc: l => `${actor(l)} updated partner "${l.entityLabel ?? ''}"` },
  PARTNER_DELETED:               { label: 'Partner Deleted',        desc: l => `${actor(l)} deleted partner "${l.entityLabel ?? ''}"` },
};

function actor(l: AuditLog): string {
  return l.actorName || l.actorEmail || 'System';
}

/** Normalise legacy dot-notation actions like "user.deleted" → "USER_DELETED" */
function normaliseAction(action: string): string {
  return action.toUpperCase().replace(/\./g, '_').replace(/\s+/g, '_');
}

function getActionMeta(action: string): ActionMeta | undefined {
  return ACTION_META[action] ?? ACTION_META[normaliseAction(action)];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function humanField(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/^\w/, c => c.toUpperCase())
    .trim();
}

function renderVal(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'boolean')        return v ? 'Yes' : 'No';
  if (typeof v === 'object')         return JSON.stringify(v);
  return String(v);
}

// ── Stat Card ─────────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon, label, value, sub, color, loading,
}: {
  icon: React.ElementType; label: string; value: number | string;
  sub?: string; color: string; loading?: boolean;
}) {
  return (
    <div
      className="rounded-xl p-4 flex items-center gap-4"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
    >
      <div className="flex-shrink-0 h-10 w-10 rounded-lg flex items-center justify-center"
           style={{ background: `${color}22` }}>
        <Icon className="h-5 w-5" style={{ color }} />
      </div>
      <div className="min-w-0">
        {loading
          ? <div className="h-6 w-14 rounded animate-pulse" style={{ background: 'rgba(255,255,255,0.08)' }} />
          : <p className="text-2xl font-bold text-white leading-none">{value}</p>
        }
        <p className="text-xs text-gray-500 mt-0.5 truncate">{label}</p>
        {sub && <p className="text-[10px] text-gray-600">{sub}</p>}
      </div>
    </div>
  );
}

// ── Module Bar ────────────────────────────────────────────────────────────────

function ModuleBar({ byModule, total }: { byModule: { _id: string; count: number }[]; total: number }) {
  return (
    <div className="rounded-xl p-4 space-y-2.5"
         style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Activity by Module (30d)</p>
      {byModule.length === 0
        ? <p className="text-xs text-gray-700 py-2">No data yet</p>
        : byModule.map(({ _id, count }) => {
            const pct   = total > 0 ? Math.round((count / total) * 100) : 0;
            const color = MODULE_BAR_COLOR[_id] ?? '#9ca3af';
            return (
              <div key={_id} className="flex items-center gap-3">
                <span className="text-xs text-gray-400 w-20 flex-shrink-0">{_id}</span>
                <div className="flex-1 h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.07)' }}>
                  <div className="h-full rounded-full transition-all duration-500"
                       style={{ width: `${pct}%`, background: color }} />
                </div>
                <span className="text-xs text-gray-500 w-8 text-right">{count}</span>
              </div>
            );
          })
      }
    </div>
  );
}

// ── Sparkline ─────────────────────────────────────────────────────────────────

function Sparkline({ days }: { days: { _id: string; count: number }[] }) {
  if (!days.length) return (
    <div className="rounded-xl p-4 flex flex-col justify-center"
         style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Daily Activity (30d)</p>
      <p className="text-xs text-gray-700">No data yet</p>
    </div>
  );
  const max   = Math.max(...days.map(d => d.count), 1);
  const total = days.reduce((s, d) => s + d.count, 0);
  const W = 4, GAP = 2, H = 44;
  return (
    <div className="rounded-xl p-4"
         style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Daily Activity (30d)</p>
        <span className="text-xs text-gray-500">{total.toLocaleString()} events</span>
      </div>
      <svg width={days.length * (W + GAP)} height={H + 4} className="overflow-visible">
        {days.map((d, i) => {
          const h = Math.max(2, Math.round((d.count / max) * H));
          return (
            <rect key={d._id} x={i * (W + GAP)} y={H - h + 2} width={W} height={h} rx={1}
                  fill="rgba(99,102,241,0.65)">
              <title>{d._id}: {d.count}</title>
            </rect>
          );
        })}
      </svg>
    </div>
  );
}

// ── Field-level Diff ──────────────────────────────────────────────────────────

function DiffTable({ old: o, next: n }: { old?: Record<string, unknown>; next?: Record<string, unknown> }) {
  if (!o && !n) return null;
  const keys = Array.from(new Set([...Object.keys(o ?? {}), ...Object.keys(n ?? {})]));
  if (!keys.length) return null;

  return (
    <div className="rounded-lg overflow-hidden text-xs" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
      <div className="grid grid-cols-[1fr_1fr_1fr] px-3 py-1.5"
           style={{ background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <span className="text-[10px] font-semibold text-gray-600 uppercase tracking-widest">Field</span>
        <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#f87171' }}>Before</span>
        <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#4ade80' }}>After</span>
      </div>
      {keys.map(k => {
        const ov = o?.[k];
        const nv = n?.[k];
        const changed = JSON.stringify(ov) !== JSON.stringify(nv);
        return (
          <div key={k} className="grid grid-cols-[1fr_1fr_1fr] px-3 py-2 items-start gap-2"
               style={{
                 borderBottom: '1px solid rgba(255,255,255,0.03)',
                 background: changed ? 'rgba(99,102,241,0.05)' : 'transparent',
               }}>
            <span className="text-gray-400 font-medium truncate">{humanField(k)}</span>
            <span className="font-mono break-all" style={{ color: ov !== undefined ? '#fca5a5' : '#374151' }}>
              {renderVal(ov)}
            </span>
            <div className="flex items-start gap-1">
              {changed && ov !== undefined && nv !== undefined && (
                <ArrowRight className="h-3 w-3 text-gray-700 mt-0.5 flex-shrink-0" />
              )}
              <span className="font-mono break-all" style={{ color: nv !== undefined ? '#86efac' : '#374151' }}>
                {renderVal(nv)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Log Row ───────────────────────────────────────────────────────────────────

function LogRow({ log }: { log: AuditLog }) {
  const [open, setOpen] = useState(false);

  const normAction   = normaliseAction(log.action);
  const meta         = getActionMeta(log.action);
  const displayLabel = meta?.label ?? normAction.replace(/_/g, ' ');
  const contextDesc  = meta?.desc(log);
  const hasDetail    = !!(log.oldValues || log.newValues || log.metadata || log.ipAddress || log.userAgent || log.requestId);

  const sev = log.severity ? SEVERITY_STYLE[log.severity] : null;
  const mod = log.module   ? MODULE_STYLE[log.module]     : null;

  return (
    <>
      <tr
        className={clsx('transition-colors group cursor-default', open ? 'bg-indigo-500/5' : 'hover:bg-white/[0.025]')}
        style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
      >
        {/* Timestamp */}
        <td className="px-4 py-3 whitespace-nowrap">
          <p className="text-xs font-mono text-gray-300">{formatDate(log.createdAt)}</p>
          <p className="text-[10px] text-gray-600 mt-0.5">{timeAgo(log.createdAt)}</p>
        </td>

        {/* Module */}
        <td className="px-4 py-3">
          {mod ? (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide"
                  style={{ background: mod.bg, color: mod.text }}>
              {log.module}
            </span>
          ) : (
            <span className="text-xs text-gray-700">—</span>
          )}
        </td>

        {/* Severity */}
        <td className="px-4 py-3">
          {sev ? (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide border"
                  style={{ background: sev.bg, color: sev.text, borderColor: sev.border }}>
              {log.severity}
            </span>
          ) : (
            <span className="text-xs text-gray-700">—</span>
          )}
        </td>

        {/* Action + human summary */}
        <td className="px-4 py-3 max-w-[220px]">
          <span className="text-xs font-mono px-2 py-0.5 rounded block truncate"
                style={{ background: 'rgba(99,102,241,0.1)', color: '#a5b4fc' }}>
            {normAction !== log.action ? normAction : log.action}
          </span>
          {contextDesc && (
            <p className="text-[10px] text-gray-600 mt-0.5 truncate" title={contextDesc}>{contextDesc}</p>
          )}
        </td>

        {/* Actor */}
        <td className="px-4 py-3 max-w-[180px]">
          {log.actorName && (
            <p className="text-sm font-medium text-gray-200 truncate">{log.actorName}</p>
          )}
          <p className={clsx('truncate', log.actorName ? 'text-[10px] text-gray-500' : 'text-sm text-gray-200 font-medium')}>
            {log.actorEmail || '—'}
          </p>
          {log.actorRole && log.actorRole !== 'UNKNOWN' && (
            <p className="text-[10px] text-gray-700 uppercase tracking-wide">{log.actorRole}</p>
          )}
        </td>

        {/* Entity */}
        <td className="px-4 py-3 text-sm text-gray-400 max-w-[140px]">
          <span className="truncate block">{log.entityLabel ?? log.entityId ?? '—'}</span>
        </td>

        {/* Detail toggle */}
        <td className="px-4 py-3 text-right">
          {hasDetail ? (
            <button
              onClick={() => setOpen(v => !v)}
              className="inline-flex items-center gap-1 text-xs font-medium transition-colors"
              style={{ color: open ? '#818cf8' : '#6366f1' }}
            >
              {open
                ? <><ChevronUp   className="h-3.5 w-3.5" /> Close</>
                : <><ChevronDown className="h-3.5 w-3.5" /> Detail</>}
            </button>
          ) : (
            <span className="text-xs text-gray-700">—</span>
          )}
        </td>
      </tr>

      {/* ── Detail Panel ──────────────────────────────────────────────────── */}
      {open && (
        <tr style={{ background: 'rgba(10,8,30,0.7)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <td colSpan={7} className="px-6 py-5">
            <div className="space-y-5">

              {/* Request context strip */}
              {(log.ipAddress || log.requestId || log.userAgent) && (
                <div className="flex flex-wrap gap-x-5 gap-y-1.5">
                  {log.ipAddress && (
                    <div className="flex items-center gap-1.5">
                      <Globe className="h-3 w-3 text-gray-600 flex-shrink-0" />
                      <code className="text-xs text-gray-400">{log.ipAddress}</code>
                    </div>
                  )}
                  {log.requestId && (
                    <div className="flex items-center gap-1.5">
                      <Hash className="h-3 w-3 text-gray-600 flex-shrink-0" />
                      <code className="text-[10px] text-gray-600 font-mono truncate max-w-xs">{log.requestId}</code>
                    </div>
                  )}
                  {log.userAgent && (
                    <div className="flex items-center gap-1.5">
                      <Monitor className="h-3 w-3 text-gray-600 flex-shrink-0" />
                      <span className="text-[10px] text-gray-600 truncate max-w-sm">{log.userAgent}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Actor detail row */}
              {log.actorName && (
                <div className="flex items-center gap-1.5">
                  <User className="h-3 w-3 text-gray-600 flex-shrink-0" />
                  <span className="text-xs text-gray-500">
                    <span className="text-gray-300">{log.actorName}</span>
                    {' · '}<span className="text-gray-600">{log.actorEmail}</span>
                    {' · '}<span className="text-gray-700 uppercase text-[10px]">{log.actorRole}</span>
                  </span>
                </div>
              )}

              {/* Changed-fields diff table */}
              {(log.oldValues || log.newValues) && (
                <div>
                  <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-widest mb-2">
                    Changed Fields
                  </p>
                  <DiffTable old={log.oldValues} next={log.newValues} />
                </div>
              )}

              {/* Metadata chips */}
              {log.metadata && Object.keys(log.metadata).length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-widest mb-2">Context</p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(log.metadata).map(([k, v]) => (
                      <div key={k} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg"
                           style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.15)' }}>
                        <span className="text-[10px] text-gray-500">{humanField(k)}:</span>
                        <span className="text-xs text-indigo-300 font-mono">{renderVal(v)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Raw JSON toggle */}
              {(log.oldValues || log.newValues) && (
                <RawJsonToggle old={log.oldValues} next={log.newValues} />
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Raw JSON Toggle ───────────────────────────────────────────────────────────

function RawJsonToggle({ old: o, next: n }: { old?: Record<string, unknown>; next?: Record<string, unknown> }) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <button
        onClick={() => setShow(v => !v)}
        className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors flex items-center gap-1"
      >
        {show ? <ChevronUp className="h-2.5 w-2.5" /> : <ChevronDown className="h-2.5 w-2.5" />}
        {show ? 'Hide raw JSON' : 'View raw JSON'}
      </button>
      {show && (
        <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-3">
          {o && (
            <div>
              <p className="text-[10px] text-red-500/50 mb-1 uppercase tracking-widest">Before</p>
              <pre className="text-xs rounded-lg p-3 overflow-x-auto"
                   style={{ background: 'rgba(0,0,0,0.4)', color: '#fca5a5' }}>
                {JSON.stringify(o, null, 2)}
              </pre>
            </div>
          )}
          {n && (
            <div>
              <p className="text-[10px] text-emerald-500/50 mb-1 uppercase tracking-widest">After</p>
              <pre className="text-xs rounded-lg p-3 overflow-x-auto"
                   style={{ background: 'rgba(0,0,0,0.4)', color: '#86efac' }}>
                {JSON.stringify(n, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AuditLogs() {
  const [logs,         setLogs]         = useState<AuditLog[]>([]);
  const [stats,        setStats]        = useState<AuditStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError,   setStatsError]   = useState('');
  const [nextCursor,   setNextCursor]   = useState<string | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [loadingMore,  setLoadingMore]  = useState(false);
  const [error,        setError]        = useState('');
  const [showFilters,  setShowFilters]  = useState(false);

  // Draft (live-typed) filter state
  const [search,   setSearch]   = useState('');
  const [module,   setModule]   = useState('');
  const [severity, setSeverity] = useState('');
  const [from,     setFrom]     = useState('');
  const [to,       setTo]       = useState('');

  // Committed (applied) filter state
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
    setStatsError('');
    try {
      const res = await api.get('/audit-logs/stats');
      setStats(res.data.stats);
    } catch (err: any) {
      setStatsError(err?.response?.data?.message || 'Stats unavailable');
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError('');
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

  useEffect(() => {
    fetchStats();
    fetchLogs();
  }, [fetchStats, fetchLogs]);

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

  const applyFilters = () => setFilters({ search, module, severity, from, to });
  const clearFilters = () => {
    setSearch(''); setModule(''); setSeverity(''); setFrom(''); setTo('');
    setFilters({ search: '', module: '', severity: '', from: '', to: '' });
  };

  // ── CSV export ──────────────────────────────────────────────────────────
  const exportRef = useRef(false);
  const handleExport = async () => {
    if (exportRef.current) return;
    exportRef.current = true;
    try {
      // Fetch all with large limit (up to 1000)
      const res = await api.get(`/audit-logs?${buildParams()}&limit=1000`);
      const rows: AuditLog[] = res.data.logs ?? [];
      const header = ['Timestamp','Module','Severity','Action','Actor Email','Actor Name','Actor Role','Entity','IP','Request ID'];
      const csv = [
        header.join(','),
        ...rows.map(r => [
          formatDate(r.createdAt),
          r.module   || '',
          r.severity || '',
          r.action,
          r.actorEmail,
          r.actorName  || '',
          r.actorRole  || '',
          r.entityLabel || r.entityId || '',
          r.ipAddress  || '',
          r.requestId  || '',
        ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')),
      ].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `audit-logs-${new Date().toISOString().slice(0,10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* silent */ }
    finally { exportRef.current = false; }
  };

  return (
    <div className="flex flex-col min-h-screen" style={{ background: '#050816' }}>
      <Header
        title="Audit Logs"
        subtitle="Immutable record of all privileged system actions"
        actions={
          <div className="flex items-center gap-2">
            {hasActive && (
              <button onClick={clearFilters}
                      className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-200 transition-colors">
                <X className="h-3.5 w-3.5" /> Clear filters
              </button>
            )}
            <button
              onClick={handleExport}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-400 hover:text-gray-200 transition-colors"
              style={{ border: '1px solid rgba(255,255,255,0.08)' }}
            >
              <Download className="h-3.5 w-3.5" /> Export CSV
            </button>
            <button
              onClick={() => setShowFilters(v => !v)}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                showFilters ? 'bg-indigo-500/20 text-indigo-300' : 'text-gray-400 hover:text-gray-200',
              )}
              style={{ border: showFilters ? '1px solid rgba(99,102,241,0.3)' : '1px solid rgba(255,255,255,0.08)' }}
            >
              <Filter className="h-3.5 w-3.5" />
              Filters{hasActive ? ' •' : ''}
            </button>
            <button
              onClick={() => { fetchStats(); fetchLogs(); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-400 hover:text-gray-200 transition-colors"
              style={{ border: '1px solid rgba(255,255,255,0.08)' }}
            >
              <RefreshCw className={clsx('h-3.5 w-3.5', loading && 'animate-spin')} />
              Refresh
            </button>
          </div>
        }
      />

      <main className="flex-1 p-4 md:p-6 space-y-5">

        {/* ── Stats ─────────────────────────────────────────────────────── */}
        {statsError ? (
          <div className="px-4 py-3 rounded-xl text-xs text-amber-400 flex items-center gap-2"
               style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
            <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
            Stats unavailable: {statsError}
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard icon={Activity}      label="Total Events (30d)"  value={stats?.total    ?? 0} color="#6366f1" loading={statsLoading} />
            <StatCard icon={AlertCircle}   label="Critical Events"     value={stats?.critical ?? 0} sub="last 30 days" color="#ef4444" loading={statsLoading} />
            <StatCard icon={AlertTriangle} label="High Severity"       value={stats?.high     ?? 0} sub="last 30 days" color="#f59e0b" loading={statsLoading} />
            <StatCard icon={Clock}         label="Records Loaded"      value={logs.length}          color="#10b981" />
          </div>
        )}

        {/* ── Charts ────────────────────────────────────────────────────── */}
        {!statsError && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <ModuleBar byModule={stats?.byModule ?? []} total={stats?.total ?? 0} />
            <Sparkline days={stats?.recentByDay ?? []} />
          </div>
        )}

        {/* ── Filter Bar ────────────────────────────────────────────────── */}
        {showFilters && (
          <div
            className="rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
          >
            <div className="lg:col-span-2 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500 pointer-events-none" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && applyFilters()}
                placeholder="Search action, email, name, entity, IP…"
                className="w-full pl-8 pr-3 py-2 rounded-lg text-sm text-white placeholder-gray-600 outline-none"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
              />
            </div>
            <select value={module} onChange={e => setModule(e.target.value)}
                    className="px-3 py-2 rounded-lg text-sm text-gray-300 outline-none"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
              <option value="">All Modules</option>
              {MODULES.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <select value={severity} onChange={e => setSeverity(e.target.value)}
                    className="px-3 py-2 rounded-lg text-sm text-gray-300 outline-none"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
              <option value="">All Severities</option>
              {SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)}
                   className="px-3 py-2 rounded-lg text-sm text-gray-300 outline-none"
                   style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', colorScheme: 'dark' }} />
            <input type="date" value={to} onChange={e => setTo(e.target.value)}
                   className="px-3 py-2 rounded-lg text-sm text-gray-300 outline-none"
                   style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', colorScheme: 'dark' }} />
            <div className="sm:col-span-2 lg:col-span-6 flex justify-end gap-2">
              <button onClick={clearFilters}
                      className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-white transition-colors"
                      style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
                Reset
              </button>
              <button onClick={applyFilters}
                      className="px-4 py-2 rounded-lg text-sm font-medium text-white"
                      style={{ background: 'linear-gradient(135deg,#6366f1,#7c3aed)' }}>
                Apply Filters
              </button>
            </div>
          </div>
        )}

        {/* ── Audit Table ───────────────────────────────────────────────── */}
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>

          {/* Table header bar */}
          <div className="flex items-center justify-between px-4 py-3"
               style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-indigo-400" />
              <span className="text-sm font-medium text-gray-300">Audit Trail</span>
              {logs.length > 0 && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                      style={{ background: 'rgba(99,102,241,0.15)', color: '#a5b4fc' }}>
                  {logs.length} records
                </span>
              )}
            </div>
            {hasActive && (
              <div className="flex flex-wrap gap-1.5">
                {filters.module   && <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300">{filters.module}</span>}
                {filters.severity && <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300">{filters.severity}</span>}
                {filters.search   && <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300">"{filters.search}"</span>}
              </div>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[960px]">
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.015)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  {['Timestamp','Module','Severity','Action','Actor','Entity',''].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-gray-600 uppercase tracking-widest whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={7} className="py-16 text-center">
                      <div className="flex items-center justify-center gap-2 text-gray-500 text-sm">
                        <RefreshCw className="h-4 w-4 animate-spin" /> Loading…
                      </div>
                    </td>
                  </tr>
                )}
                {!loading && error && (
                  <tr>
                    <td colSpan={7} className="py-12 text-center">
                      <div className="flex items-center justify-center gap-2 text-red-400 text-sm">
                        <AlertCircle className="h-4 w-4" /> {error}
                      </div>
                    </td>
                  </tr>
                )}
                {!loading && !error && logs.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-16 text-center">
                      <Shield className="h-8 w-8 text-gray-700 mx-auto mb-2" />
                      <p className="text-gray-500 text-sm">
                        No audit logs found{hasActive ? ' matching these filters' : ''}.
                      </p>
                      <p className="text-gray-700 text-xs mt-1">
                        Actions like login, project edits, deal updates and user changes appear here.
                      </p>
                    </td>
                  </tr>
                )}
                {!loading && !error && logs.map(log => <LogRow key={log._id} log={log} />)}
              </tbody>
            </table>
          </div>

          {/* Load more */}
          {nextCursor && !loading && (
            <div className="px-4 py-3 flex items-center justify-between"
                 style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <span className="text-xs text-gray-600">{logs.length} records loaded</span>
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="flex items-center gap-2 text-sm text-indigo-400 hover:text-indigo-200 disabled:opacity-50 transition-colors"
              >
                {loadingMore
                  ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Loading…</>
                  : <><ChevronDown className="h-3.5 w-3.5" /> Load more</>}
              </button>
            </div>
          )}
        </div>

      </main>
    </div>
  );
}
