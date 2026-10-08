import { ORDER_STATUS } from '@ventea/shared';
import { describe, expect, it } from 'vitest';

import { makeOrder } from '@/test/fixtures';

import { createArrivalTracker } from './arrivals';
import {
  applyStatus,
  canCancel,
  ordersInColumn,
  primaryAction,
  statusLabel,
  upsertOrder,
} from './transitions';

describe('transiciones por estado', () => {
  it('acción principal: Empezar → Listo → Entregado', () => {
    expect(primaryAction('confirmed')).toEqual({ to: 'preparing', label: 'Empezar' });
    expect(primaryAction('preparing')).toEqual({ to: 'ready', label: 'Listo' });
    expect(primaryAction('ready')).toEqual({ to: 'completed', label: 'Entregado' });
    expect(primaryAction('completed')).toBeNull();
    expect(primaryAction('cancelled')).toBeNull();
  });

  it('cancelar solo en estados no terminales', () => {
    const cancellable = ORDER_STATUS.filter(canCancel);
    expect(cancellable).toEqual(['draft', 'pending_payment', 'confirmed', 'preparing', 'ready']);
  });

  it('todas las etiquetas en español', () => {
    expect(ORDER_STATUS.map(statusLabel)).not.toContain(undefined);
    expect(statusLabel('completed')).toBe('Entregado');
  });
});

describe('cambios sobre la lista del tablero', () => {
  const a = makeOrder({ placedAt: new Date('2026-10-08T15:05:00Z') });
  const b = makeOrder({ placedAt: new Date('2026-10-08T15:00:00Z') });
  const c = makeOrder({ status: 'preparing' });

  it('applyStatus mueve de columna y saca del tablero lo terminal', () => {
    const moved = applyStatus([a, b, c], a.id, 'preparing');
    expect(moved.find((o) => o.id === a.id)?.status).toBe('preparing');
    expect(applyStatus([a, b, c], c.id, 'cancelled').map((o) => o.id)).toEqual([a.id, b.id]);
    expect(applyStatus([a, b, c], c.id, 'completed')).toHaveLength(2);
  });

  it('upsertOrder reemplaza, re-agrega (rollback) o quita solo ese pedido', () => {
    const without = [b, c];
    expect(upsertOrder(without, a).map((o) => o.id)).toEqual([b.id, c.id, a.id]);
    const otherMoved = applyStatus([a, b, c], b.id, 'ready');
    const rolledBack = upsertOrder(otherMoved, { ...a, status: 'confirmed' });
    expect(rolledBack.find((o) => o.id === b.id)?.status).toBe('ready');
    expect(upsertOrder([a, b], { ...a, status: 'completed' }).map((o) => o.id)).toEqual([b.id]);
  });

  it('ordersInColumn ordena del más antiguo al más nuevo', () => {
    expect(ordersInColumn([a, b, c], 'confirmed').map((o) => o.id)).toEqual([b.id, a.id]);
    expect(ordersInColumn([a, b, c], 'ready')).toEqual([]);
  });
});

describe('createArrivalTracker', () => {
  it('la primera carga no resalta nada; lo nuevo después sí', () => {
    const tracker = createArrivalTracker();
    expect(tracker.observe(['1', '2'])).toEqual([]);
    expect(tracker.getSnapshot().size).toBe(0);

    expect(tracker.observe(['1', '2', '3'])).toEqual(['3']);
    expect([...tracker.getSnapshot()]).toEqual(['3']);
    // Un pedido ya visto que vuelve (rollback, recarga) no cuenta otra vez.
    expect(tracker.observe(['1', '3'])).toEqual([]);
    expect(tracker.observe(['1', '2', '3'])).toEqual([]);
  });

  it('acknowledge marca vistos y lo que sale del tablero deja de contar', () => {
    const tracker = createArrivalTracker();
    tracker.observe([]);
    tracker.observe(['a', 'b', 'c']);
    tracker.acknowledge('a');
    expect([...tracker.getSnapshot()].sort()).toEqual(['b', 'c']);
    tracker.observe(['b']);
    expect([...tracker.getSnapshot()]).toEqual(['b']);
    tracker.acknowledge();
    expect(tracker.getSnapshot().size).toBe(0);
  });

  it('avisa a los suscriptores solo cuando cambia', () => {
    const tracker = createArrivalTracker();
    let calls = 0;
    tracker.subscribe(() => calls++);
    tracker.observe(['a']);
    tracker.observe(['a', 'b']);
    tracker.observe(['a', 'b']);
    expect(calls).toBe(1);
  });
});
