import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  DollarSign, AlertCircle, Clock, TrendingUp, Plus, ArrowRight,
  RefreshCw, CheckCircle,
} from 'lucide-react';
import api from '../api/axios';
import Header from '../components/layout/Header';
import type { PaymentSummary, Payment } from '../types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtCurrency(amount: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
}

function fmtFull(amount: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2 }).format(amount);
}

const STATUS_CFG = {
  pending:  { bg: 'rgba(251,191,36,0.12)',  text: '#fbbf24', border: 'rgba(251,191,36,0.2)'  },
  received: { bg: 'rgba(74,222,128,0.12)',  text: '#4ade80', border: 'rgba(74,222,128,0.2)'  },
  overdue:  { bg: 'rgba(239,68,68,0.12)',   text: '#f87171', border: 'rgba(239,68,68,0.2)'   },
  partial:  { bg: 'rgba(99,102,241,0.12)',  text: '#818cf8', border: 'rgba(99,102,241,0.2)'  },
} as const;

function StatusBadge({ status }: { status: string }) {
  const c = STATUS_CFG[status as keyof typeof STATUS_CFG] ?? STATUS_CFG.pending;
  return (
    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide leading-none"
          style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}` }}>
      {status}
    </span>
  );
}

type FilterKey = 'all' | 'last30' | 'pending' | 'overdue';

// ── Component ─────────────────────────────────────────────────────────────────

export default function PaymentDashboard() {
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all');

  const { data: summary, isLoading: summaryLoading, refetch: refetchSummary } = useQuery<PaymentSummary>({
    queryKey: ['payment-summary'],
    queryFn: () => api.get('/payments/summary').then(r => r.data.summary),
  });

  const { data: recent = [], isLoading: recentLoading } = useQuery<Payment[]>({
    queryKey: ['payments-recent'],
    queryFn: () => api.get('/payments?limit=8').then(r => r.data.payments),
  });

  const { data: overdue = [], isLoading: overdueLoading } = useQuery<Payment[]>({
    queryKey: ['payments-overdue'],
    queryFn: () => api.get('/payments?status=overdue&limit=10').then(r => r.data.payments),
  });

  const { data: filteredPayments = [], isLoading: filteredLoading } = useQuery<Payment[]>({
    queryKey: ['payments-filtered', activeFilter],
    enabled: activeFilter !== 'all',
    queryFn: async () => {
      if (activeFilter === 'last30') {
        const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
        const res = await api.get('/payments?limit=100');
        return (res.data.payments as Payment[]).filter(
          p => new Date(p.paymentDate).getTime() >= cutoff
        );
      }
      const res = await api.get(`/payments?status=${activeFilter}`);
      return res.data.payments as Payment[];
    },
  });

  const loading = summaryLoading || recentLoading || overdueLoading;

  type PillDef = {
    label: string; value: string; sub?: string;
    icon: React.ElementType; color: string; key: FilterKey;
  };

  const pills: PillDef[] = [
    {
      label: 'Total Revenue', value: fmtCurrency(summary?.totalRevenue ?? 0),
      icon: TrendingUp, color: '#4ade80', key: 'all',
    },
    {
      label: 'Last 30 Days', value: fmtCurrency(summary?.last30DaysRevenue ?? 0),
      sub: `${summary?.last30DaysCount ?? 0} payments`,
      icon: DollarSign, color: '#60a5fa', key: 'last30',
    },
    {
      label: 'Pending', value: fmtCurrency(summary?.pendingAmount ?? 0),
      sub: `${summary?.pendingCount ?? 0} invoices`,
      icon: Clock, color: '#fbbf24', key: 'pending',
    },
    {
      label: 'Overdue', value: String(summary?.overdueCount ?? 0),
      sub: 'past due',
      icon: AlertCircle, color: '#f87171', key: 'overdue',
    },
  ];

  const showFiltered = activeFilter !== 'all';
  const tablePayments = showFiltered ? filteredPayments : recent;
  const tableLoading  = showFiltered ? filteredLoading  : recentLoading;

  return (
    <div className="flex flex-col min-h-screen" style={{ background: '#050816' }}>
      <Header
        title="Payments"
        subtitle="Financial overview"
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => refetchSummary()}
              className="p-1.5 rounded-lg text-gray-500 hover:text-gray-300 transition-colors"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <Link
              to="/payments/log"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white"
              style={{ background: 'linear-gradient(135deg,#6366f1,#7c3aed)' }}
            >
              <Plus className="h-3.5 w-3.5" /> Record Payment
            </Link>
          </div>
        }
      />

      <div className="px-4 pt-4 space-y-4">

        {/* ── Stat pills ────────────────────────────────────────────────────── */}
        <div
          className="rounded-xl px-4 py-3"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <DollarSign className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Financial Summary</span>
            </div>
            {showFiltered && (
              <button
                onClick={() => setActiveFilter('all')}
                className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors"
              >
                Clear filter ×
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {pills.map(({ label, value, sub, icon: Icon, color, key }) => {
              const active = activeFilter === key;
              return (
                <button
                  key={key}
                  onClick={() => setActiveFilter(prev => prev === key ? 'all' : key)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all"
                  style={{
                    background: active ? `${color}22` : 'rgba(255,255,255,0.04)',
                    border:     `1px solid ${active ? color + '55' : 'rgba(255,255,255,0.07)'}`,
                  }}
                >
                  <Icon className="h-3.5 w-3.5 flex-shrink-0" style={{ color }} />
                  {summaryLoading
                    ? <span className="h-4 w-16 rounded animate-pulse" style={{ background: 'rgba(255,255,255,0.1)' }} />
                    : <span className="text-sm font-bold text-white tabular-nums">{value}</span>
                  }
                  <div className="min-w-0">
                    <span className="text-[10px] text-gray-500 whitespace-nowrap">{label}</span>
                    {sub && <span className="text-[9px] text-gray-700 block">{sub}</span>}
                  </div>
                  {active && <span className="text-[9px]" style={{ color }}>▼</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Overdue alert strip ────────────────────────────────────────────── */}
        {!showFiltered && overdue.length > 0 && (
          <div
            className="rounded-xl px-4 py-2.5 flex items-center justify-between"
            style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="h-3.5 w-3.5 text-red-400 flex-shrink-0" />
              <span className="text-xs text-red-400 font-medium">
                {overdue.length} overdue payment{overdue.length !== 1 ? 's' : ''} require attention
              </span>
            </div>
            <button
              onClick={() => setActiveFilter('overdue')}
              className="flex items-center gap-1 text-xs text-red-400 hover:text-red-200 transition-colors"
            >
              View <ArrowRight className="h-3 w-3" />
            </button>
          </div>
        )}

        {/* ── Payments table ─────────────────────────────────────────────────── */}
        <div
          className="rounded-xl overflow-hidden"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}
        >
          <div
            className="flex items-center justify-between px-4 py-2.5"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
          >
            <div className="flex items-center gap-2">
              {showFiltered
                ? <>{activeFilter === 'pending'  && <Clock    className="h-3.5 w-3.5 text-amber-400" />}
                    {activeFilter === 'overdue'  && <AlertCircle className="h-3.5 w-3.5 text-red-400"  />}
                    {activeFilter === 'last30'   && <TrendingUp  className="h-3.5 w-3.5 text-blue-400" />}
                  </>
                : <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
              }
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
                {showFiltered
                  ? activeFilter === 'last30'  ? 'Last 30 Days'
                  : activeFilter === 'pending' ? 'Pending Payments'
                  : 'Overdue Payments'
                  : 'Recent Payments'}
              </span>
              {!tableLoading && (
                <span className="text-[10px] text-gray-700">{tablePayments.length} records</span>
              )}
            </div>
            <Link
              to="/payments/log"
              className="flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-200 transition-colors"
            >
              Full log <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          {tableLoading ? (
            <div className="p-4 space-y-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-10 rounded-lg animate-pulse" style={{ background: 'rgba(255,255,255,0.04)' }} />
              ))}
            </div>
          ) : tablePayments.length === 0 ? (
            <div className="py-12 text-center">
              <DollarSign className="h-8 w-8 text-gray-700 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">No payments match this filter</p>
              <Link to="/payments/log" className="inline-flex items-center gap-1 mt-3 text-xs text-indigo-400 hover:text-indigo-200">
                <Plus className="h-3 w-3" /> Record payment
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px]">
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.015)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <th className="px-4 py-2 text-left text-[9px] font-semibold text-gray-700 uppercase tracking-widest">Project</th>
                    <th className="px-3 py-2 text-left text-[9px] font-semibold text-gray-700 uppercase tracking-widest">Period</th>
                    <th className="px-3 py-2 text-left text-[9px] font-semibold text-gray-700 uppercase tracking-widest hidden sm:table-cell">Invoice #</th>
                    <th className="px-3 py-2 text-right text-[9px] font-semibold text-gray-700 uppercase tracking-widest">Gross</th>
                    <th className="px-3 py-2 text-right text-[9px] font-semibold text-gray-700 uppercase tracking-widest">Net Paid</th>
                    <th className="px-3 py-2 text-left text-[9px] font-semibold text-gray-700 uppercase tracking-widest hidden md:table-cell">Date</th>
                    <th className="px-3 py-2 text-left text-[9px] font-semibold text-gray-700 uppercase tracking-widest w-16">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {tablePayments.map(p => {
                    const project = p.projectId as any;
                    return (
                      <tr
                        key={p._id}
                        className="group transition-colors"
                        style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.025)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <td className="px-4 py-2.5">
                          <span className="text-sm font-medium text-gray-200 truncate block max-w-[140px]">
                            {project?.name ?? '—'}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="text-xs text-gray-400">{p.invoiceMonth}</span>
                        </td>
                        <td className="px-3 py-2.5 hidden sm:table-cell">
                          <code className="text-[10px] font-mono text-gray-600">{p.invoiceNumber || '—'}</code>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <span className="text-xs font-mono text-gray-300">{fmtFull(p.grossAmount, p.currency)}</span>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <span className="text-xs font-mono font-semibold text-gray-100">{fmtFull(p.netAmount, p.currency)}</span>
                        </td>
                        <td className="px-3 py-2.5 hidden md:table-cell">
                          <span className="text-[11px] text-gray-500 tabular-nums">
                            {new Date(p.paymentDate).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <StatusBadge status={p.status} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {!showFiltered && (
            <div className="px-4 py-2.5" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              <Link
                to="/payments/log"
                className="text-[11px] text-indigo-400 hover:text-indigo-200 transition-colors flex items-center gap-1"
              >
                View full payment log <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
