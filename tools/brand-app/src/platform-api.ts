import type { BuildConfig, PlatformApp, UpdatePlatformAppInput } from '@ventea/shared';

import { parseBuildConfig } from './config';
import { apiBase, apiError, type Fetch } from './http';

/**
 * Cliente de la plataforma para el generador. El token de administrador va solo en el header
 * `Authorization`; ningún mensaje de error ni log lo contiene.
 */
export class PlatformApi {
  private readonly base: string;

  constructor(
    origin: string,
    private readonly token: string,
    private readonly fetchImpl: Fetch = fetch,
  ) {
    if (!token) throw new Error('Falta el token de plataforma (VENTEA_PLATFORM_TOKEN)');
    this.base = apiBase(origin);
  }

  async buildConfig(slug: string): Promise<BuildConfig> {
    const response = await this.request(
      'GET',
      `/platform/tenants/${encodeURIComponent(slug)}/app/build-config`,
    );
    if (!response.ok) throw await apiError(response, `build-config de ${slug}`);
    return parseBuildConfig(await response.json());
  }

  async updateApp(slug: string, input: UpdatePlatformAppInput): Promise<PlatformApp> {
    const response = await this.request(
      'PATCH',
      `/platform/tenants/${encodeURIComponent(slug)}/app`,
      input,
    );
    if (!response.ok) throw await apiError(response, `actualizar la app de ${slug}`);
    return (await response.json()) as PlatformApp;
  }

  private request(method: string, route: string, body?: unknown): Promise<Response> {
    return this.fetchImpl(`${this.base}${route}`, {
      method,
      headers: {
        authorization: `Bearer ${this.token}`,
        accept: 'application/json',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'error',
      signal: AbortSignal.timeout(30_000),
    });
  }
}
