import type { BillingAddress, PaymentCard } from '@ventea/shared';

import {
  classifyPaymentStatus,
  establishSaleBody,
  mapSaleReply,
  mapStatusReply,
  mapTokenizeReply,
  recurringSaleBody,
} from '@/modules/billing/gateway/ms-payments.mapper';
import { MsPaymentsGateway } from '@/modules/billing/gateway/ms-payments.gateway';
import { GatewayError } from '@/modules/billing/gateway/payment-gateway';

/*
 * Contrato con ms-payments (AC7). Las respuestas son las del README de ms-payments y de su
 * borde HTTP (`src/http/payments.controller.ts`, `src/http/middlewares/error.ts`,
 * `src/core/errors.ts`), no inventadas.
 */

const CARD: PaymentCard = {
  number: '4111111111111111',
  expiryMonth: '12',
  expiryYear: '2031',
  cvv: '123',
  holder: 'Ana Pérez',
};
const BILLING: BillingAddress = { country: 'HN', city: 'Tegucigalpa' };
const AMOUNT = { amountCents: 2500, currency: 'USD' };

// README §Ejemplo: venta aprobada.
const README_APPROVED = {
  success: true,
  data: {
    status: 'approved',
    transactionId: 'uuid-de-pixelpay',
    orderId: 'ord-1001',
    amount: { amountMinor: 12345, currency: 'HNL' },
  },
};
// README §CyberSource: un rechazo NO es un error HTTP (200 + data.status declined).
const DECLINED_200 = {
  success: true,
  data: {
    status: 'declined',
    transactionId: '7000000000000001',
    providerCode: 'INSUFFICIENT_FUND',
    message: 'Decline - Insufficient funds in the account.',
  },
};
// README §Errores: provider_timeout = estado indeterminado (504).
const PROVIDER_TIMEOUT = {
  success: false,
  code: 'provider_timeout',
  message: 'El procesador no respondió a tiempo',
};

describe('classifyPaymentStatus (estados de ms-payments)', () => {
  it.each(['approved', 'captured', 'authorized'])('%s → approved', (status) => {
    expect(classifyPaymentStatus(status)).toBe('approved');
  });
  it.each(['declined', 'failed', 'voided'])('%s → declined', (status) => {
    expect(classifyPaymentStatus(status)).toBe('declined');
  });
  it.each(['pending', 'unknown', 'algo_nuevo', undefined])('%s → unknown', (status) => {
    expect(classifyPaymentStatus(status)).toBe('unknown');
  });
});

describe('mapSaleReply', () => {
  it('approved del README → approved con transactionId', () => {
    expect(mapSaleReply({ status: 200, body: README_APPROVED })).toMatchObject({
      status: 'approved',
      transactionId: 'uuid-de-pixelpay',
    });
  });

  it('declined con HTTP 200 → rechazo con el motivo del banco', () => {
    expect(mapSaleReply({ status: 200, body: DECLINED_200 })).toEqual({
      status: 'declined',
      transactionId: '7000000000000001',
      networkTransactionId: undefined,
      providerCode: 'INSUFFICIENT_FUND',
      message: 'Decline - Insufficient funds in the account.',
    });
  });

  it('failed con HTTP 200 → rechazo', () => {
    const body = { success: true, data: { status: 'failed', transactionId: 't-1' } };
    expect(mapSaleReply({ status: 200, body }).status).toBe('declined');
  });

  it('pending con HTTP 200 → desconocido, conserva el transactionId para consultar', () => {
    const body = { success: true, data: { status: 'pending', transactionId: 't-2' } };
    expect(mapSaleReply({ status: 200, body })).toMatchObject({
      status: 'unknown',
      transactionId: 't-2',
    });
  });

  it('provider_timeout (504) → desconocido, sin transactionId', () => {
    const result = mapSaleReply({ status: 504, body: PROVIDER_TIMEOUT });
    expect(result.status).toBe('unknown');
    expect(result.transactionId).toBeUndefined();
  });

  it('declined (402) → rechazo con providerCode', () => {
    const body = {
      success: false,
      code: 'declined',
      message: 'Tarjeta rechazada',
      providerCode: 'EXPIRED_CARD',
    };
    expect(mapSaleReply({ status: 402, body })).toMatchObject({
      status: 'declined',
      providerCode: 'EXPIRED_CARD',
    });
  });

  it.each(['SERVER_TIMEOUT', 'SERVICE_TIMEOUT', 'PROCESSOR_TIMEOUT', undefined])(
    'provider_error (502) con motivo %s → desconocido (pudo cobrar: consultar, no recobrar)',
    (providerCode) => {
      const body = { success: false, code: 'provider_error', message: 'Falla', providerCode };
      expect(mapSaleReply({ status: 502, body }).status).toBe('unknown');
    },
  );

  it('502/504 de un proxy sin JSON → desconocido', () => {
    expect(mapSaleReply({ status: 502, body: null }).status).toBe('unknown');
    expect(mapSaleReply({ status: 504, body: '<html>' }).status).toBe('unknown');
  });

  it('aprobado: devuelve monto, orderId y marca la autorización parcial para verificarlos', () => {
    const body = {
      success: true,
      data: {
        status: 'authorized',
        transactionId: 't-9',
        orderId: 'sub-x-a1',
        amount: { amountMinor: 3000, currency: 'USD' },
        providerCode: 'PARTIAL_AUTHORIZED',
      },
    };
    expect(mapSaleReply({ status: 200, body })).toMatchObject({
      status: 'approved',
      orderId: 'sub-x-a1',
      approvedAmount: { amountCents: 3000, currency: 'USD' },
      partial: true,
    });
  });

  it('500 sin JSON de un proxy → desconocido (pudo haber cobrado)', () => {
    expect(mapSaleReply({ status: 500, body: null }).status).toBe('unknown');
  });

  it('invalid_request (400) → GatewayError invalid (no llegó al procesador)', () => {
    const body = { success: false, code: 'invalid_request', message: 'Campo faltante: orderId' };
    expect(() => mapSaleReply({ status: 400, body })).toThrow(
      expect.objectContaining({ kind: 'invalid' }),
    );
  });

  it.each([
    [401, { success: false, error: 'Unauthorized internal service request' }],
    [503, { success: false, error: 'Service misconfigured: INTERNAL_SERVICE_KEY is not set.' }],
    [501, { success: false, code: 'provider_not_configured', message: 'Sin proveedor' }],
    [429, null],
  ])('%s → GatewayError unavailable (no llegó al procesador)', (status, body) => {
    expect(() => mapSaleReply({ status, body })).toThrow(GatewayError);
    expect(() => mapSaleReply({ status, body })).toThrow(
      expect.objectContaining({ kind: 'unavailable' }),
    );
  });
});

describe('mapStatusReply', () => {
  it('approved → approved', () => {
    expect(mapStatusReply({ status: 200, body: README_APPROVED }).status).toBe('approved');
  });

  it('404 not_found → desconocido (TSS indexa con retraso)', () => {
    const body = { success: false, code: 'not_found', message: 'No existe' };
    expect(mapStatusReply({ status: 404, body }).status).toBe('unknown');
  });

  it('provider_timeout → desconocido', () => {
    expect(mapStatusReply({ status: 504, body: PROVIDER_TIMEOUT }).status).toBe('unknown');
  });
});

describe('mapTokenizeReply', () => {
  it('token, marca y últimos 4', () => {
    const body = {
      success: true,
      data: { token: '7030400005745733092', cardBrand: 'visa', cardLast4: '1111' },
    };
    expect(mapTokenizeReply({ status: 200, body })).toEqual({
      token: '7030400005745733092',
      cardBrand: 'visa',
      cardLast4: '1111',
    });
  });

  it('declined → rechazo, sin token', () => {
    const body = { success: false, code: 'declined', message: 'Tarjeta inválida' };
    expect(mapTokenizeReply({ status: 402, body }).declined?.status).toBe('declined');
  });

  it('timeout al tokenizar → error (tokenizar no mueve dinero: se reintenta)', () => {
    expect(() => mapTokenizeReply({ status: 504, body: PROVIDER_TIMEOUT })).toThrow(
      expect.objectContaining({ kind: 'unavailable' }),
    );
  });
});

describe('storedCredential (README §Cobros recurrentes)', () => {
  it('establish: con CVV, vencimiento y usage "establish"', () => {
    const body = establishSaleBody('tok-1', CARD, BILLING, AMOUNT, 'est-1');
    expect(body).toMatchObject({
      orderId: 'est-1',
      amount: { amountMinor: 2500, currency: 'USD' },
      token: 'tok-1',
      cvv: '123',
      expiryMonth: '12',
      expiryYear: '2031',
      storedCredential: { usage: 'establish' },
    });
    expect(body).not.toHaveProperty('card'); // el PAN viaja solo en /tokenize
  });

  it('recurring: sin CVV y anclado al networkTransactionId del establish', () => {
    const body = recurringSaleBody({
      token: 'tok-1',
      initialTransactionId: '346263724783832',
      expMonth: 3,
      expYear: 2031,
      amount: AMOUNT,
      orderId: 'sub-x-a1',
    });
    expect(body).toEqual({
      orderId: 'sub-x-a1',
      amount: { amountMinor: 2500, currency: 'USD' },
      token: 'tok-1',
      expiryMonth: '03',
      expiryYear: '2031',
      description: 'Suscripción Ventea',
      storedCredential: { usage: 'recurring', initialTransactionId: '346263724783832' },
    });
    expect(body).not.toHaveProperty('cvv');
  });
});

describe('MsPaymentsGateway (HTTP)', () => {
  const config = {
    url: 'https://payments.test/',
    key: 'clave-interna-de-prueba',
    provider: 'cybersource',
    timeoutMs: 1000,
  };
  // `fetch` falso: cola de respuestas y registro de llamadas (sin red real).
  const realFetch = globalThis.fetch;
  let calls: [string, RequestInit | undefined][];
  let queue: (() => Promise<Response>)[];

  const reply = (status: number, body: unknown) => () =>
    Promise.resolve(new Response(JSON.stringify(body), { status }));
  const fail = (error: unknown) => () => Promise.reject(error);

  beforeEach(() => {
    calls = [];
    queue = [];
    globalThis.fetch = ((url: string | URL | Request, init?: RequestInit) => {
      calls.push([String(url), init]);
      const next = queue.shift();
      if (!next) throw new Error('fetch inesperado');
      return next();
    }) as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('alta: tokenize y sale establish, con la clave interna y el proveedor en headers', async () => {
    queue.push(
      reply(200, { success: true, data: { token: 'tok-9', cardBrand: 'visa' } }),
      reply(200, {
        success: true,
        data: {
          status: 'approved',
          transactionId: 'tx-1',
          networkTransactionId: '346263724783832',
        },
      }),
    );

    const result = await new MsPaymentsGateway(config).tokenizeAndEstablish(
      CARD,
      BILLING,
      AMOUNT,
      'est-1',
    );

    expect(result).toMatchObject({
      status: 'approved',
      token: 'tok-9',
      networkTransactionId: '346263724783832',
      cardLast4: '1111', // CyberSource no los devuelve: salen del PAN en memoria
    });
    const [tokenizeUrl, tokenizeInit] = calls[0]!;
    const [saleUrl, saleInit] = calls[1]!;
    expect(tokenizeUrl).toBe('https://payments.test/api/payments/tokenize');
    expect(saleUrl).toBe('https://payments.test/api/payments/sale');
    expect(tokenizeInit?.headers).toMatchObject({
      'X-Internal-Service-Key': 'clave-interna-de-prueba',
      'X-Payment-Provider': 'cybersource',
    });
    const sale = JSON.parse(String(saleInit?.body)) as Record<string, unknown>;
    expect(sale).toMatchObject({ token: 'tok-9', storedCredential: { usage: 'establish' } });
    expect(JSON.stringify(sale)).not.toContain(CARD.number);
  });

  it('timeout de nuestro lado en un cobro → desconocido (nunca error que invite a recobrar)', async () => {
    queue.push(fail(new DOMException('timeout', 'TimeoutError')));
    const result = await new MsPaymentsGateway(config).chargeRecurring({
      token: 'tok-9',
      initialTransactionId: 'nt-1',
      expMonth: 12,
      expYear: 2031,
      amount: AMOUNT,
      orderId: 'sub-1-a1',
    });
    expect(result.status).toBe('unknown');
  });

  it('conexión rechazada → unavailable (no salió nada)', async () => {
    queue.push(
      fail(Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } })),
    );
    await expect(
      new MsPaymentsGateway(config).chargeRecurring({
        token: 'tok-9',
        initialTransactionId: 'nt-1',
        expMonth: null,
        expYear: null,
        amount: AMOUNT,
        orderId: 'sub-1-a1',
      }),
    ).rejects.toMatchObject({ kind: 'unavailable' });
  });

  it('status sin transactionId → desconocido sin llamar (ms-payments consulta solo por id)', async () => {
    const result = await new MsPaymentsGateway(config).status({ orderId: 'sub-1-a1' });
    expect(result.status).toBe('unknown');
    expect(calls).toHaveLength(0);
  });

  it('status con transactionId → POST /status', async () => {
    queue.push(reply(200, README_APPROVED));
    const result = await new MsPaymentsGateway(config).status({
      orderId: 'sub-1-a1',
      transactionId: 'uuid-de-pixelpay',
    });
    expect(result.status).toBe('approved');
    expect(JSON.parse(String(calls[0]![1]?.body))).toEqual({
      transactionId: 'uuid-de-pixelpay',
    });
  });
});
