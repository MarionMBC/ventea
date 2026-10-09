import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { salesReportSchema, type ReportGranularity, type SalesReport } from '@ventea/shared';

import { useApi } from '@/app/services';

export interface ReportFilters {
  from?: string;
  to?: string;
  locationId?: string;
  granularity: ReportGranularity;
}

/**
 * Reporte de ventas (`GET /api/staff/reports/sales`). Sin fechas, la API toma los últimos 30
 * días de la marca y las devuelve. Mantiene el reporte anterior mientras llega el nuevo.
 */
export function useSalesReport(filters: ReportFilters) {
  const client = useApi();
  return useQuery({
    queryKey: ['staff-reports', 'sales', filters],
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ granularity: filters.granularity });
      if (filters.from) params.set('from', filters.from);
      if (filters.to) params.set('to', filters.to);
      if (filters.locationId) params.set('locationId', filters.locationId);
      return client.request<SalesReport>(`/staff/reports/sales?${params}`, {
        schema: salesReportSchema,
        signal,
      });
    },
  });
}
