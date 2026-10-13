import type { CapacitorConfig } from '@capacitor/cli';
import brand from './brand.json';

// The iOS and Android apps wrap the same web build (dist/). The app ID is
// permanent once published to a store, so settle it before the first upload.
const config: CapacitorConfig = {
  appId: brand.appId,
  appName: brand.name,
  webDir: 'dist',
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
