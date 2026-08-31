import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Config base del binario. El appId/appName por tenant se sobrescribe en el
 * pipeline de build de marca blanca (ver docs/white-label.md): el mismo código
 * produce un APK/IPA por marca, con su propio bundle id.
 */
const config: CapacitorConfig = {
  appId: process.env.VENTEA_APP_ID ?? 'app.ventea.client',
  appName: process.env.VENTEA_APP_NAME ?? 'Ventea',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
