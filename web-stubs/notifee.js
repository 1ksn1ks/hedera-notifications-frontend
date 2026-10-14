// Web stub for @notifee/react-native. No notification bridge in the
// browser — display/channel calls resolve, handlers subscribe to nothing.
export const AndroidImportance = {
  MIN: 1,
  LOW: 2,
  DEFAULT: 3,
  HIGH: 4,
  MAX: 5,
};

const api = {
  displayNotification: () => Promise.resolve({ id: 'web-stub' }),
  cancelNotification: () => Promise.resolve(),
  cancelAllNotifications: () => Promise.resolve(),
  requestPermission: () =>
    Promise.resolve({ authorizationStatus: 1, notification: true }),
  createChannel: (channel) => Promise.resolve(channel ? channel.id : 'hedera-messages'),
  deleteChannel: () => Promise.resolve(),
  setNotificationForegroundHandler: () => {},
  setNotificationBackgroundHandler: () => {},
  onForeground: () => () => {},
  onBackground: () => () => {},
  getTriggerTypes: () => Promise.resolve([]),
};

export default api;
