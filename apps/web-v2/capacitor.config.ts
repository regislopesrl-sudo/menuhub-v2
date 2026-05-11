import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.menuhub.platform',
  appName: 'MenuHub',
  webDir: '.next',
  server: {
    androidScheme: 'https',
  },
};

export default config;
