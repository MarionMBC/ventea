import { jest } from '@jest/globals';
import { NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

import {
  TENANT_READY_CACHE_MS,
  TENANT_READY_TIMEOUT_MS,
  TenantReadyService,
  type TenantReadyFetch,
} from '@/modules/platform/tenant-ready.service';
import type { PrismaClientExtended } from '@/prisma/prisma.client';

const config = { get: (key: string) => (key === 'TENANT_BASE_DOMAIN' ? 'ventea.tech' : undefined) };

function service(fetchImpl: TenantReadyFetch, tenants: Record<string, boolean> = { pollos: true }) {
  const prisma = {
    tenant: {
      findUnique: jest.fn(({ where }: { where: { slug: string } }) =>
        Promise.resolve(where.slug in tenants ? { isActive: tenants[where.slug] } : null),
      ),
    },
  } as unknown as PrismaClientExtended;
  return new TenantReadyService(prisma, config as unknown as ConfigService, fetchImpl);
}

describe('TenantReadyService (sonda HTTPS de la marca recién creada)', () => {
  it('listo: GET https://<slug>.<dominio>/api/health con timeout de 3 s y sin seguir redirecciones', async () => {
    const fetchImpl = jest.fn(() => Promise.resolve(new Response('{}', { status: 200 })));
    await expect(service(fetchImpl).isReady('pollos')).resolves.toBe(true);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://pollos.ventea.tech/api/health');
    expect(init.redirect).toBe('manual');
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(TENANT_READY_TIMEOUT_MS).toBe(3000);
  });

  it('descarta el cuerpo de la respuesta (libera la conexión)', async () => {
    const response = new Response('{"status":"ok"}', { status: 200 });
    const cancel = jest.spyOn(response.body!, 'cancel');
    await expect(service(() => Promise.resolve(response)).isReady('pollos')).resolves.toBe(true);
    expect(cancel).toHaveBeenCalled();
  });

  it('no listo: respuesta que no es 2xx (ruta todavía sin publicar)', async () => {
    const fetchImpl = jest.fn(() => Promise.resolve(new Response('', { status: 404 })));
    await expect(service(fetchImpl).isReady('pollos')).resolves.toBe(false);
  });

  it('no listo: certificado inválido (error de red de fetch)', async () => {
    const tlsError = Object.assign(new TypeError('fetch failed'), {
      cause: { code: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' },
    });
    const fetchImpl = jest.fn(() => Promise.reject(tlsError));
    await expect(service(fetchImpl).isReady('pollos')).resolves.toBe(false);
  });

  it('no listo: timeout', async () => {
    const fetchImpl = jest.fn(() =>
      Promise.reject(new DOMException('The operation was aborted due to timeout', 'TimeoutError')),
    );
    await expect(service(fetchImpl).isReady('pollos')).resolves.toBe(false);
  });

  it('cache de 10 s por slug: el polling no repite la sonda; pasado el plazo vuelve a probar', async () => {
    let ok = false;
    const fetchImpl = jest.fn(() => Promise.resolve(new Response('', { status: ok ? 200 : 502 })));
    const ready = service(fetchImpl);
    const t0 = 1_000_000;

    await expect(ready.isReady('pollos', t0)).resolves.toBe(false);
    ok = true;
    await expect(ready.isReady('pollos', t0 + 5_000)).resolves.toBe(false); // cacheado
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    await expect(ready.isReady('pollos', t0 + TENANT_READY_CACHE_MS)).resolves.toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('marca inexistente o dada de baja → 404, sin sonda (no hay hosts arbitrarios)', async () => {
    const fetchImpl = jest.fn(() => Promise.resolve(new Response('', { status: 200 })));
    const ready = service(fetchImpl, { pollos: true, baja: false });
    await expect(ready.isReady('otra')).rejects.toBeInstanceOf(NotFoundException);
    await expect(ready.isReady('baja')).rejects.toBeInstanceOf(NotFoundException);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
