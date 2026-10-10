import { jest } from '@jest/globals';
import type { ConfigService } from '@nestjs/config';

import type { LifecycleMailer } from '@/modules/notifications/lifecycle-mailer.service';
import {
  LIFECYCLE_SHUTDOWN_WAIT_MS,
  LifecycleScheduler,
} from '@/modules/notifications/lifecycle.scheduler';

const FIRST_RUN_DELAY_MS = 2 * 60_000;

function schedulerWith(runLifecycle: () => Promise<unknown>) {
  const config = { get: () => undefined } as unknown as ConfigService;
  const mailer = { runLifecycle } as unknown as LifecycleMailer;
  return { scheduler: new LifecycleScheduler(config, mailer) };
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
});
