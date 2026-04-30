import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/axios';
import { Partner } from '../../types';

// ── Query key factory ─────────────────────────────────────────────────────────

export const partnerKeys = {
  all:    ['partners'] as const,
  list:   (filter?: { isActive?: boolean; type?: string }) =>
            [...partnerKeys.all, 'list', filter] as const,
  detail: (id: string) => [...partnerKeys.all, 'detail', id] as const,
};

// ── Hooks ─────────────────────────────────────────────────────────────────────

export function usePartners(filter?: { isActive?: boolean; type?: string }) {
  return useQuery({
    queryKey: partnerKeys.list(filter),
    queryFn:  async () => {
      const params: Record<string, string> = {};
      if (filter?.isActive !== undefined) params.isActive = String(filter.isActive);
      if (filter?.type)                   params.type     = filter.type;
      const { data } = await api.get<{ success: boolean; data: Partner[] }>(
        '/partners', { params }
      );
      return data.data;
    },
    staleTime: 60_000,
  });
}

export function usePartner(id: string) {
  return useQuery({
    queryKey: partnerKeys.detail(id),
    queryFn:  async () => {
      const { data } = await api.get<{ success: boolean; data: Partner }>(`/partners/${id}`);
      return data.data;
    },
    enabled: !!id,
  });
}

export function useCreatePartner() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<Partner>) => {
      const { data } = await api.post<{ success: boolean; data: Partner }>('/partners', payload);
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: partnerKeys.all }),
  });
}

export function useUpdatePartner() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...payload }: Partial<Partner> & { id: string }) => {
      const { data } = await api.put<{ success: boolean; data: Partner }>(`/partners/${id}`, payload);
      return data.data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: partnerKeys.all });
      qc.invalidateQueries({ queryKey: partnerKeys.detail(vars.id) });
    },
  });
}

export function useDeletePartner() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/partners/${id}`);
      return id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: partnerKeys.all }),
  });
}
