import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.example.translatorApp',
  appName: 'translatorApp',
  webDir: 'www',
  server: {
    androidScheme: 'https',
    hostname: 'localhost',
    cleartext: true,
    allowNavigation: ['*']
  }
};

export default config;
