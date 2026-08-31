/**
 * Fachada de capacidades nativas.
 *
 * Las features NUNCA importan `@capacitor/*` directo: pasan por acá. Dos razones
 * concretas: la app corre también en navegador (donde varios plugins no existen)
 * y cambiar de plugin no debe tocar 40 archivos.
 *
 * Cada función devuelve un resultado explícito en vez de lanzar cuando la causa
 * es "el usuario dijo que no" — negar el permiso de ubicación es un camino normal
 * de la app, no un error.
 */
import { Capacitor } from '@capacitor/core';

export const isNative = Capacitor.isNativePlatform();
export const platform = Capacitor.getPlatform(); // 'ios' | 'android' | 'web'

export type PermissionResult = 'granted' | 'denied' | 'unavailable';

// ─── Biometría ───────────────────────────────────────────────────────────────
// El secreto de sesión (refresh token) se guarda en el Keychain/Keystore vía
// capacitor-secure-storage-plugin y se desbloquea con biometría. El backend
// nunca ve la huella: solo recibe el refresh token que el dispositivo liberó.

export interface BiometricStatus {
  isAvailable: boolean;
  /** 'faceId' | 'touchId' | 'fingerprint' | 'none' — para rotular el botón correctamente. */
  kind: string;
}

export async function getBiometricStatus(): Promise<BiometricStatus> {
  throw new Error('TODO: implementar con aparajita-capacitor-biometric-auth');
}

export async function authenticateWithBiometrics(_reason: string): Promise<boolean> {
  throw new Error('TODO: implementar con aparajita-capacitor-biometric-auth');
}

// ─── Notificaciones push ─────────────────────────────────────────────────────
// El token se registra contra el tenant actual: un dispositivo con dos apps de
// marcas distintas tiene dos registros separados.

export async function requestPushPermission(): Promise<PermissionResult> {
  throw new Error('TODO: implementar con @capacitor/push-notifications');
}

export async function registerPushToken(): Promise<string | null> {
  throw new Error('TODO: implementar con @capacitor/push-notifications');
}

// ─── Ubicación ───────────────────────────────────────────────────────────────
// Solo para ordenar sucursales por cercanía. No hay tracking continuo:
// se pide la posición puntual cuando el usuario abre la pantalla de locales.

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export async function getCurrentPosition(): Promise<Coordinates | null> {
  throw new Error('TODO: implementar con @capacitor/geolocation');
}

// ─── Cámara ──────────────────────────────────────────────────────────────────
// Foto de perfil y escaneo del código del pedido.

export async function takePhoto(): Promise<string | null> {
  throw new Error('TODO: implementar con @capacitor/camera');
}
