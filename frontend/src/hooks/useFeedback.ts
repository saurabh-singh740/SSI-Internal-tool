import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/axios';
import { Feedback, FeedbackStats, MyFeedbackSummary } from '../types';

// ── Query key factory ─────────────────────────────────────────────────────────

export const feedbackKeys = {
  all:      () => ['feedback'] as const,
  list:     (f: Record<string, unknown>) => ['feedback', 'list', f] as const,
  my:       (cursor?: string)  => ['feedback', 'my', cursor] as const,
  received: (cursor?: string)  => ['feedback', 'received', cursor] as const,
  stats:    ()                 => ['feedback', 'stats'] as const,
  detail:   (id: string)       => ['feedback', 'detail', id] as const,
};

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FeedbackListParams {
  status?:           string;
  projectId?:        string;
  period?:           string;
  search?:           string;
  sentiment?:        string;
  followUpRequired?: boolean;
  from?:             string;
  to?:               string;
  cursor?:           string;
  limit?:            number;
}

export interface FeedbackListResult {
  items:      Feedback[];
  hasMore:    boolean;
  nextCursor: string | null;
}

export interface MyFeedbackResult extends FeedbackListResult {
  summary: MyFeedbackSummary;
}

// ── Queries ───────────────────────────────────────────────────────────────────

export function useFeedbackList(params: FeedbackListParams) {
  return useQuery<FeedbackListResult>({
    queryKey: feedbackKeys.list(params as Record<string, unknown>),
    queryFn: () => {
      const q = new URLSearchParams();
      if (params.status)           q.set('status',           params.status);
      if (params.projectId)        q.set('projectId',        params.projectId);
      if (params.period)           q.set('period',           params.period);
      if (params.search)           q.set('search',           params.search);
      if (params.sentiment)        q.set('sentiment',        params.sentiment);
      if (params.followUpRequired) q.set('followUpRequired', 'true');
      if (params.from)             q.set('from',             params.from);
      if (params.to)               q.set('to',               params.to);
      if (params.cursor)           q.set('cursor',           params.cursor);
      if (params.limit)            q.set('limit',            String(params.limit));
      return api.get(`/feedback?${q}`).then(r => r.data);
    },
    staleTime: 30_000,
  });
}

export function useMyFeedback(cursor?: string) {
  return useQuery<MyFeedbackResult>({
    queryKey: feedbackKeys.my(cursor),
    queryFn: () => {
      const q = cursor ? `?cursor=${cursor}` : '';
      return api.get(`/feedback/my${q}`).then(r => r.data);
    },
    staleTime: 30_000,
  });
}

export function useReceivedFeedback(cursor?: string) {
  return useQuery<FeedbackListResult>({
    queryKey: feedbackKeys.received(cursor),
    queryFn: () => {
      const q = cursor ? `?cursor=${cursor}` : '';
      return api.get(`/feedback/received${q}`).then(r => r.data);
    },
    staleTime: 30_000,
  });
}

export function useFeedbackStats() {
  return useQuery<{ stats: FeedbackStats }>({
    queryKey: feedbackKeys.stats(),
    queryFn:  () => api.get('/feedback/stats').then(r => r.data),
    staleTime: 60_000,
  });
}

export function useFeedbackDetail(id: string, enabled = true) {
  return useQuery<{ feedback: Feedback }>({
    queryKey: feedbackKeys.detail(id),
    queryFn:  () => api.get(`/feedback/${id}`).then(r => r.data),
    enabled:  enabled && !!id,
    staleTime: 30_000,
  });
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export function useSubmitFeedback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      api.post('/feedback', data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: feedbackKeys.all() });
    },
  });
}

export function useReviewFeedback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; reviewNote?: string; status?: string }) =>
      api.patch(`/feedback/${id}/review`, data).then(r => r.data),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: feedbackKeys.all() });
      qc.invalidateQueries({ queryKey: feedbackKeys.detail(vars.id) });
    },
  });
}

export function useUpdateFeedbackStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/feedback/${id}/status`, { status }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: feedbackKeys.all() }),
  });
}

export function useToggleFollowUp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.patch(`/feedback/${id}/follow-up`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: feedbackKeys.all() }),
  });
}

export function useBulkUpdateStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ids, status }: { ids: string[]; status: string }) =>
      api.patch('/feedback/bulk-status', { ids, status }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: feedbackKeys.all() }),
  });
}

export function useDeleteFeedback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/feedback/${id}`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: feedbackKeys.all() }),
  });
}
