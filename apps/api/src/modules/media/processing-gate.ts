/** La espera por un lugar venció o la fila está llena: el llamador responde 503. */
export class ProcessingGateBusyError extends Error {
  constructor(reason: 'timeout' | 'queue_full') {
    super(`Procesamiento de imágenes ocupado (${reason})`);
    this.name = 'ProcessingGateBusyError';
  }
}

interface Waiter {
  grant: () => void;
}

/**
 * Semáforo en memoria (por proceso) para el trabajo pesado de sharp (TASK-016, review). Una
 * imagen chica en bytes puede pedir cientos de MB al decodificarse y sharp ocupa el threadpool
 * de libuv que también usan fs, DNS y argon2 de TODAS las marcas: como mucho `max` a la vez, el
 * resto espera hasta `waitMs` y, con más de `maxWaiting` esperando, se rechaza en el acto.
 */
export class ProcessingGate {
  private active = 0;
  private readonly waiters: Waiter[] = [];

  constructor(
    private readonly max: number,
    private readonly waitMs: number,
    private readonly maxWaiting: number,
  ) {}

  get running(): number {
    return this.active;
  }

  get waiting(): number {
    return this.waiters.length;
  }

  async run<T>(task: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await task();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.active < this.max) {
      this.active += 1;
      return Promise.resolve();
    }
    if (this.waiters.length >= this.maxWaiting) {
      return Promise.reject(new ProcessingGateBusyError('queue_full'));
    }
    return new Promise<void>((resolve, reject) => {
      const waiter: Waiter = {
        grant: () => {
          clearTimeout(timer);
          resolve();
        },
      };
      const timer = setTimeout(() => {
        const index = this.waiters.indexOf(waiter);
        if (index >= 0) this.waiters.splice(index, 1);
        reject(new ProcessingGateBusyError('timeout'));
      }, this.waitMs);
      this.waiters.push(waiter);
    });
  }

  /** El lugar pasa directo al siguiente en la fila (sin bajar y subir el contador). */
  private release(): void {
    const next = this.waiters.shift();
    if (next) next.grant();
    else this.active -= 1;
  }
}
