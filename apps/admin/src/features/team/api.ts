import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createdInvitationSchema,
  teamLinkSchema,
  teamSchema,
  type CreateInvitationInput,
  type CreatedInvitation,
  type Team,
  type TeamLink,
  type UpdateMemberInput,
} from '@ventea/shared';

import { useApi } from '@/app/services';

export const TEAM_QUERY_KEY = ['staff-team'] as const;

const enc = encodeURIComponent;

/** Equipo de la marca (`GET /api/staff/team`): solo el dueño. */
export function useTeam(enabled: boolean) {
  const client = useApi();
  return useQuery({
    queryKey: TEAM_QUERY_KEY,
    enabled,
    queryFn: ({ signal }) => client.request<Team>('/staff/team', { schema: teamSchema, signal }),
  });
}

/** Al terminar (bien o mal) se recarga el equipo: el cupo y los estados cambian con todo. */
function useTeamMutation<TVars, TResult>(run: (vars: TVars) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSettled: () => queryClient.invalidateQueries({ queryKey: TEAM_QUERY_KEY }),
  });
}

export function useInvite() {
  const client = useApi();
  return useTeamMutation((body: CreateInvitationInput) =>
    client.request<CreatedInvitation>('/staff/team/invitations', {
      method: 'POST',
      body,
      schema: createdInvitationSchema,
    }),
  );
}

export function useRevokeInvitation() {
  const client = useApi();
  return useTeamMutation((id: string) =>
    client.request<void>(`/staff/team/invitations/${enc(id)}`, { method: 'DELETE' }),
  );
}

export function useUpdateMember() {
  const client = useApi();
  return useTeamMutation(({ id, body }: { id: string; body: UpdateMemberInput }) =>
    client.request<void>(`/staff/team/members/${enc(id)}`, { method: 'PATCH', body }),
  );
}

export function usePasswordReset() {
  const client = useApi();
  return useTeamMutation((id: string) =>
    client.request<TeamLink>(`/staff/team/members/${enc(id)}/password-reset`, {
      method: 'POST',
      schema: teamLinkSchema,
    }),
  );
}
