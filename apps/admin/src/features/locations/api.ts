import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  staffLocationSchema,
  staffLocationsSchema,
  type CreateLocationInput,
  type StaffLocation,
  type StaffLocations,
  type UpdateLocationInput,
} from '@ventea/shared';

import { useApi } from '@/app/services';

export const LOCATIONS_QUERY_KEY = ['staff-locations'] as const;

/** Sucursales de la marca con el cupo del plan (`GET /api/staff/locations`). */
export function useStaffLocations() {
  const client = useApi();
  return useQuery({
    queryKey: LOCATIONS_QUERY_KEY,
    queryFn: ({ signal }) =>
      client.request<StaffLocations>('/staff/locations', { schema: staffLocationsSchema, signal }),
  });
}

/** Alta, edición o borrado: al terminar (bien o mal) se recarga la lista y el cupo. */
function useLocationsMutation<TVars, TResult>(run: (vars: TVars) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSettled: () => queryClient.invalidateQueries({ queryKey: LOCATIONS_QUERY_KEY }),
  });
}

export function useSaveLocation() {
  const client = useApi();
  return useLocationsMutation(
    ({ id, body }: { id?: string; body: CreateLocationInput | UpdateLocationInput }) =>
      client.request<StaffLocation>(
        id ? `/staff/locations/${encodeURIComponent(id)}` : '/staff/locations',
        { method: id ? 'PATCH' : 'POST', body, schema: staffLocationSchema },
      ),
  );
}

export function useDeleteLocation() {
  const client = useApi();
  return useLocationsMutation((id: string) =>
    client.request<void>(`/staff/locations/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  );
}
