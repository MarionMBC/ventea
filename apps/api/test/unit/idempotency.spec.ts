import { hashOrderRequest } from '../../src/modules/orders/idempotency';

const base = {
  locationId: '00000000-0000-4000-8000-000000000001',
  fulfillmentType: 'pickup' as const,
  redeemRewardPoints: 0,
  lines: [
    {
      menuItemId: '00000000-0000-4000-8000-000000000002',
      quantity: 1,
      selectedOptionIds: [
        '00000000-0000-4000-8000-00000000000a',
        '00000000-0000-4000-8000-00000000000b',
      ],
    },
  ],
};

describe('hashOrderRequest', () => {
  it('no depende del orden de las opciones de una línea', () => {
    const swapped = {
      ...base,
      lines: [
        { ...base.lines[0]!, selectedOptionIds: [...base.lines[0]!.selectedOptionIds].reverse() },
      ],
    };
    expect(hashOrderRequest(swapped)).toBe(hashOrderRequest(base));
  });

  it('cambia si cambia la cantidad', () => {
    const more = { ...base, lines: [{ ...base.lines[0]!, quantity: 2 }] };
    expect(hashOrderRequest(more)).not.toBe(hashOrderRequest(base));
  });
});
