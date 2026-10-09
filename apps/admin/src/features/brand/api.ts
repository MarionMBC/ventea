import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { brandSchema, type Brand, type UpdateBrandInput } from '@ventea/shared';

import { useApi } from '@/app/services';
import { TENANT_QUERY_KEY } from '@/app/tenant';

export const BRAND_QUERY_KEY = ['staff-brand'] as const;

/** Mi marca (`GET /api/staff/brand`): solo el dueño. */
export function useBrand(enabled = true) {
  const client = useApi();
  return useQuery({
    queryKey: BRAND_QUERY_KEY,
    enabled,
    queryFn: ({ signal }) => client.request<Brand>('/staff/brand', { schema: brandSchema, signal }),
  });
}

/**
 * Guardar la marca o pedir la app: la respuesta es la marca actualizada. También se recarga
 * `GET /api/tenant`, que viste al panel (y a la app) con los colores y el logo nuevos.
 */
function useBrandMutation<TVars>(run: (vars: TVars) => Promise<Brand>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: async (brand) => {
      queryClient.setQueryData(BRAND_QUERY_KEY, brand);
      await queryClient.invalidateQueries({ queryKey: TENANT_QUERY_KEY });
    },
  });
}

export function useUpdateBrand() {
  const client = useApi();
  return useBrandMutation((patch: UpdateBrandInput) =>
    client.request<Brand>('/staff/brand', { method: 'PATCH', body: patch, schema: brandSchema }),
  );
}

export function useRequestApp() {
  const client = useApi();
  return useBrandMutation(() =>
    client.request<Brand>('/staff/brand/app-request', { method: 'POST', schema: brandSchema }),
  );
}
