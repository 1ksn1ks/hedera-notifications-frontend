import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Browser preview of the React Native app — same pattern as step_by_step:
// Vite dev server on 0.0.0.0, /api proxied to the production backend so the
// web build stays same-origin (the production API sends no CORS headers).
// Native-only modules get no-op stubs.
export default defineConfig({
  plugins: [react()],
  define: {
    // __DEV__ is an RN/Metro build-time global (referenced by the app and by
    // react-native-web); give it a real value in the browser.
    __DEV__: JSON.stringify(process.env.NODE_ENV !== 'production'),
  },
  optimizeDeps: {
    // Ships platform-specific .web.js browser variants. The pre-bundler would
    // resolve them to the native files, but the dev transform honors
    // resolve.extensions and picks the .web.js ones — so serve it through the
    // transform. (react-native-svg is NOT excluded: its lib/module is a
    // hybrid ESM/CJS build that needs pre-bundling for CJS interop.)
    exclude: ['react-native-safe-area-context'],
  },
  resolve: {
    // Prefer the packages' .web.js variants (e.g. react-native-safe-area-context
    // ships browser implementations as NativeSafeAreaProvider.web.js /
    // SafeAreaView.web.js); fall through to the normal extensions otherwise.
    extensions: ['.web.js', '.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json'],
    alias: [
      // react-native-svg's fabric components call this at module load; the real
      // RN file is Flow + native-bridge and cannot load in a browser.
      {
        find: 'react-native/Libraries/Utilities/codegenNativeComponent',
        replacement: path.resolve(__dirname, 'web-shims/codegenNativeComponent.js'),
      },
      // Push + notifications + clipboard have no native bridge in the
      // browser — the app keeps running with these stubs.
      {
        find: '@react-native-firebase/messaging',
        replacement: path.resolve(__dirname, 'web-stubs/messaging.js'),
      },
      {
        find: '@notifee/react-native',
        replacement: path.resolve(__dirname, 'web-stubs/notifee.js'),
      },
      {
        find: '@react-native-clipboard/clipboard',
        replacement: path.resolve(__dirname, 'web-stubs/clipboard.js'),
      },
      // Exact match only, so 'react-native/...' subpaths are not swallowed.
      { find: /^react-native$/, replacement: path.resolve(__dirname, 'web-shims/react-native.js') },
    ],
  },
  server: {
    host: '0.0.0.0',
    port: 5174,
    // If 5174 is taken, move to the next free port and print it — never
    // stop whatever else is holding the port.
    strictPort: false,
    fs: {
      // Setting fs.deny replaces Vite's defaults, so re-include them
      // (Vite 8: .env, .env.*, *.{crt,pem,key,p12,pfx,cer,der}, .npmrc,
      // .yarnrc.yml, **/.git/**).
      // Patterns are matched with picomatch against ABSOLUTE file paths:
      // slash-less patterns get **/ prepended automatically, but patterns
      // containing a slash are used as-is — so gitignore-style 'android/'
      // or '/*.keystore' would match nothing. Hence the **/ prefixes.
      deny: [
        '.env',
        '.env.*',
        '*.{crt,pem,key,p12,pfx,cer,der}',
        '.npmrc',
        '.yarnrc.yml',
        '**/.git/**',
        '**/android/**',
        '**/ios/**',
        '**/*.keystore',
        '**/*.jks',
        '**/keystore.properties',
        '**/google-services.json',
        '**/GoogleService-Info.plist',
        '**/.env*',
      ],
    },
    proxy: {
      '/api': {
        target: 'https://hedera-notifications-backend-production.up.railway.app',
        changeOrigin: true,
      },
    },
  },
});
