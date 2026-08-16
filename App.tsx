import React, { useEffect, useState } from 'react';
import {
  SafeAreaView,
  Text,
  StyleSheet,
  Button,
  TextInput,
  View,
  ScrollView,
  Alert,
  Switch,
  Platform,
  PermissionsAndroid,
  AppState,
} from 'react-native';
import messaging from '@react-native-firebase/messaging';
import notifee, { AndroidImportance } from '@notifee/react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getPairingUri,
  getConnectedAccount,
  disconnectWallet,
} from './walletConnect';

const BACKEND_URL = 'http://10.18.36.100:3000';

function FilterList({
  title,
  list,
  onAdd,
  onRemove,
}: {
  title: string;
  list: string[];
  onAdd: (user: string) => void;
  onRemove: (user: string) => void;
}) {
  const [input, setInput] = useState('');

  return (
    <View style={{ marginVertical: 10 }}>
      <Text style={styles.label}>{title}</Text>

      {list.map(user => (
        <View key={user} style={styles.row}>
          <Text>{user}</Text>
          <Button title="Remove" color="red" onPress={() => onRemove(user)} />
        </View>
      ))}

      <TextInput
        style={styles.input}
        placeholder="0.0.12345 or username"
        value={input}
        onChangeText={setInput}
        autoCapitalize="none"
      />
      <Button
        title="Add"
        onPress={() => {
          if (input.trim()) {
            onAdd(input.trim());
            setInput('');
          }
        }}
      />
    </View>
  );
}

function App(): React.JSX.Element {
  const [token, setToken] = useState('');
  const [status, setStatus] = useState('Starting...');
  const [topicId, setTopicId] = useState('');
  const [walletAddress, setWalletAddress] = useState('');
  const [walletInput, setWalletInput] = useState('');
  const [pairingUri, setPairingUri] = useState('');
  const [subscribedTopics, setSubscribedTopics] = useState<
    {
      topicId: string;
      showFullMessage: boolean;
      filterMode: string;
      allowedSenders: string[];
      blockedSenders: string[];
    }[]
  >([]);
  const [messages, setMessages] = useState<
    { id: string; title: string; body: string; topicId?: string; time: string }[]
  >([]);

  useEffect(() => {
    setupNotifications();
  }, []);

  // Reload when app comes back to foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', nextState => {
      if (nextState === 'active' && walletAddress) {
        loadMessages(walletAddress);
      }
    });
    return () => sub.remove();
  }, [walletAddress]);

  // While app is open, refresh every 10 seconds
  useEffect(() => {
    if (!walletAddress) return;

    const id = setInterval(() => {
      loadMessages(walletAddress);
    }, 10000);

    return () => clearInterval(id);
  }, [walletAddress]);

  function addMessageFromRemote(remoteMessage: any) {
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

    if (!body && title === 'Hedera') return;

    const item = {
      id: `${Date.now()}-${Math.random()}`,
      title,
      body,
      topicId,
      time: new Date().toLocaleTimeString(),
    };

    setMessages(prev => {
      const next = [item, ...prev].slice(0, 100);
      AsyncStorage.setItem('messages', JSON.stringify(next));
      return next;
    });
  }

  // Foreground messages
  useEffect(() => {
    const unsubscribe = messaging().onMessage(async remoteMessage => {
      addMessageFromRemote(remoteMessage);

      const title = String(remoteMessage.notification?.title || 'Hedera');
      const body = String(remoteMessage.notification?.body || '');
      const topicId = remoteMessage.data?.topicId
        ? String(remoteMessage.data.topicId)
        : undefined;

      await notifee.displayNotification({
        title,
        body,
        android: {
          channelId: 'hedera-messages',
          pressAction: { id: 'default' },
        },
        data: topicId ? { topicId } : undefined,
      });
    });

    return unsubscribe;
  }, []);

  // Background / killed → user taps notification
  useEffect(() => {
    const unsubscribe = messaging().onNotificationOpenedApp(remoteMessage => {
      addMessageFromRemote(remoteMessage);
    });

    messaging()
      .getInitialNotification()
      .then(remoteMessage => {
        if (remoteMessage) {
          addMessageFromRemote(remoteMessage);
        }
      });

    return unsubscribe;
  }, []);

  async function clearAllMessages() {
    try {
      if (walletAddress) {
        await fetch(`${BACKEND_URL}/api/messages/clear`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ walletAddress }),
        });
      }
    } catch (e) {
      console.log('clear server messages failed', e);
    }

    setMessages([]);
    await AsyncStorage.removeItem('messages');
  }

  async function loadMessages(wallet: string) {
    try {
      const res = await fetch(
        `${BACKEND_URL}/api/messages/${encodeURIComponent(wallet)}`
      );
      const data = (await res.json()) as {
        success?: boolean;
        messages?: {
          id: string;
          topic_id: string;
          sender?: string;
          body: string;
          created_at: string;
        }[];
        error?: string;
      };
      if (data.success && data.messages) {
        setMessages(
          data.messages.map((m: any) => ({
            id: String(m.id),
            title: m.topic_id,
            body: m.sender ? `${m.sender}: ${m.body}` : m.body,
            topicId: m.topic_id,
            time: new Date(m.created_at).toLocaleString(),
          }))
        );
      }
    } catch (e) {
      console.log('loadMessages failed', e);
    }
  }

  async function setupNotifications() {
    try {
      setStatus('Requesting permission...');

      if (Platform.OS === 'android' && Platform.Version >= 33) {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
          {
            title: 'Notification Permission',
            message: 'Allow Hedera Notifier to send you topic alerts?',
            buttonPositive: 'Allow',
            buttonNegative: 'Deny',
          }
        );

        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          setStatus('Permission denied');
          Alert.alert(
            'Notifications disabled',
            'You can enable them later in phone settings.'
          );
        }
      }

      await notifee.requestPermission();

      await notifee.createChannel({
        id: 'hedera-messages',
        name: 'Hedera Messages',
        importance: AndroidImportance.HIGH,
        sound: 'default',
        vibration: true,
        vibrationPattern: [300, 500],
      });

      const authStatus = await messaging().requestPermission();
      const enabled =
        authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
        authStatus === messaging.AuthorizationStatus.PROVISIONAL;

      if (!enabled) {
        setStatus('Permission denied');
      }

      const fcmToken = await messaging().getToken();
      setToken(fcmToken);

      const savedMsgs = await AsyncStorage.getItem('messages');
      if (savedMsgs) {
        setMessages(JSON.parse(savedMsgs));
      }

      const savedWallet = await AsyncStorage.getItem('walletAddress');
      if (savedWallet) {
        setWalletAddress(savedWallet);
        setWalletInput(savedWallet);
        await registerToken(fcmToken, savedWallet);
        await loadSubscriptions(savedWallet);
        await loadMessages(savedWallet);
        setStatus('Ready ✅');
      } else {
        setStatus('Connect your wallet');
      }
    } catch (error) {
      console.error(error);
      setStatus('Error: ' + String(error));
    }
  }

  async function registerToken(deviceToken: string, wallet: string) {
    await fetch(`${BACKEND_URL}/api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceToken,
        platform: 'android',
        walletAddress: wallet,
      }),
    });
  }

  async function handleConnectWallet() {
    try {
      setStatus('Generating connection code...');
      const uri = await getPairingUri();
      setPairingUri(uri);
      setStatus('Paste code into HashPack');

      Alert.alert(
        'Connect Wallet',
        'Copy the code, open HashPack → Connect dApp / WalletConnect → paste the code.'
      );

      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 2000));
        const accountId = await getConnectedAccount();
        if (accountId) {
          await AsyncStorage.setItem('walletAddress', accountId);
          setWalletAddress(accountId);

          if (token) {
            await registerToken(token, accountId);
            await loadSubscriptions(accountId);
            await loadMessages(accountId);
          }

          setPairingUri('');
          setStatus('Ready ✅');
          Alert.alert('Connected', `Wallet: ${accountId}`);
          return;
        }
      }

      setStatus('Connection timed out');
    } catch (error) {
      console.error(error);
      setStatus('Wallet connection failed');
      Alert.alert('Error', String(error));
    }
  }

  async function handleDisconnectWallet() {
    await disconnectWallet();
    await AsyncStorage.removeItem('walletAddress');
    setWalletAddress('');
    setWalletInput('');
    setSubscribedTopics([]);
    setMessages([]);
    setPairingUri('');
    setStatus('Connect your wallet');
  }

  async function loadSubscriptions(wallet: string) {
    try {
      const response = await fetch(
        `${BACKEND_URL}/api/subscriptions/${encodeURIComponent(wallet)}`
      );
      const data = (await response.json()) as {
        success?: boolean;
        subscriptions?: {
          topic_id: string;
          show_full_message?: boolean;
          filter_mode?: string;
          allowed_senders?: string[];
          blocked_senders?: string[];
        }[];
        error?: string;
      };

      if (data.success && data.subscriptions) {
        const topics = data.subscriptions.map((s: any) => ({
          topicId: s.topic_id,
          showFullMessage: s.show_full_message ?? true,
          filterMode: s.filter_mode || 'all',
          allowedSenders: s.allowed_senders || [],
          blockedSenders: s.blocked_senders || [],
        }));
        setSubscribedTopics(topics);
      }
    } catch (error) {
      console.error('Failed to load subscriptions:', error);
    }
  }

  async function subscribeToTopic() {
    if (!token || !walletAddress) {
      Alert.alert('Error', 'Connect your wallet first');
      return;
    }

    const cleaned = topicId.trim();
    if (!cleaned) {
      Alert.alert('Error', 'Enter a topic ID or name');
      return;
    }

    try {
      setStatus('Checking topic...');

      const response = await fetch(`${BACKEND_URL}/api/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceToken: token,
          topicId: cleaned,
          walletAddress,
        }),
      });

      const data = (await response.json()) as {
        success?: boolean;
        topicId?: string;
        error?: string;
      };

      if (data.success) {
        const finalTopicId = data.topicId || cleaned;

        setSubscribedTopics(prev => {
          if (prev.some(t => t.topicId === finalTopicId)) return prev;
          return [
            ...prev,
            {
              topicId: finalTopicId,
              showFullMessage: true,
              filterMode: 'all',
              allowedSenders: [],
              blockedSenders: [],
            },
          ];
        });
        setTopicId('');
        setStatus('Ready ✅');
        Alert.alert('Subscribed', `Listening to ${finalTopicId}`);
      } else {
        setStatus('Ready ✅');
        Alert.alert('Not found', data.error || `"${cleaned}" does not exist`);
      }
    } catch (error) {
      setStatus('Ready ✅');
      Alert.alert('Error', 'Could not reach backend');
    }
  }

  async function unsubscribeFromTopic(topic: string) {
    try {
      const response = await fetch(`${BACKEND_URL}/api/unsubscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress,
          topicId: topic,
        }),
      });

      const data = (await response.json()) as {
        success?: boolean;
        error?: string;
      };
      if (data.success) {
        setSubscribedTopics(prev => prev.filter(t => t.topicId !== topic));
        Alert.alert('Success', `Unsubscribed from ${topic}`);
      }
    } catch (error) {
      Alert.alert('Error', 'Could not unsubscribe');
    }
  }

  async function toggleShowFullMessage(topic: string, value: boolean) {
    setSubscribedTopics(prev =>
      prev.map(t =>
        t.topicId === topic ? { ...t, showFullMessage: value } : t
      )
    );

    try {
      await fetch(`${BACKEND_URL}/api/update-preference`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress,
          topicId: topic,
          showFullMessage: value,
        }),
      });
    } catch (error) {
      console.error('Failed to save preference');
    }
  }

  async function updateFilter(
    topicId: string,
    filterMode: string,
    allowedSenders: string[] = [],
    blockedSenders: string[] = []
  ) {
    try {
      await fetch(`${BACKEND_URL}/api/update-filter`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress,
          topicId,
          filterMode,
          allowedSenders,
          blockedSenders,
        }),
      });

      setSubscribedTopics(prev =>
        prev.map(t =>
          t.topicId === topicId
            ? { ...t, filterMode, allowedSenders, blockedSenders }
            : t
        )
      );
    } catch (error) {
      Alert.alert('Error', 'Could not update filter');
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Hedera Notifier</Text>
        <Text style={styles.status}>{status}</Text>

        <Text style={styles.label}>Your Hedera Account</Text>

        {walletAddress ? (
          <>
            <Text style={{ marginBottom: 10, color: 'green' }}>
              Connected: {walletAddress}
            </Text>
            <Button
              title="Disconnect Wallet"
              color="red"
              onPress={handleDisconnectWallet}
            />
          </>
        ) : (
          <>
            <Button title="Connect Wallet" onPress={handleConnectWallet} />

            {pairingUri ? (
              <View style={{ marginTop: 12, marginBottom: 16 }}>
                <Text style={styles.label}>
                  Pairing code (paste into HashPack)
                </Text>

                <Text
                  selectable
                  style={{
                    borderWidth: 1,
                    borderColor: '#ccc',
                    borderRadius: 8,
                    padding: 12,
                    marginBottom: 10,
                    fontSize: 12,
                  }}
                >
                  {pairingUri}
                </Text>

                <Button
                  title="Copy code"
                  onPress={() => {
                    Clipboard.setString(pairingUri);
                    Alert.alert(
                      'Copied',
                      'Paste this into HashPack → WalletConnect / Connect dApp'
                    );
                  }}
                />
              </View>
            ) : null}
          </>
        )}

        <Text style={[styles.label, { marginTop: 30 }]}>Messages</Text>

        {messages.length > 0 && (
          <Button
            title="Clear all messages"
            color="red"
            onPress={clearAllMessages}
          />
        )}

        {messages.length === 0 ? (
          <Text style={styles.empty}>No messages yet</Text>
        ) : (
          messages.map(msg => (
            <View key={msg.id} style={styles.topicCard}>
              <Text style={styles.topicText}>{msg.title}</Text>
              <Text>{msg.body}</Text>
              {msg.topicId ? (
                <Text style={{ color: '#666', marginTop: 6 }}>
                  Topic: {msg.topicId}
                </Text>
              ) : null}
              <Text style={{ color: '#999', marginTop: 4, fontSize: 12 }}>
                {msg.time}
              </Text>
            </View>
          ))
        )}

        <Text style={[styles.label, { marginTop: 20 }]}>
          Add Topic ID / Domain name
        </Text>
        <TextInput
          style={styles.input}
          value={topicId}
          onChangeText={setTopicId}
          autoCapitalize="none"
          placeholder="12345 or 0.0.12345"
        />
        <Button title="Subscribe to Topic" onPress={subscribeToTopic} />

        <Text style={[styles.label, { marginTop: 30 }]}>Your Subscriptions</Text>

        {subscribedTopics.length === 0 ? (
          <Text style={styles.empty}>No topics yet</Text>
        ) : (
          subscribedTopics.map(item => (
            <View key={item.topicId} style={styles.topicCard}>
              <Text style={styles.topicText}>{item.topicId}</Text>

              <View style={styles.row}>
                <Text>Show full message</Text>
                <Switch
                  value={item.showFullMessage}
                  onValueChange={value =>
                    toggleShowFullMessage(item.topicId, value)
                  }
                />
              </View>

              <Text style={styles.label}>Filter mode</Text>
              <View style={styles.modeRow}>
                {['all', 'allowlist', 'blocklist'].map(mode => (
                  <Button
                    key={mode}
                    title={
                      mode === 'all'
                        ? 'Everyone'
                        : mode === 'allowlist'
                        ? 'Allow list'
                        : 'Block list'
                    }
                    color={item.filterMode === mode ? '#007AFF' : '#999'}
                    onPress={() =>
                      updateFilter(
                        item.topicId,
                        mode,
                        item.allowedSenders || [],
                        item.blockedSenders || []
                      )
                    }
                  />
                ))}
              </View>

              {item.filterMode === 'allowlist' && (
                <FilterList
                  title="Allowed users"
                  list={item.allowedSenders || []}
                  onAdd={user => {
                    const updated = [...(item.allowedSenders || []), user];
                    updateFilter(
                      item.topicId,
                      'allowlist',
                      updated,
                      item.blockedSenders || []
                    );
                  }}
                  onRemove={user => {
                    const updated = (item.allowedSenders || []).filter(
                      u => u !== user
                    );
                    updateFilter(
                      item.topicId,
                      'allowlist',
                      updated,
                      item.blockedSenders || []
                    );
                  }}
                />
              )}

              {item.filterMode === 'blocklist' && (
                <FilterList
                  title="Blocked users"
                  list={item.blockedSenders || []}
                  onAdd={user => {
                    const updated = [...(item.blockedSenders || []), user];
                    updateFilter(
                      item.topicId,
                      'blocklist',
                      item.allowedSenders || [],
                      updated
                    );
                  }}
                  onRemove={user => {
                    const updated = (item.blockedSenders || []).filter(
                      u => u !== user
                    );
                    updateFilter(
                      item.topicId,
                      'blocklist',
                      item.allowedSenders || [],
                      updated
                    );
                  }}
                />
              )}

              <Button
                title="Unsubscribe"
                color="red"
                onPress={() => unsubscribeFromTopic(item.topicId)}
              />
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  scroll: { padding: 20 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 10 },
  status: { fontSize: 14, color: '#666', marginBottom: 20 },
  label: { fontSize: 16, fontWeight: '600', marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    fontSize: 16,
  },
  empty: { color: '#999', marginTop: 10 },
  topicCard: {
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 10,
    padding: 15,
    marginBottom: 15,
  },
  topicText: { fontSize: 16, fontWeight: '600', marginBottom: 10 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 6,
  },
});

export default App;