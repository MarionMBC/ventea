/**
 * Preferencias de este dispositivo (el sonido del mostrador). Son comodidades locales:
 * si el navegador no deja guardar, se usa el valor por defecto y listo.
 */
const SOUND_KEY = 'ventea.admin.sound';

export function readSoundEnabled(): boolean {
  try {
    return window.localStorage.getItem(SOUND_KEY) === 'on';
  } catch {
    return false;
  }
}

export function writeSoundEnabled(enabled: boolean): void {
  try {
    window.localStorage.setItem(SOUND_KEY, enabled ? 'on' : 'off');
  } catch {
    // Sin almacenamiento la preferencia dura hasta recargar.
  }
}

/**
 * Dos tonos cortos con Web Audio, sin archivo de sonido. Los navegadores solo dejan
 * sonar después de un gesto del usuario: activar el toggle ya lo es.
 */
export function playChime(): void {
  try {
    const AudioCtor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return;
    const context = new AudioCtor();
    [880, 1320].forEach((frequency, index) => {
      const start = context.currentTime + index * 0.18;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.3, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.17);
    });
    window.setTimeout(() => void context.close(), 600);
  } catch {
    // El sonido es un extra: si falla, el resaltado y el contador siguen.
  }
}
