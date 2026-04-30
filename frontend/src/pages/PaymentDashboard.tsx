import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  DollarSign, AlertCircle, Clock, TrendingUp, Plus, ArrowRight,
} from 'lucide-react';
import { clsx } from 'clsx';
import api from '../api/axios';
import Header from '../components/layout/Header';
import type { PaymentSummary, Payment } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

type FilterKey = 'all' | 'last30' | 'pending' | 'overdue';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtCurrency(amount: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
}

const STATUS_BADGE: Record<string, string> = {
  pending:  'badge badge-yellow',
  received: 'badge badge-green',
  overdue:  'badge badge-red',
  partial:  'badge badge-blue',
};

const FILTER_LABEL: Record<FilterKey, string> = {
  all:     'Recent Payments',
  last30:  'Payments — Last 30 Days',
  pending: 'Pending Payments',
  overdue: 'Overdue Payments',
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function PaymentDashboard() {
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all');

  const { data: summary, isLoading: summaryLoading, isError } = useQuery<PaymentSummary>({
    queryKey: ['payment-summary'],
    queryFn: () => api.get('/payments/summary').then(r => r.data.summary),
  });

  const { data: recent = [], isLoading: recentLoading } = useQuery<Payment[]>({
    queryKey: ['payments-recent'],
    queryFn: () => api.get('/payments?limit=5').then(r => r.data.payments),
  });

  const { data: overdue = [], isLoading: overdueLoading } = useQuery<Payment[]>({
    queryKey: ['payments-overdue'],
    queryFn: () => api.get('/payments?status=overdue&limit=10').then(r => r.data.payments),
  });

  // Filtered query — only active when a non-default filter is selected
  const { data: filteredPayments = [], isLoading: filteredLoading } = useQuery<Payment[]>({
    queryKey: ['payments-filtered', activeFilter],
    enabled: activeFilter !== 'all',
    queryFn: async () => {
      if (activeFilter === 'last30') {
        const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
        const res = await api.get('/payments?limit=100');
        return (res.data.payments as Payment[]).filter(
          p => new Date(p.paymentDate).getTime() >= cutoff,
        );
      }
      const res = await api.get(`/payments?status=${activeFilter}`);
      return res.data.payments as Payment[];
    },
  });

  const loading = summaryLoading || recentLoading || overdueLoading;
  const error   = isError ? 'Failed to load payment dashboard' : '';

  if (loading) return (
    <div className="page-content">
      <Header title="Payments" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="skeleton h-28 rounded-xl" />
        ))}
      </div>
    </div>
  );

  if (error) return (
    <div className="page-content">
      <Header title="Payments" />
      <div className="empty-state mt-10">
        <AlertCircle className="h-10 w-10 text-red-400 mx-auto mb-2" />
        <p className="text-red-600">{error}</p>
      </div>
    </div>
  );

  const cards: {
    label:     string;
    value:     string;
    sub?:      string;
    icon:      React.ElementType;
    color:     string;
    bg:        string;
    filterKey: FilterKey;
    ringColor: string;
  }[] = [
    {
      label:     'Total Revenue',
      value:     fmtCurrency(summary?.totalRevenue ?? 0),
      icon:      TrendingUp,
      color:     'text-emerald-400',
      bg:        'bg-emerald-500/15',
      filterKey: 'all',
      ringColor: 'ring-emerald-400',
    },
    {
      label:     'Last 30 Days',
      value:     fmtCurrency(summary?.last30DaysRevenue ?? 0),
      sub:       `${summary?.last30DaysCount ?? 0} payments received`,
      icon:      DollarSign,
      color:     'text-blue-400',
      bg:        'bg-blue-500/15',
      filterKey: 'last30',
      ringColor: 'ring-blue-400',
    },
    {
      label:     'Pending Amount',
      value:     fmtCurrency(summary?.pendingAmount ?? 0),
      sub:       `${summary?.pendingCount ?? 0} invoices pending`,
      icon:      Clock,
      color:     'text-amber-400',
      bg:        'bg-amber-500/15',
      filterKey: 'pending',
      ringColor: 'ring-amber-400',
    },
    {
      label:     'Overdue',
      value:     String(summary?.overdueCount ?? 0),
      sub:       'payments past due',
      icon:      AlertCircle,
      color:     'text-red-400',
      bg:        'bg-red-500/15',
      filterKey: 'overdue',
      ringColor: 'ring-red-400',
    },
  ];

  function handleCardClick(key: FilterKey) {
    // Toggle off → back to default view
    setActiveFilter(prev => prev === key ? 'all' : key);
  }

  return (
    <div className="page-content">
      <Header
        title="Payment Dashboard"
        subtitle="Financial overview"
        actions={
          <Link to="/payments/log" className="btn-primary flex items-center gap-2">
            <Plus className="h-4 w-4" /> New Payment
          </Link>
        }
      />

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        {cards.map(({ label, value, sub, icon: Icon, color, bg, filterKey, ringColor }) => {
          const isActive = activeFilter === filterKey;
          return (
            <button
              key={label}
              type="button"
              onClick={() => handleCardClick(filterKey)}
              className={clsx(
                'stat-card text-left w-full transition-all duration-150',
                'hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:shadow-sm',
                'cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
                isActive && ['ring-2', ringColor, 'shadow-md'],
              )}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">{label}</p>
                  <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
                  {sub && <p className="text-xs text-ink-400 mt-0.5">{sub}</p>}
                  {isActive && (
                    <p className="mt-2 text-[10px] font-medium text-ink-400 uppercase tracking-wide">
                      Showing below ↓
                    </p>
                  )}
                </div>
                <div className={`${bg} rounded-xl p-2.5 flex-shrink-0`}>
                  <Icon className={`h-5 w-5 ${color}`} />
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* ── Filtered view (any non-default card is active) ───────────────────── */}
      {activeFilter !== 'all' ? (
        <div className="card mt-8">
          <div className="card-header flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink-100">{FILTER_LABEL[activeFilter]}</h3>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setActiveFilter('all')}
                className="text-xs text-ink-400 hover:text-ink-200 underline underline-offset-2"
              >
                Clear filter
              </button>
              <Link to="/payments/log" className="text-xs text-brand-400 hover:underline flex items-center gap-1">
                Full log <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>

          {filteredLoading ? (
            <div className="p-6 space-y-3">
              {[...Array(4)].map((_, i) => <div key={i} className="skeleton h-10 rounded" />)}
            </div>
          ) : filteredPayments.length === 0 ? (
            <div className="empty-state py-10">
              <DollarSign className="h-8 w-8 text-ink-500 mx-auto mb-2" />
              <p className="text-ink-400 text-sm">No payments match this filter</p>
            </div>
          ) : (
            <div className="card-body p-0 overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Project</th>
                    <th>Period</th>
                    <th>Invoice #</th>
                    <th className="text-right">Gross</th>
                    <th className="text-right">Net Paid</th>
                    <th>Due / Paid Date</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPayments.map((p) => {
                    const project = p.projectId as any;
                    return (
                      <tr key={p._id}>
                        <td className="font-medium text-ink-100 min-w-[120px]">
                          {project?.name ?? '—'}
                        </td>
                        <td className="text-ink-300">{p.invoiceMonth}</td>
                        <td className="text-xs text-ink-400">{p.invoiceNumber || '—'}</td>
                        <td className="text-right font-mono text-sm text-ink-200">
                          {fmtCurrency(p.grossAmount, p.currency)}
                        </td>
                        <td className="text-right font-mono text-sm font-semibold text-ink-100">
                          {fmtCurrency(p.netAmount, p.currency)}
                        </td>
                        <td className="text-sm text-ink-300">
                          {new Date(p.paymentDate).toLocaleDateString()}
                        </td>
                        <td>
                          <span className={STATUS_BADGE[p.status] ?? 'badge badge-gray'}>
                            {p.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

      ) : (
        /* ── Default two-column layout (unchanged) ────────────────────────── */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
          {/* Overdue payments */}
          {overdue.length > 0 && (
            <div className="card">
              <div className="card-header flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-red-400" />
                  <h3 className="text-sm font-semibold text-ink-100">Overdue Payments</h3>
                </div>
                <Link to="/payments/log?status=overdue" className="text-xs text-brand-400 hover:underline flex items-center gap-1">
                  View all <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
              <div className="card-body p-0">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Project</th>
                      <th>Period</th>
                      <th className="text-right">Amount</th>
                      <th>Due Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overdue.map((p) => {
                      const project = p.projectId as any;
                      return (
                        <tr key={p._id}>
                          <td className="font-medium text-ink-100 min-w-[100px]">
                            {project?.name ?? '—'}
                          </td>
                          <td className="text-ink-300">{p.invoiceMonth}</td>
                          <td className="text-right font-mono text-red-400 font-semibold">
                            {fmtCurrency(p.grossAmount, p.currency)}
                          </td>
                          <td className="text-red-400 text-xs">
                            {new Date(p.paymentDate).toLocaleDateString()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Recent payments */}
          <div className="card">
            <div className="card-header flex items-center justify-between">
              <h3 className="text-sm font-semibold text-ink-100">Recent Payments</h3>
              <Link to="/payments/log" className="text-xs text-brand-400 hover:underline flex items-center gap-1">
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            {recent.length === 0 ? (
              <div className="empty-state py-8">
                <DollarSign className="h-8 w-8 text-ink-500 mx-auto mb-2" />
                <p className="text-ink-400 text-sm">No payments recorded yet</p>
                <Link to="/payments/log" className="btn-primary mt-3 text-xs inline-flex items-center gap-1">
                  <Plus className="h-3 w-3" /> Record payment
                </Link>
              </div>
            ) : (
              <div className="card-body p-0">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Project</th>
                      <th>Period</th>
                      <th className="text-right">Net Paid</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent.map((p) => {
                      const project = p.projectId as any;
                      return (
                        <tr key={p._id}>
                          <td className="font-medium text-ink-100 min-w-[100px]">
                            {project?.name ?? '—'}
                          </td>
                          <td className="text-ink-300">{p.invoiceMonth}</td>
                          <td className="text-right font-mono font-semibold text-ink-100">
                            {fmtCurrency(p.netAmount, p.currency)}
                          </td>
                          <td>
                            <span className={STATUS_BADGE[p.status] ?? 'badge badge-gray'}>
                              {p.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}