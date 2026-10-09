import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';

/**
 * Matches the native status bar to the brand theme.
 *
 * `Style.Dark` means "dark background, light content" in the plugin's naming —
 * the app is dark-first, so the clock and the icons have to be light. Runs only
 * on a native platform; in the browser the plugin is a no-op that still logs.
 */
export const applyNativeStatusBar = async (): Promise<void> => {
  if (!Capacitor.isNativePlatform()) return;

  try {
    await StatusBar.setStyle({ style: Style.Dark });
    if (Capacitor.getPlatform() === 'android') {
      // iOS has no settable status bar background.
      await StatusBar.setBackgroundColor({ color: '#0B0908' });
    }
  } catch {
    /* A device without a settable status bar is not a reason to fail boot. */
  }
};
