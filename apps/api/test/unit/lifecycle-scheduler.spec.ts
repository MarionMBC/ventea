import { jest } from '@jest/globals';
import type { ConfigService } from '@nestjs/config';

import type { MediaGc } from '@/modules/media/media-gc.service';
import type { LifecycleMailer } from '@/modules/notifications/lifecycle-mailer.service';
import {
  LIFECYCLE_SHUTDOWN_WAIT_MS,
  LifecycleScheduler,
} from '@/modules/notifications/lifecycle.scheduler';

const FIRST_RUN_DELAY_MS = 2 * 60_000;

function schedulerWith(runLifecycle: () => Promise<unknown>, runGc = jest.fn<MediaGc['run']>()) {
  const config = { get: () => undefined } as unknown as ConfigService;
  const mailer = { runLifecycle } as unknown as LifecycleMailer;
  const gc = { run: runGc } as unknown as MediaGc;
  return { scheduler: new LifecycleScheduler(config, mailer, gc), runGc };
}

describe('LifecycleScheduler', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('el apagado espera la vuelta en curso con tope, no para siempre', async () => {
    // Una vuelta colgada (la base no responde).
    const { scheduler } = schedulerWith(() => new Promise(() => undefined));
    scheduler.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(FIRST_RUN_DELAY_MS);

    let finished = false;
    void scheduler.beforeApplicationShutdown().then(() => (finished = true));
    await jest.advanceTimersByTimeAsync(LIFECYCLE_SHUTDOWN_WAIT_MS - 1);
    expect(finished).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    expect(finished).toBe(true);
    expect(LIFECYCLE_SHUTDOWN_WAIT_MS).toBeLessThanOrEqual(5_000);
  });

  it('corre el GC de medios después de los correos, aunque los correos fallen', async () => {
    const { scheduler, runGc } = schedulerWith(() => Promise.reject(new Error('base caída')));
    runGc.mockResolvedValue({ tenants: 0, skipped: 0, removedFiles: 0, removedBytes: 0 });
    scheduler.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(FIRST_RUN_DELAY_MS);
    expect(runGc).toHaveBeenCalledTimes(1);
    await scheduler.beforeApplicationShutdown();
  });
});
