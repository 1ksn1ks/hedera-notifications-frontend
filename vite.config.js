import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Browser preview of the React Native app — same pattern as step_by_step:
// Vite dev server on 0.0.0.0, /api proxied to the local backend so the
// web build stays same-origin. Native-only modules get no-op stubs.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      'react-native': path.resolve(__dirname, 'web-shims/react-native.js'),
      // Push + notifications + clipboard have no native bridge in the
      // browser — the app keeps running with these stubs.
      '@react-native-firebase/messaging': path.resolve(__dirname, 'web-stubs/messaging.js'),
      '@notifee/react-native': path.resolve(__dirname, 'web-stubs/notifee.js'),
      '@react-native-clipboard/clipboard': path.resolve(__dirname, 'web-stubs/clipboard.js'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5174,
    strictPort: true,
    proxy: {
      '/api': { target: 'http://127.0.0.1:3100', changeOrigin: true },
    },
  },
});
