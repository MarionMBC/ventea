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
 * Estado del audio: `running` suena; `blocked` el navegador lo tiene suspendido hasta
 * un gesto del usuario (pasa siempre tras recargar la página: política de autoplay);
 * `unsupported` sin Web Audio.
 */
export type SoundStatus = 'running' | 'blocked' | 'unsupported';

let context: AudioContext | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

/** Cualquier toque en la página desbloquea el audio (cuenta como gesto). */
const unlockOnGesture = () => void unlockSound();

function ensureContext(): AudioContext | null {
  if (context) return context;
  try {
    const AudioCtor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return null;
    context = new AudioCtor();
    context.addEventListener('statechange', emit);
    return context;
  } catch {
    return null;
  }
}

export function getSoundStatus(): SoundStatus {
  if (!context) return 'unsupported';
  return context.state === 'running' ? 'running' : 'blocked';
}

/**
 * Para `useSyncExternalStore`: crea el AudioContext (solo mientras el sonido está
 * activado) y escucha el primer toque para reanudarlo.
 */
const UNLOCK_EVENTS = ['pointerdown', 'pointerup', 'click', 'touchend', 'keydown'] as const;

export function subscribeSound(listener: () => void): () => void {
  ensureContext();
  listeners.add(listener);
  // `pointerdown` no cuenta como gesto de activación de audio en pantallas táctiles:
  // hacen falta `click`/`touchend` para que tocar cualquier botón de la tablet sirva.
  for (const event of UNLOCK_EVENTS) document.addEventListener(event, unlockOnGesture);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      for (const event of UNLOCK_EVENTS) document.removeEventListener(event, unlockOnGesture);
    }
  };
}

/** Reanuda el audio. Llamar desde un gesto (click). Devuelve si quedó sonando. */
export async function unlockSound(): Promise<boolean> {
  const ctx = ensureContext();
  if (!ctx) return false;
  if (ctx.state !== 'running') {
    try {
      await ctx.resume();
    } catch {
      // Sigue bloqueado: el aviso «Toca para activar el sonido» queda visible.
    }
  }
  emit();
  return ctx.state === 'running';
}

/**
 * Dos tonos cortos con Web Audio, sin archivo de sonido. Si el audio está bloqueado
 * no suena (y el panel muestra el aviso para activarlo); devuelve si sonó.
 */
export function playChime(): boolean {
  const ctx = ensureContext();
  if (!ctx || ctx.state !== 'running') return false;
  try {
    [880, 1320].forEach((frequency, index) => {
      const start = ctx.currentTime + index * 0.18;
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.3, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);
      oscillator.connect(gain).connect(ctx.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.17);
    });
    return true;
  } catch {
    // El sonido es un extra: si falla, el resaltado y el contador siguen.
    return false;
  }
}
