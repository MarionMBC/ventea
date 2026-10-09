import { ProcessingGate, ProcessingGateBusyError } from '@/modules/media/processing-gate';

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

describe('ProcessingGate (semáforo de sharp)', () => {
  it('no deja correr más de `max` a la vez; el siguiente entra cuando uno termina', async () => {
    const gate = new ProcessingGate(2, 1_000, 10);
    const blockers = [deferred(), deferred(), deferred()];
    const started: number[] = [];
    const runs = blockers.map((b, i) =>
      gate.run(async () => {
        started.push(i);
        await b.promise;
        return i;
      }),
    );
    await new Promise((r) => setImmediate(r));
    expect(started).toEqual([0, 1]);
    expect(gate.running).toBe(2);
    expect(gate.waiting).toBe(1);

    blockers[0]!.resolve();
    await runs[0];
    await new Promise((r) => setImmediate(r));
    expect(started).toEqual([0, 1, 2]);
    expect(gate.running).toBe(2);

    blockers[1]!.resolve();
    blockers[2]!.resolve();
    await expect(Promise.all(runs)).resolves.toEqual([0, 1, 2]);
    expect(gate.running).toBe(0);
  });

  it('la espera vence → ProcessingGateBusyError y el lugar no se pierde', async () => {
    const gate = new ProcessingGate(1, 20, 10);
    const blocker = deferred();
    const first = gate.run(() => blocker.promise);
    await expect(gate.run(async () => 'tarde')).rejects.toBeInstanceOf(ProcessingGateBusyError);
    expect(gate.waiting).toBe(0);
    blocker.resolve();
    await first;
    await expect(gate.run(async () => 'ok')).resolves.toBe('ok');
  });

  it('fila llena → rechazo inmediato', async () => {
    const gate = new ProcessingGate(1, 10_000, 1);
    const blocker = deferred();
    const first = gate.run(() => blocker.promise);
    const queued = gate.run(async () => 'en fila');
    await expect(gate.run(async () => 'x')).rejects.toThrow(/queue_full/);
    blocker.resolve();
    await expect(Promise.all([first, queued])).resolves.toEqual([undefined, 'en fila']);
  });

  it('un error de la tarea libera el lugar', async () => {
    const gate = new ProcessingGate(1, 100, 1);
    await expect(gate.run(async () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    expect(gate.running).toBe(0);
  });
});
