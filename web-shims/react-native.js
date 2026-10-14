// Web shim for 'react-native' imports: everything from react-native-web,
// plus native-only named exports the app imports but the browser has no
// bridge for (granted/no-op in the web preview).
// (no `default` re-export: the CJS-interop'd build doesn't expose one,
// and the RN ecosystem uses named imports)
export * from 'react-native-web';

export const PermissionsAndroid = {
  PERMISSIONS: {},
  REQUEST_PERMISSIONS: {},
  PERMISSION_NAMES: {},
  check: async () => true,
  request: async () => 'granted',
  requestMultiple: async () => ({}),
};
