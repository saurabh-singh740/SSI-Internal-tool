import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../api/axios';
import { Deal, DealActivity, DealStage, PipelineData, ConversionOverrides } from '../../types';

// ── Query keys ────────────────────────────────────────────────────────────────

export const dealKeys = {
  all:        ['deals'] as const,
  pipeline:   (f?: object) => [...dealKeys.all, 'pipeline', f ?? {}] as const,
  list:       (f: object) => [...dealKeys.all, 'list', f] as const,
  detail:     (id: string) => [...dealKeys.all, id] as const,
  activities: (id: string) => [...dealKeys.all, id, 'activities'] as const,
};

// ── Queries ───────────────────────────────────────────────────────────────────

export function usePipeline(filter?: { partnerId?: string; search?: string; tag?: string }) {
  return useQuery<PipelineData>({
    queryKey: dealKeys.pipeline(filter),
    queryFn:  () => {
      const params = new URLSearchParams();
      if (filter?.partnerId) params.set('partnerId', filter.partnerId);
      if (filter?.search)    params.set('search',    filter.search);
      if (filter?.tag)       params.set('tag',       filter.tag);
      const qs = params.toString();
      return api.get(`/deals/pipeline${qs ? `?${qs}` : ''}`).then(r => r.data.pipeline);
    },
    staleTime: 30_000,
  });
}

export function useDeal(id: string) {
  return useQuery<Deal>({
    queryKey: dealKeys.detail(id),
    queryFn:  () => api.get(`/deals/${id}`).then(r => r.data.deal),
    enabled:  !!id,
    staleTime: 30_000,
  });
}

export function useDealActivities(dealId: string) {
  return useQuery<{ activities: DealActivity[]; nextCursor: string | null }>({
    queryKey: dealKeys.activities(dealId),
    queryFn:  () => api.get(`/deals/${dealId}/activities?limit=30`).then(r => r.data),
    enabled:  !!dealId,
    staleTime: 15_000,
  });
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export function useCreateDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Deal>) => api.post('/deals', data).then(r => r.data.deal),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: dealKeys.all });
    },
  });
}

export function useUpdateDeal(dealId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Deal>) => api.put(`/deals/${dealId}`, data).then(r => r.data.deal),
    onSuccess: (deal: Deal) => {
      qc.setQueryData(dealKeys.detail(dealId), deal);
      qc.invalidateQueries({ queryKey: dealKeys.pipeline() });
    },
  });
}

export function useChangeDealStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      dealId,
      stage,
      lostReason,
      lostNote,
    }: {
      dealId: string;
      stage: DealStage;
      lostReason?: string;
      lostNote?: string;
    }) =>
      api.patch(`/deals/${dealId}/stage`, { stage, lostReason, lostNote }).then(r => r.data.deal),

    onMutate: async ({ dealId, stage }) => {
      await qc.cancelQueries({ queryKey: ['deals', 'pipeline'] });
      const snapshots = qc.getQueriesData<PipelineData>({ queryKey: ['deals', 'pipeline'] });

      qc.setQueriesData<PipelineData>({ queryKey: ['deals', 'pipeline'] }, old => {
        if (!old) return old;
        let moved: Deal | undefined;
        const next = { ...old } as PipelineData;
        for (const s of Object.keys(next) as DealStage[]) {
          const idx = next[s]?.findIndex(d => d._id === dealId) ?? -1;
          if (idx >= 0) {
            moved = next[s][idx];
            next[s] = next[s].filter(d => d._id !== dealId);
            break;
          }
        }
        if (moved) {
          next[stage] = [{ ...moved, stage }, ...(next[stage] ?? [])];
        }
        return next;
      });

      return { snapshots };
    },

    onError: (_err, _vars, context) => {
      if (context?.snapshots) {
        for (const [key, data] of context.snapshots) {
          qc.setQueryData(key, data);
        }
      }
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey: dealKeys.pipeline() });
      qc.invalidateQueries({ queryKey: dealKeys.all });
    },
  });
}

export function useAddNote(dealId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (note: string) => api.post(`/deals/${dealId}/notes`, { note }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: dealKeys.activities(dealId) });
    },
  });
}

export function useUpdateSOW(dealId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sowSections: Deal['sowSections']) =>
      api.put(`/deals/${dealId}/sow`, { sowSections }).then(r => r.data.deal),
    onSuccess: (deal: Deal) => {
      qc.setQueryData(dealKeys.detail(dealId), deal);
    },
  });
}

export function useConvertDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      dealId,
      overrides,
    }: {
      dealId: string;
      overrides: ConversionOverrides;
    }) =>
      api.post(`/deals/${dealId}/convert`, overrides).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: dealKeys.all });
      qc.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export function useDeleteDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dealId: string) => api.delete(`/deals/${dealId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: dealKeys.all });
    },
  });
}
