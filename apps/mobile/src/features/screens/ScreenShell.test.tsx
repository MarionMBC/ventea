import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useResource } from '../useResource';
import { ScreenShell } from './ScreenShell';

const drag = (el: Element, from: number, to: number) => {
  fireEvent.touchStart(el, { touches: [{ clientY: from }] });
  fireEvent.touchMove(el, { touches: [{ clientY: to }] });
  fireEvent.touchEnd(el);
};

describe('ScreenShell pull to refresh', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const setup = (onRefresh?: () => unknown) => {
    const { container } = render(
      <ScreenShell onRefresh={onRefresh}>
        <p>content</p>
      </ScreenShell>,
    );
    return container.querySelector('.vt-screen__content')!;
  };

  it('reloads when pulled past the threshold from the top', async () => {
    const onRefresh = vi.fn();
    const content = setup(onRefresh);
    drag(content, 0, 200);
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status').getAttribute('aria-label')).toBe('Refreshing');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('ignores a short pull', () => {
    const onRefresh = vi.fn();
    drag(setup(onRefresh), 0, 60);
    expect(onRefresh).not.toHaveBeenCalled();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('ignores a pull that starts away from the top', () => {
    const onRefresh = vi.fn();
    const content = setup(onRefresh);
    Object.defineProperty(content, 'scrollTop', { value: 120, configurable: true });
    drag(content, 0, 200);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('does nothing without onRefresh', () => {
    const content = setup();
    drag(content, 0, 200);
    expect(screen.queryByRole('status')).toBeNull();
  });
});

describe('useResource refreshOnShow', () => {
  it('reloads when the app becomes visible again', async () => {
    const load = vi.fn().mockResolvedValue('ok');
    renderHook(() => useResource(load, [], { refreshOnShow: true }));
    await act(async () => {});
    expect(load).toHaveBeenCalledTimes(1);
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(load).toHaveBeenCalledTimes(2);
  });
});
