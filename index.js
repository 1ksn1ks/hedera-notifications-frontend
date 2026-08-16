import 'react-native-get-random-values';
import '@walletconnect/react-native-compat';

import { AppRegistry } from 'react-native';
import messaging from '@react-native-firebase/messaging';
import AsyncStorage from '@react-native-async-storage/async-storage';
import App from './App';
import { name as appName } from './app.json';

messaging().setBackgroundMessageHandler(async remoteMessage => {
  try {
    const title = String(
      remoteMessage?.notification?.title ||
        remoteMessage?.data?.title ||
        'Hedera'
    );
    const body = String(
      remoteMessage?.notification?.body ||
        remoteMessage?.data?.body ||
        ''
    );
    const topicId = remoteMessage?.data?.topicId
      ? String(remoteMessage.data.topicId)
      : undefined;

    const existing = await AsyncStorage.getItem('messages');
    const list = existing ? JSON.parse(existing) : [];

    list.unshift({
      id: `${Date.now()}-${Math.random()}`,
      title,
      body,
      topicId,
      time: new Date().toLocaleTimeString(),
    });

    await AsyncStorage.setItem('messages', JSON.stringify(list.slice(0, 100)));
  } catch (e) {
    console.log('Background message save failed', e);
  }
});

AppRegistry.registerComponent(appName, () => App);