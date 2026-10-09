import { ConflictException, ForbiddenException, type ArgumentsHost } from '@nestjs/common';

import { HttpExceptionFilter } from '@/common/filters/http-exception.filter';

/** Cuerpo que el filtro le manda al cliente para una excepción. */
function bodyOf(exception: unknown): Record<string, unknown> {
  let sent: Record<string, unknown> = {};
  const response = {
    status: () => response,
    json: (body: Record<string, unknown>) => {
      sent = body;
      return response;
    },
  };
  const host = {
    switchToHttp: () => ({ getResponse: () => response }),
  } as unknown as ArgumentsHost;
  new HttpExceptionFilter().catch(exception, host);
  return sent;
}

describe('HttpExceptionFilter', () => {
  it('límite de plan: pasa code y limit para que el cliente traduzca', () => {
    const body = bodyOf(
      new ForbiddenException({
        message: 'El plan Básico permite hasta 1 sucursal activa',
        code: 'plan_limit',
        limit: { resource: 'locations', plan: 'basic', planName: 'Básico', max: 1 },
      }),
    );
    expect(body).toEqual({
      statusCode: 403,
      message: 'El plan Básico permite hasta 1 sucursal activa',
      error: 'Forbidden',
      code: 'plan_limit',
      limit: { resource: 'locations', plan: 'basic', planName: 'Básico', max: 1 },
    });
  });

  it('un code desconocido o un limit mal formado no llegan al cliente', () => {
    expect(
      bodyOf(new ConflictException({ message: 'x', code: 'otro', limit: { resource: 'x' } })),
    ).toEqual({ statusCode: 409, message: 'x', error: 'Conflict' });
    expect(
      bodyOf(new ConflictException({ message: 'x', code: 'plan_limit', limit: { max: 'mucho' } })),
    ).toEqual({ statusCode: 409, message: 'x', error: 'Conflict' });
  });

  it('error común: sin code', () => {
    expect(bodyOf(new ForbiddenException('Tu rol no permite esta acción'))).toEqual({
      statusCode: 403,
      message: 'Tu rol no permite esta acción',
      error: 'Forbidden',
    });
  });
});
