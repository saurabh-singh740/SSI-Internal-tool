import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/axios';
import { DealAttachment, AttachmentCategory } from '../../types';

// ── Query key factory ─────────────────────────────────────────────────────────

export const attachmentKeys = {
  all:  (dealId: string) => ['deals', dealId, 'attachments'] as const,
};

// ── Hooks ─────────────────────────────────────────────────────────────────────

export function useAttachments(dealId: string) {
  return useQuery({
    queryKey: attachmentKeys.all(dealId),
    queryFn:  async () => {
      const { data } = await api.get<{ success: boolean; data: DealAttachment[] }>(
        `/deals/${dealId}/attachments`
      );
      return data.data;
    },
    enabled:   !!dealId,
    staleTime: 30_000,
  });
}

export function useUploadAttachment(dealId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      file,
      category = 'OTHER',
    }: {
      file:      File;
      category?: AttachmentCategory;
    }) => {
      const form = new FormData();
      form.append('file',     file);
      form.append('category', category);
      const { data } = await api.post<{ success: boolean; data: DealAttachment }>(
        `/deals/${dealId}/attachments`,
        form,
        { headers: { 'Content-Type': undefined } }  // let browser set multipart boundary
      );
      return data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: attachmentKeys.all(dealId) }),
  });
}

export function useDeleteAttachment(dealId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (attachmentId: string) => {
      await api.delete(`/deals/${dealId}/attachments/${attachmentId}`);
      return attachmentId;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: attachmentKeys.all(dealId) }),
  });
}
