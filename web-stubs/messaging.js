// Web stub for @react-native-firebase/messaging. No push in the browser —
// every method resolves harmlessly so the app's effects run unchanged.
const noUnsub = () => {};

const api = {
  requestPermission: () => Promise.resolve('authorized'),
  getToken: () => Promise.resolve(null),
  onMessage: noUnsub,
  onNotificationOpenedApp: noUnsub,
  onNotificationTap: noUnsub,
  getInitialNotification: () => Promise.resolve(null),
  showNotification: () => Promise.resolve(),
  deleteNotification: () => Promise.resolve(),
  subscribeToTopic: () => Promise.resolve(),
  unsubscribeFromTopic: () => Promise.resolve(),
};

export default function messaging() {
  return api;
}

// Statics the app reads off the module itself (not off messaging()).
messaging.AuthorizationStatus = {
  NOT_DETERMINED: 'notDetermined',
  DENIED: 'denied',
  AUTHORIZED: 'authorized',
  PROVISIONAL: 'provisional',
};
messaging.AuthorizationDeviceStatus = {
  NOT_SUPPORTED: 'notSupported',
  AUTHORIZED: 'authorized',
  UNAUTHORIZED: 'unauthorized',
};
messaging.IosPermissions = {
  alert: true,
  badge: true,
  sound: true,
};
