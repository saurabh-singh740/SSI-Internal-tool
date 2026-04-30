import { DealStage } from '../../types';

export interface StageConfig {
  label:       string;
  color:       string;       // text/border accent
  bg:          string;       // card badge background
  dot:         string;       // inline circle colour
}

export const STAGE_ORDER: DealStage[] = [
  'LEAD', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST',
];

export const STAGE_CONFIG: Record<DealStage, StageConfig> = {
  LEAD:        { label: 'Lead',        color: '#94a3b8', bg: 'rgba(148,163,184,0.12)', dot: '#94a3b8' },
  QUALIFIED:   { label: 'Qualified',   color: '#60a5fa', bg: 'rgba(96,165,250,0.12)',  dot: '#60a5fa' },
  PROPOSAL:    { label: 'Proposal',    color: '#a78bfa', bg: 'rgba(167,139,250,0.12)', dot: '#a78bfa' },
  NEGOTIATION: { label: 'Negotiation', color: '#fbbf24', bg: 'rgba(251,191,36,0.12)',  dot: '#fbbf24' },
  WON:         { label: 'Won',         color: '#34d399', bg: 'rgba(52,211,153,0.12)',  dot: '#34d399' },
  LOST:        { label: 'Lost',        color: '#f87171', bg: 'rgba(248,113,113,0.12)', dot: '#f87171' },
};

export const PRIORITY_COLOR: Record<string, string> = {
  LOW:      '#94a3b8',
  MEDIUM:   '#60a5fa',
  HIGH:     '#fbbf24',
  CRITICAL: '#f87171',
};

export const CURRENCY_SYMBOL: Record<string, string> = {
  USD: '$',
  INR: '₹',
  EUR: '€',
};

export function formatDealValue(value: number, currency: string): string {
  const sym = CURRENCY_SYMBOL[currency] ?? currency;
  if (value >= 1_000_000) return `${sym}${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000)     return `${sym}${(value / 1_000).toFixed(0)}K`;
  return `${sym}${value}`;
}

export function daysUntil(dateStr?: string): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}
