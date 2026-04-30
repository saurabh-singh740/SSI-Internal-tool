import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/axios';
import { TimesheetPreviewResult, User } from '../../types';

// ── Query key factory ─────────────────────────────────────────────────────────

export const resourcePlanKeys = {
  engineers: ['users', 'engineers'] as const,
};

// ── Engineers list (for dropdown) ─────────────────────────────────────────────

export function useEngineers() {
  return useQuery<User[]>({
    queryKey: resourcePlanKeys.engineers,
    queryFn:  () => api.get('/users/engineers').then(r => r.data.users),
    staleTime: 5 * 60_000,
  });
}

// ── Save resource plan ────────────────────────────────────────────────────────

export interface ResourcePlanEntryInput {
  engineer:             string;   // ObjectId string
  role:                 'LEAD_ENGINEER' | 'ENGINEER' | 'REVIEWER';
  allocationPercentage: number;
  startDate?:           string;
  endDate?:             string;
  totalAuthorizedHours?: number;
}

export function useSaveResourcePlan(dealId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (entries: ResourcePlanEntryInput[]) => {
      const { data } = await api.put(`/deals/${dealId}/resource-plan`, { entries });
      return data.data as ResourcePlanEntryInput[];
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deals', dealId] });
    },
  });
}

// ── Live preview — auto-updates on every plan change (debounced, zero DB) ─────
//
// Call this with the current in-memory planRows. It posts the entries
// directly to the stateless POST endpoint — no save required first.
// Preview fires 400 ms after the last change so it doesn't hammer the server.

export function useLiveTimesheetPreview(entries: ResourcePlanEntryInput[]) {
  const [preview, setPreview]     = useState<TimesheetPreviewResult | null>(null);
  const [loading, setLoading]     = useState(false);
  const [error,   setError]       = useState<string | null>(null);
  const timerRef                  = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Entries that are complete enough to simulate (need engineer + both dates)
  const validEntries = entries.filter(e => e.engineer && e.startDate && e.endDate);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    if (!validEntries.length) {
      setPreview(null);
      return;
    }

    timerRef.current = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const { data } = await api.post<{ success: boolean; data: TimesheetPreviewResult }>(
          '/deals/live-preview',
          { entries: validEntries }
        );
        setPreview(data.data);
      } catch {
        setError('Failed to compute preview');
      } finally {
        setLoading(false);
      }
    }, 400);

    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  // Stringify so React detects deep changes in the array
  }, [JSON.stringify(validEntries)]);   // eslint-disable-line react-hooks/exhaustive-deps

  return { preview, loading, error };
}
