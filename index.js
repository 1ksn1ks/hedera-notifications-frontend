import 'react-native-get-random-values';
import '@walletconnect/react-native-compat';

import { AppRegistry } from 'react-native';
import messaging from '@react-native-firebase/messaging';
import notifee, { AndroidImportance } from '@notifee/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import App from './App';
import { name as appName } from './app.json';

function formatTime(date = new Date()) {
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  return `${day}/${month}/${year}, ${hours}:${minutes}:${seconds}`;
}

messaging().setBackgroundMessageHandler(async remoteMessage => {
  try {
    const data = remoteMessage.data || {};

    const title = String(data.title || data.topicId || 'Hedera');
    const body = String(data.body || '');
    const topicId = data.topicId ? String(data.topicId) : undefined;
    const payerId = data.payer || undefined;
    const username = data.username || undefined;
    const pureMessage = data.message || body;

    // Show simple notification
    await notifee.displayNotification({
      title,
      body,
      data: topicId ? { topicId } : undefined,
      android: {
        channelId: 'hedera-messages',
        pressAction: { id: 'default' },
        importance: AndroidImportance.HIGH,
        sound: 'default',
      },
    });

    // Save to local storage
    const existing = await AsyncStorage.getItem('messages');
    const list = existing ? JSON.parse(existing) : [];

    list.unshift({
      id: `${Date.now()}-${Math.random()}`,
      title,
      body: pureMessage,
      topicId,
      time: formatTime(),
      payerId,
      username,
    });

    await AsyncStorage.setItem('messages', JSON.stringify(list.slice(0, 100)));
  } catch (e) {
    console.log('Background message handling failed', e);
  }
});

AppRegistry.registerComponent(appName, () => App);