import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  platformEmailListSchema,
  platformEmailSchema,
  type EmailStatus,
  type PlatformEmail,
  type PlatformEmailList,
} from '@ventea/shared';

import { usePlatform } from './services';

/** Correos transaccionales (TASK-021): registro de la outbox y reenvío de fallidos. */
export const emailKeys = {
  all: ['platform', 'emails'] as const,
  list: (status: EmailStatus | 'all') => ['platform', 'emails', status] as const,
};

export function usePlatformEmails(status: EmailStatus | 'all') {
  const { client } = usePlatform();
  return useQuery({
    queryKey: emailKeys.list(status),
    queryFn: ({ signal }) =>
      client.request<PlatformEmailList>(
        `/platform/emails?limit=100${status === 'all' ? '' : `&status=${status}`}`,
        { schema: platformEmailListSchema, signal },
      ),
  });
}

export function useResendEmail() {
  const { client } = usePlatform();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      client.request<PlatformEmail>(`/platform/emails/${encodeURIComponent(id)}/resend`, {
        method: 'POST',
        schema: platformEmailSchema,
      }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: emailKeys.all }),
  });
}
