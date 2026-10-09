import React, { useEffect, useState } from 'react';
import {
  SafeAreaView,
  Text,
  StyleSheet,
  TextInput,
  View,
  ScrollView,
  Alert,
  Switch,
  Platform,
  PermissionsAndroid,
  AppState,
  Image,
  Pressable,
  Linking,
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
import {
  classifyMeritocracy,
  previewMeritocracy,
  placeUrl,
  type MeritocracyView,
} from './meritocracyFormat';

const BACKEND_URL = 'http://10.18.36.100:3000';

function formatTime(date: Date | string = new Date()) {
  const d = new Date(date);

  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();

  const hours = String(d.getHours()).padStart(2, '0');     // always 24h
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');

  return `${day}/${month}/${year}, ${hours}:${minutes}:${seconds}`;
}

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
    <View style={styles.filterBlock}>
      <Text style={styles.label}>{title}</Text>

      {list.map(user => (
        <View key={user} style={styles.person}>
          <Text style={styles.personName}>{user}</Text>
          <Pressable style={styles.stopBtn} onPress={() => onRemove(user)}>
            <Text style={styles.stopText}>Remove</Text>
          </Pressable>
        </View>
      ))}

      <TextInput
        style={styles.input}
        placeholder="0.0.12345 or username"
        placeholderTextColor="#5e6474"
        value={input}
        onChangeText={setInput}
        autoCapitalize="none"
      />
      <Pressable
        style={styles.goBtn}
        onPress={() => {
          if (input.trim()) {
            onAdd(input.trim());
            setInput('');
          }
        }}>
        <Text style={styles.goText}>Add</Text>
      </Pressable>
    </View>
  );
}

function MessageBody({
  raw,
  topicId,
  payer,
}: {
  raw: string;
  topicId?: string;
  payer?: string;
}) {
  const view = classifyMeritocracy(raw);
  if (!view) {
    return <Text style={styles.rawBody}>{raw}</Text>;
  }
  if (view.kind === 'chat') {
    return (
      <View style={styles.chatBubble}>
        <Text style={styles.chatBody}>
          {view.text.trim() ? view.text : '(empty message)'}
        </Text>
      </View>
    );
  }
  if (view.kind === 'encrypted-chat' || view.kind === 'encrypted') {
    return (
      <View style={styles.kindCard}>
        <Text style={[styles.kindLabel, styles.kindGold]}>
          {view.kind === 'encrypted-chat' ? 'Encrypted chat' : 'Encrypted'}
        </Text>
        <Text style={styles.chatBody}>
          {view.kind === 'encrypted-chat'
            ? 'Encrypted chat message'
            : 'Encrypted message'}
        </Text>
      </View>
    );
  }
  if (view.kind === 'marker-delete' || view.kind === 'polygon-delete') {
    const label = view.kind === 'marker-delete' ? 'Marker' : 'Polygon';
    return (
      <View style={styles.kindCard}>
        <Text style={[styles.kindLabel, label === 'Polygon' && styles.kindBlue]}>
          {label}
        </Text>
        <Text style={styles.chatBody}>
          {label} #{view.number} removed
        </Text>
      </View>
    );
  }
  return <PlaceCard view={view} topicId={topicId} payer={payer} />;
}

function PlaceCard({
  view,
  topicId,
  payer,
}: {
  view: Extract<MeritocracyView, { kind: 'marker' | 'polygon' }>;
  topicId?: string;
  payer?: string;
}) {
  const label = view.kind === 'marker' ? 'Marker' : 'Polygon';
  const video = /\.(mp4|webm)(\?|#|$)/i.test(view.image);
  return (
    <View style={[styles.kindCard, styles.placeCard]}>
      <Text style={[styles.kindLabel, label === 'Polygon' && styles.kindBlue]}>
        {label}
        {view.number ? `  #${view.number}` : ''}
      </Text>
      {view.title.trim() ? (
        <Text style={styles.cardTitle}>{view.title}</Text>
      ) : null}
      {view.text.trim() ? (
        <Text style={styles.chatBody}>{view.text}</Text>
      ) : null}
      {view.cord.trim() ? <Text style={styles.cord}>{view.cord}</Text> : null}
      {view.image && !video ? (
        <Image source={{ uri: view.image }} style={styles.cardImage} />
      ) : null}
      {video ? <Text style={styles.cord}>Video attached</Text> : null}
      <Pressable
        style={styles.openBtn}
        onPress={() => {
          const url = placeUrl({
            kind: view.kind,
            topicId,
            payer,
            number: view.number,
            cord: view.cord,
          });
          Linking.openURL(url);
        }}>
        <Text style={styles.openText}>Open on the map</Text>
      </Pressable>
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
  {
    id: string;
    title: string;          // topic id
    body: string;           // pure message text
    topicId?: string;
    time: string;
    payerId?: string;       // the account that sent it
    username?: string;      // optional display name
  }[]
>([]);
  const [screen, setScreen] = useState<
    'inbox' | 'thread' | 'person' | 'topics' | 'settings' | 'account'
  >('inbox');
  const [openTopic, setOpenTopic] = useState('');
  const [openUser, setOpenUser] = useState('');
  const [inboxBy, setInboxBy] = useState<'topic' | 'user'>('topic');
  const [topicQuery, setTopicQuery] = useState('');
  const [seenIds, setSeenIds] = useState<string[]>([]);
  const [picking, setPicking] = useState<'' | 'message' | 'chat'>('');
  const [picked, setPicked] = useState<string[]>([]);
  const [domainRows, setDomainRows] = useState<
    { domain: string; topicId: string; expiresAt: number }[]
  >([]);

  function domainFor(id: string) {
    let best: { domain: string; expiresAt: number } | null = null;
    for (const row of domainRows) {
      if (row.topicId !== id) continue;
      if (!best || row.expiresAt > best.expiresAt) best = row;
    }
    return best ? best.domain : '';
  }

  function topicLabel(id: string) {
    const domain = domainFor(id);
    return domain ? `${domain} (${id})` : id;
  }

  async function loadDomains() {
    try {
      const response = await fetch(`${BACKEND_URL}/api/domains`);
      const data = (await response.json()) as {
        domains?: { domain: string; topicId: string; expiresAt: number }[];
      };
      if (Array.isArray(data.domains)) setDomainRows(data.domains);
    } catch (error) {
      console.error('Failed to load domains:', error);
    }
  }

  useEffect(() => {
    setupNotifications();
    loadDomains();
    AsyncStorage.getItem('seenMessageIds')
      .then(raw => {
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setSeenIds(parsed.map(String));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (screen !== 'thread' && screen !== 'person') return;
    const ids = messages
      .filter(message =>
        screen === 'thread'
          ? (message.topicId || message.title) === openTopic
          : (message.payerId || message.username || 'Unknown') === openUser
      )
      .map(message => message.id);
    if (ids.length === 0) return;
    setSeenIds(prev => {
      if (ids.every(id => prev.includes(id))) return prev;
      const next = [...new Set([...prev, ...ids])];
      AsyncStorage.setItem('seenMessageIds', JSON.stringify(next));
      return next;
    });
  }, [screen, openTopic, openUser, messages]);

  // Reload when app comes back to foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', nextState => {
      if (nextState === 'active' && walletAddress) {
        loadMessages(walletAddress);
        loadDomains();
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
    const data = remoteMessage?.data || {};
    const title = String(
      remoteMessage?.notification?.title ||
        data.title ||
        'Hedera'
    );

    // Banner text is a short preview. The list keeps the raw consensus
    // message from data.message so Meritocracy cards can be built from it.
    const fullBody = String(
      remoteMessage?.notification?.body || data.body || ''
    );

    const topicId = data.topicId ? String(data.topicId) : undefined;

    if (!fullBody && !data.message && title === 'Hedera') return;

    let username: string | undefined = data.username
      ? String(data.username)
      : undefined;
    let payerId: string | undefined = data.payer ? String(data.payer) : undefined;
    let body = data.message ? String(data.message) : '';

    if (!body) {
      body = fullBody;
      const match = fullBody.match(/^(.*?)\s*(?:\((0\.0\.\d+)\))?:\s*(.*)$/);
      if (match) {
        const possibleName = match[1]?.trim();
        const possiblePayer = match[2];
        const possibleBody = match[3]?.trim();

        if (possiblePayer) {
          username = username || possibleName || undefined;
          payerId = payerId || possiblePayer;
          body = possibleBody || fullBody;
        } else if (possibleName?.match(/^0\.0\.\d+$/)) {
          payerId = payerId || possibleName;
          body = possibleBody || fullBody;
        }
      }
    }
  
    const item = {
      id: `${Date.now()}-${Math.random()}`,
      title,                    // topic id
      body,                     // raw consensus message
      topicId,
      time: formatTime(),       // use the same helper we created earlier
      payerId,
      username,
    };
  
    setMessages(prev => {
      // Avoid duplicates if the same message arrives multiple times
      if (prev.some(m => m.body === item.body && m.topicId === item.topicId)) {
        return prev;
      }
  
      const next = [item, ...prev].slice(0, 100);
      AsyncStorage.setItem('messages', JSON.stringify(next));
      return next;
    });
  }

  // Foreground messages
  useEffect(() => {
    const unsubscribe = messaging().onMessage(async remoteMessage => {
      addMessageFromRemote(remoteMessage);
    
      const data = remoteMessage.data || {};
    
      const title = String(data.title || data.topicId || 'Hedera');
      const body = String(data.body || '');
      const topicId = data.topicId ? String(data.topicId) : undefined;
    
      await notifee.displayNotification({
        title,
        body,
        android: {
          channelId: 'hedera-messages',
          pressAction: { id: 'default' },
          importance: AndroidImportance.HIGH,
          sound: 'default',
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

  async function removeFromServer(body: Record<string, unknown>) {
    if (!walletAddress) return;
    try {
      await fetch(`${BACKEND_URL}/api/messages/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress, ...body }),
      });
    } catch (error) {
      console.log('delete messages failed', error);
    }
  }

  function dropMessages(
    keep: (message: (typeof messages)[number]) => boolean,
    serverBody: Record<string, unknown>
  ) {
    setMessages(prev => {
      const next = prev.filter(keep);
      AsyncStorage.setItem('messages', JSON.stringify(next));
      return next;
    });
    removeFromServer(serverBody);
    setPicking('');
    setPicked([]);
  }

  function confirmDelete(label: string, run: () => void) {
    Alert.alert(`Delete ${label}?`, undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: run },
    ]);
  }

  function beginPick(kind: 'message' | 'chat', id: string) {
    setPicking(kind);
    setPicked([id]);
  }

  function togglePick(id: string) {
    setPicked(prev => {
      const next = prev.includes(id)
        ? prev.filter(item => item !== id)
        : [...prev, id];
      if (next.length === 0) setPicking('');
      return next;
    });
  }

  function cancelPick() {
    setPicking('');
    setPicked([]);
  }

  function deletePicked() {
    if (picked.length === 0) return;
    const label =
      picking === 'chat'
        ? picked.length === 1
          ? 'this chat'
          : `${picked.length} chats`
        : picked.length === 1
        ? 'this message'
        : `${picked.length} messages`;
    confirmDelete(label, () => {
      if (picking === 'message') {
        const ids = picked;
        const left = messages.filter(message => !ids.includes(message.id));
        const openGone =
          screen === 'thread'
            ? !left.some(message => (message.topicId || message.title) === openTopic)
            : screen === 'person' &&
              !left.some(
                message =>
                  (message.payerId || message.username || 'Unknown') === openUser
              );
        dropMessages(message => !ids.includes(message.id), { ids });
        if (openGone) setScreen('inbox');
        return;
      }
      const keys = picked;
      if (inboxBy === 'user') {
        dropMessages(
          message => !keys.includes(message.payerId || message.username || 'Unknown'),
          { payers: keys }
        );
        return;
      }
      dropMessages(
        message => !keys.includes(message.topicId || message.title || ''),
        { topicIds: keys }
      );
      if (screen === 'thread' && keys.includes(openTopic)) setScreen('inbox');
    });
  }

  function deleteOpenChat() {
    const label =
      screen === 'person'
        ? messages.find(
            message => (message.payerId || message.username || 'Unknown') === openUser
          )?.username || openUser
        : topicLabel(openTopic);
    confirmDelete(`chat ${label}`, () => {
      if (screen === 'person') {
        dropMessages(
          message => (message.payerId || message.username || 'Unknown') !== openUser,
          { payers: [openUser] }
        );
      } else {
        dropMessages(
          message => (message.topicId || message.title) !== openTopic,
          { topicIds: [openTopic] }
        );
      }
      setScreen('inbox');
    });
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

      console.log('Backend response:', JSON.stringify(data, null, 2)); // ← add this


      if (data.success && data.messages) {
          setMessages(
            data.messages.map((m: any) => ({
              id: String(m.id),
              title: m.topic_id,
              body: m.body,
              topicId: m.topic_id,
              time: formatTime(m.created_at),
              payerId: m.payer || m.payer_account_id || undefined,  // real account
              username: m.sender || m.username || undefined,        // the handle
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
        domain?: string;
        error?: string;
      };

      if (data.success) {
        const finalTopicId = data.topicId || cleaned;
        const subscribedDomain = data.domain;

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
        if (subscribedDomain) loadDomains();
        Alert.alert(
          'Subscribed',
          subscribedDomain
            ? `${subscribedDomain} (${finalTopicId})`
            : `Listening to ${finalTopicId}`
        );
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

  function goBack() {
    setScreen(screen === 'settings' ? 'topics' : 'inbox');
  }

  const topicGroups = (() => {
    const map = new Map<string, typeof messages>();
    for (const message of messages) {
      const key = message.topicId || message.title || 'Unknown';
      const list = map.get(key);
      if (list) list.push(message);
      else map.set(key, [message]);
    }
    return [...map.entries()].map(([id, rows]) => ({
      id,
      rows,
      latest: rows[0],
    }));
  })();
  const userGroups = (() => {
    const map = new Map<string, typeof messages>();
    for (const message of messages) {
      const key = message.payerId || message.username || 'Unknown';
      const list = map.get(key);
      if (list) list.push(message);
      else map.set(key, [message]);
    }
    return [...map.entries()].map(([id, rows]) => {
      const latest = [...rows].sort(
        (a, b) => messageTime(b.time) - messageTime(a.time)
      )[0];
      const name = rows.find(row => row.username)?.username || id;
      return { id, name, rows, latest };
    });
  })();
  const needle = topicQuery.trim().toLowerCase();
  const visibleGroups = topicGroups.filter(group => {
    if (!needle) return true;
    const preview = previewMeritocracy(group.latest.body).toLowerCase();
    return (
      group.id.toLowerCase().includes(needle) ||
      domainFor(group.id).toLowerCase().includes(needle) ||
      preview.includes(needle) ||
      (group.latest.username || '').toLowerCase().includes(needle)
    );
  });
  const visibleSubs = subscribedTopics.filter(
    item =>
      !needle ||
      item.topicId.toLowerCase().includes(needle) ||
      domainFor(item.topicId).toLowerCase().includes(needle)
  );
  const openSub = subscribedTopics.find(item => item.topicId === openTopic);
  const visibleUsers = userGroups.filter(group => {
    if (!needle) return true;
    const preview = previewMeritocracy(group.latest.body).toLowerCase();
    return (
      group.name.toLowerCase().includes(needle) ||
      group.id.toLowerCase().includes(needle) ||
      preview.includes(needle) ||
      (group.latest.topicId || '').toLowerCase().includes(needle) ||
      domainFor(group.latest.topicId || '').toLowerCase().includes(needle)
    );
  });
  const thread = messages.filter(
    message => (message.topicId || message.title) === openTopic
  );
  const personName =
    userGroups.find(group => group.id === openUser)?.name || openUser;
  const personThread = messages.filter(
    message => (message.payerId || message.username || 'Unknown') === openUser
  );
  const browsing = screen === 'inbox' || screen === 'topics';
  const headerTitle =
    screen === 'person'
      ? personName
      : screen === 'thread' || screen === 'settings'
      ? topicLabel(openTopic)
      : screen === 'topics'
      ? 'Topics'
      : screen === 'account'
      ? 'Wallet'
      : 'Inbox';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        {picking || !browsing ? (
          <Pressable onPress={picking ? cancelPick : goBack} hitSlop={8}>
            <Text style={styles.back}>{picking ? 'Cancel' : 'Back'}</Text>
          </Pressable>
        ) : (
          <Text style={styles.brand}>Notifier</Text>
        )}
        <Text style={styles.headerTitle} numberOfLines={1}>
          {picking ? `${picked.length} selected` : headerTitle}
        </Text>
        {picking || screen === 'thread' || screen === 'person' ? (
          <Pressable onPress={picking ? deletePicked : deleteOpenChat} hitSlop={8}>
            <Text style={styles.danger}>Delete</Text>
          </Pressable>
        ) : (
          <Pressable style={styles.chip} onPress={() => setScreen('account')}>
            <Text style={styles.chipText} numberOfLines={1}>
              {walletAddress ? walletAddress.replace(/^0\.0\./, '') : 'Wallet'}
            </Text>
          </Pressable>
        )}
      </View>
      <Text style={styles.status}>
        {picking
          ? 'Tap more to select'
          : screen === 'thread' || screen === 'person'
          ? 'Hold a message to select'
          : browsing
          ? `${subscribedTopics.length} topics · ${status}`
          : status}
      </Text>
      {browsing && !picking ? (
        <TextInput
          style={styles.search}
          placeholder="Find a topic or domain"
          placeholderTextColor="#5e6474"
          value={topicQuery}
          onChangeText={setTopicQuery}
          autoCapitalize="none"
        />
      ) : null}
      {screen === 'inbox' && !picking ? (
        <View style={styles.groupRow}>
          <Pressable
            style={[inboxBy === 'topic' ? styles.goBtn : styles.quietBtn, styles.modeBtn]}
            onPress={() => {
              setInboxBy('topic');
              if (picking === 'chat') cancelPick();
            }}>
            <Text style={inboxBy === 'topic' ? styles.goText : styles.quietText}>
              By topic
            </Text>
          </Pressable>
          <Pressable
            style={[inboxBy === 'user' ? styles.goBtn : styles.quietBtn, styles.modeBtn]}
            onPress={() => {
              setInboxBy('user');
              if (picking === 'chat') cancelPick();
            }}>
            <Text style={inboxBy === 'user' ? styles.goText : styles.quietText}>
              By user
            </Text>
          </Pressable>
        </View>
      ) : null}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled">
        {screen === 'inbox' && inboxBy === 'user' &&
          (visibleUsers.length === 0 ? (
            <Text style={styles.empty}>
              {messages.length === 0 ? 'No messages yet' : 'No user matches'}
            </Text>
          ) : (
            visibleUsers
              .slice()
              .sort((a, b) => messageTime(b.latest.time) - messageTime(a.latest.time))
              .map(group => {
                const topicName = group.latest.topicId
                  ? topicLabel(group.latest.topicId)
                  : 'Topic';
                const preview = clipPreview(
                  `${topicName}: ${previewMeritocracy(group.latest.body)}`
                );
                const unread = group.rows.filter(row => !seenIds.includes(row.id)).length;
                return (
                  <Pressable
                    key={group.id}
                    style={[styles.topicRow, picked.includes(group.id) && styles.pickedRow]}
                    onLongPress={() =>
                      picking === 'chat' ? togglePick(group.id) : beginPick('chat', group.id)
                    }
                    onPress={() => {
                      if (picking === 'chat') {
                        togglePick(group.id);
                        return;
                      }
                      if (picking) return;
                      setOpenUser(group.id);
                      setScreen('person');
                    }}>
                    <View style={[styles.dot, { backgroundColor: toneOf(group.latest.body) }]} />
                    <View style={styles.topicCopy}>
                      <Text style={styles.topicId} numberOfLines={1}>
                        {group.name}
                      </Text>
                      <Text
                        style={[styles.preview, unread > 0 && styles.unreadPreview]}
                        numberOfLines={1}>
                        {group.name === group.id ? preview : `${group.id} · ${preview}`}
                      </Text>
                    </View>
                    <View style={styles.topicMeta}>
                      <Text style={styles.when}>{shortClock(group.latest.time)}</Text>
                      {unread > 0 ? (
                        <View style={[styles.count, styles.countHot]}>
                          <Text style={styles.countHotText}>{unread}</Text>
                        </View>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })
          ))}

        {screen === 'inbox' && inboxBy === 'topic' &&
          (visibleGroups.length === 0 ? (
            <Text style={styles.empty}>
              {messages.length === 0 ? 'No messages yet' : 'No topic matches'}
            </Text>
          ) : (
            visibleGroups.map(group => {
              const preview = clipPreview(
                `${group.latest.username || group.latest.payerId || 'Someone'}: ${previewMeritocracy(group.latest.body)}`
              );
              const unread = group.rows.filter(row => !seenIds.includes(row.id)).length;
              return (
                <Pressable
                  key={group.id}
                  style={[styles.topicRow, picked.includes(group.id) && styles.pickedRow]}
                  onLongPress={() =>
                    picking === 'chat' ? togglePick(group.id) : beginPick('chat', group.id)
                  }
                  onPress={() => {
                    if (picking === 'chat') {
                      togglePick(group.id);
                      return;
                    }
                    if (picking) return;
                    setOpenTopic(group.id);
                    setScreen('thread');
                  }}>
                  <View style={[styles.dot, { backgroundColor: toneOf(group.latest.body) }]} />
                  <View style={styles.topicCopy}>
                    <Text style={styles.topicId} numberOfLines={1}>
                      {topicLabel(group.id)}
                    </Text>
                    <Text
                      style={[styles.preview, unread > 0 && styles.unreadPreview]}
                      numberOfLines={1}>
                      {preview}
                    </Text>
                  </View>
                  <View style={styles.topicMeta}>
                    <Text style={styles.when}>{shortClock(group.latest.time)}</Text>
                    {unread > 0 ? (
                      <View style={[styles.count, styles.countHot]}>
                        <Text style={styles.countHotText}>{unread}</Text>
                      </View>
                    ) : null}
                  </View>
                </Pressable>
              );
            })
          ))}

        {screen === 'person' &&
          (personThread.length === 0 ? (
            <Text style={styles.empty}>No messages from this user</Text>
          ) : (
            personThread.map(message => (
              <Pressable
                key={message.id}
                onLongPress={() =>
                  picking === 'message'
                    ? togglePick(message.id)
                    : beginPick('message', message.id)
                }
                onPress={() => {
                  if (picking === 'message') togglePick(message.id);
                }}
                style={[
                  styles.message,
                  picking === 'message' && styles.messagePick,
                  picked.includes(message.id) && styles.pickedRow,
                ]}>
                {picking === 'message' ? (
                  <View style={[styles.tick, picked.includes(message.id) && styles.tickOn]} />
                ) : null}
                <View style={styles.messageCopy}>
                  <Text style={styles.where}>
                    {topicLabel(message.topicId || message.title || '')}
                  </Text>
                  <MessageBody
                    raw={message.body}
                    topicId={message.topicId || message.title}
                    payer={message.payerId}
                  />
                  <Text style={styles.time}>{message.time}</Text>
                </View>
              </Pressable>
            ))
          ))}

        {screen === 'thread' &&
          (thread.length === 0 ? (
            <Text style={styles.empty}>No messages in this topic</Text>
          ) : (
            thread.map(message => (
              <Pressable
                key={message.id}
                onLongPress={() =>
                  picking === 'message'
                    ? togglePick(message.id)
                    : beginPick('message', message.id)
                }
                onPress={() => {
                  if (picking === 'message') togglePick(message.id);
                }}
                style={[
                  styles.message,
                  picking === 'message' && styles.messagePick,
                  picked.includes(message.id) && styles.pickedRow,
                ]}>
                {picking === 'message' ? (
                  <View style={[styles.tick, picked.includes(message.id) && styles.tickOn]} />
                ) : null}
                <View style={styles.messageCopy}>
                  {message.username || message.payerId ? (
                    <Text style={styles.sender}>
                      {message.username || 'Someone'}
                      {message.payerId ? (
                        <Text style={styles.payer}> {message.payerId}</Text>
                      ) : null}
                    </Text>
                  ) : null}
                  <MessageBody
                    raw={message.body}
                    topicId={message.topicId || message.title}
                    payer={message.payerId}
                  />
                  <Text style={styles.time}>{message.time}</Text>
                </View>
              </Pressable>
            ))
          ))}

        {screen === 'topics' && (
          <>
            <View style={styles.composer}>
              <TextInput
                style={styles.searchInline}
                placeholder="0.0.12345 or domain"
                placeholderTextColor="#5e6474"
                value={topicId}
                onChangeText={setTopicId}
                autoCapitalize="none"
              />
              <Pressable style={styles.goBtn} onPress={subscribeToTopic}>
                <Text style={styles.goText}>Add</Text>
              </Pressable>
            </View>
            {visibleSubs.length === 0 ? (
              <Text style={styles.empty}>No topics yet</Text>
            ) : (
              visibleSubs.map(item => {
                const mode =
                  item.filterMode === 'allowlist'
                    ? 'Allow list'
                    : item.filterMode === 'blocklist'
                    ? 'Block list'
                    : 'Everyone';
                const detail = `${mode}${item.showFullMessage ? ' · full text' : ' · sender only'}`;
                return (
                <Pressable
                  key={item.topicId}
                  style={styles.topicRow}
                  onPress={() => {
                    setOpenTopic(item.topicId);
                    setScreen('settings');
                  }}>
                  <View style={[styles.dot, { backgroundColor: '#22d3ee' }]} />
                  <View style={styles.topicCopy}>
                    <Text style={styles.topicId} numberOfLines={1}>
                      {topicLabel(item.topicId)}
                    </Text>
                    <Text style={styles.preview} numberOfLines={1}>
                      {detail}
                    </Text>
                  </View>
                  <Text style={styles.when}>Edit</Text>
                </Pressable>
                );
              })
            )}
          </>
        )}

        {screen === 'settings' &&
          (!openSub ? (
            <Text style={styles.empty}>This topic is gone</Text>
          ) : (
            <View style={styles.sheet}>
              <View style={styles.line}>
                <Text style={styles.personName}>Show full message</Text>
                <Switch
                  value={openSub.showFullMessage}
                  onValueChange={value =>
                    toggleShowFullMessage(openSub.topicId, value)
                  }
                  trackColor={{ false: '#2a2f3a', true: '#22d3ee' }}
                  thumbColor="#ffffff"
                />
              </View>
              <View style={styles.modes}>
                {(['all', 'allowlist', 'blocklist'] as const).map(mode => (
                  <Pressable
                    key={mode}
                    style={[
                      openSub.filterMode === mode ? styles.goBtn : styles.quietBtn,
                      styles.modeBtn,
                    ]}
                    onPress={() =>
                      updateFilter(
                        openSub.topicId,
                        mode,
                        openSub.allowedSenders || [],
                        openSub.blockedSenders || []
                      )
                    }>
                    <Text
                      style={
                        openSub.filterMode === mode ? styles.goText : styles.quietText
                      }>
                      {mode === 'all'
                        ? 'Everyone'
                        : mode === 'allowlist'
                        ? 'Allow list'
                        : 'Block list'}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {openSub.filterMode === 'allowlist' && (
                <FilterList
                  title="Allowed users"
                  list={openSub.allowedSenders || []}
                  onAdd={user =>
                    updateFilter(openSub.topicId, 'allowlist', [
                      ...(openSub.allowedSenders || []),
                      user,
                    ], openSub.blockedSenders || [])
                  }
                  onRemove={user =>
                    updateFilter(
                      openSub.topicId,
                      'allowlist',
                      (openSub.allowedSenders || []).filter(entry => entry !== user),
                      openSub.blockedSenders || []
                    )
                  }
                />
              )}
              {openSub.filterMode === 'blocklist' && (
                <FilterList
                  title="Blocked users"
                  list={openSub.blockedSenders || []}
                  onAdd={user =>
                    updateFilter(
                      openSub.topicId,
                      'blocklist',
                      openSub.allowedSenders || [],
                      [...(openSub.blockedSenders || []), user]
                    )
                  }
                  onRemove={user =>
                    updateFilter(
                      openSub.topicId,
                      'blocklist',
                      openSub.allowedSenders || [],
                      (openSub.blockedSenders || []).filter(entry => entry !== user)
                    )
                  }
                />
              )}
              <Pressable
                style={styles.stopWide}
                onPress={() => {
                  unsubscribeFromTopic(openSub.topicId);
                  setScreen('topics');
                }}>
                <Text style={styles.stopText}>Unsubscribe</Text>
              </Pressable>
            </View>
          ))}

        {screen === 'account' && (
          <View style={styles.sheet}>
            {walletAddress ? (
              <>
                <Text style={styles.accountLine}>Connected as {walletAddress}</Text>
                <Pressable style={styles.stopWide} onPress={handleDisconnectWallet}>
                  <Text style={styles.stopText}>Disconnect wallet</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Pressable style={styles.goBtn} onPress={handleConnectWallet}>
                  <Text style={styles.goText}>Connect wallet</Text>
                </Pressable>
                {pairingUri ? (
                  <View style={styles.pairing}>
                    <Text style={styles.accountLine}>
                      Pairing code. Paste this into HashPack.
                    </Text>
                    <Text selectable style={styles.code}>
                      {pairingUri}
                    </Text>
                    <Pressable
                      style={styles.quietBtn}
                      onPress={() => {
                        Clipboard.setString(pairingUri);
                        Alert.alert(
                          'Copied',
                          'Paste this into HashPack â†’ WalletConnect / Connect dApp'
                        );
                      }}>
                      <Text style={styles.quietText}>Copy code</Text>
                    </Pressable>
                  </View>
                ) : null}
              </>
            )}
            <Pressable style={styles.quietWide} onPress={clearAllMessages}>
              <Text style={styles.quietText}>Clear all messages</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      {browsing ? (
        <View style={styles.nav}>
          <Pressable style={styles.tab} onPress={() => setScreen('inbox')}>
            <Text style={screen === 'inbox' ? styles.tabOn : styles.tabOff}>
              Inbox
            </Text>
          </Pressable>
          <Pressable style={styles.tab} onPress={() => setScreen('topics')}>
            <Text style={screen === 'topics' ? styles.tabOn : styles.tabOff}>
              Topics
            </Text>
          </Pressable>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

function clipPreview(text: string, max = 52) {
  const value = text.replace(/\s+/g, ' ').trim();
  return value.length > max ? value.slice(0, max - 1) + 'â€¦' : value;
}

function messageTime(time: string) {
  const match = String(time).match(
    /(\d{2})\/(\d{2})\/(\d{4}),\s*(\d{2}):(\d{2}):(\d{2})/
  );
  if (!match) return 0;
  return new Date(
    +match[3],
    +match[2] - 1,
    +match[1],
    +match[4],
    +match[5],
    +match[6]
  ).getTime();
}

function shortClock(time: string) {
  const match = String(time).match(/(\d{2}:\d{2})/);
  return match ? match[1] : time;
}

function toneOf(raw: string) {
  const view = classifyMeritocracy(raw);
  if (!view) return '#5e6474';
  if (view.kind === 'polygon' || view.kind === 'polygon-delete') return '#7c9eff';
  if (view.kind === 'encrypted' || view.kind === 'encrypted-chat') return '#e3c07a';
  return '#22d3ee';
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 8,
  },
  brand: {
    width: 72,
    color: '#22d3ee',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  back: { minWidth: 72, color: '#22d3ee', fontSize: 15, fontWeight: '600' },
  danger: { color: '#f07178', fontSize: 15, fontWeight: '700' },
  headerTitle: {
    flex: 1,
    color: '#e6e6f0',
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  chip: {
    maxWidth: 110,
    borderWidth: 1,
    borderColor: 'rgba(230,230,240,0.12)',
    backgroundColor: '#12141a',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipText: { color: '#e6e6f0', fontSize: 12, fontWeight: '700' },
  status: { color: '#5e6474', fontSize: 12, marginHorizontal: 16, marginBottom: 8, marginTop: 6 },
  search: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: '#12141a',
    borderWidth: 1,
    borderColor: 'rgba(230,230,240,0.08)',
    color: '#e6e6f0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 12, paddingBottom: 16 },
  topicRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(230,230,240,0.08)',
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  topicCopy: { flex: 1 },
  topicId: { color: '#e6e6f0', fontSize: 14, fontWeight: '700' },
  preview: { color: '#8d93a5', fontSize: 13, marginTop: 3 },
  unreadPreview: { color: '#e6e6f0' },
  pickedRow: { backgroundColor: 'rgba(34,211,238,0.1)' },
  topicMeta: { alignItems: 'flex-end' },
  when: { color: '#5e6474', fontSize: 12 },
  where: { color: '#22d3ee', fontSize: 12, fontWeight: '700', marginBottom: 6 },
  groupRow: {
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  count: {
    marginTop: 6,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    backgroundColor: 'rgba(34,211,238,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: { color: '#22d3ee', fontSize: 11, fontWeight: '700' },
  countHot: { backgroundColor: '#22d3ee' },
  countHotText: { color: '#062226', fontSize: 11, fontWeight: '700' },
  message: { paddingVertical: 10 },
  messagePick: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  messageCopy: { flex: 1 },
  tick: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#5e6474',
    marginTop: 8,
  },
  tickOn: { backgroundColor: '#22d3ee', borderColor: '#22d3ee' },
  sender: { color: '#e6e6f0', fontWeight: '700', fontSize: 13, marginBottom: 6 },
  payer: { color: '#5e6474', fontWeight: '500' },
  time: { color: '#5e6474', fontSize: 11, marginTop: 6 },
  chatBubble: {
    backgroundColor: '#181c24',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  chatBody: { color: '#e6e6f0', fontSize: 15, lineHeight: 21 },
  rawBody: {
    color: '#8d93a5',
    fontSize: 12,
    lineHeight: 18,
    backgroundColor: '#101217',
    borderRadius: 12,
    padding: 10,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  kindCard: {
    backgroundColor: '#181c24',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(230,230,240,0.08)',
    overflow: 'hidden',
    padding: 12,
  },
  kindLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: '#22d3ee',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  kindBlue: { color: '#7c9eff' },
  kindGold: { color: '#e3c07a' },
  cardTitle: { color: '#e6e6f0', fontSize: 18, fontWeight: '700', marginBottom: 6 },
  cord: { color: '#8d93a5', fontSize: 12, marginTop: 8 },
  cardImage: {
    width: '100%',
    height: 160,
    borderRadius: 12,
    marginTop: 8,
    backgroundColor: '#0e1014',
  },
  placeCard: { paddingBottom: 52 },
  openBtn: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    backgroundColor: '#22d3ee',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  openText: { color: '#062226', fontWeight: '700', fontSize: 13 },
  composer: { flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 8 },
  searchInline: {
    flex: 1,
    backgroundColor: '#12141a',
    borderWidth: 1,
    borderColor: 'rgba(230,230,240,0.08)',
    color: '#e6e6f0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  goBtn: {
    backgroundColor: '#22d3ee',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  goText: { color: '#062226', fontWeight: '700', fontSize: 14 },
  quietBtn: {
    backgroundColor: '#12141a',
    borderWidth: 1,
    borderColor: 'rgba(230,230,240,0.08)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  quietText: { color: '#e6e6f0', fontWeight: '600', fontSize: 13 },
  quietWide: {
    marginTop: 18,
    backgroundColor: '#12141a',
    borderWidth: 1,
    borderColor: 'rgba(230,230,240,0.08)',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  stopBtn: {
    borderWidth: 1,
    borderColor: 'rgba(240,113,120,0.45)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  stopWide: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: 'rgba(240,113,120,0.45)',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  stopText: { color: '#f07178', fontWeight: '700' },
  modes: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  modeBtn: { flex: 1 },
  line: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    marginBottom: 8,
  },
  sheet: { paddingVertical: 8 },
  filterBlock: { marginVertical: 8 },
  label: { color: '#e6e6f0', fontSize: 15, fontWeight: '700', marginBottom: 8 },
  input: {
    backgroundColor: '#12141a',
    borderWidth: 1,
    borderColor: 'rgba(230,230,240,0.08)',
    color: '#e6e6f0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    marginTop: 8,
    marginBottom: 8,
  },
  person: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(230,230,240,0.08)',
  },
  personName: { color: '#e6e6f0', fontSize: 15, flex: 1 },
  accountLine: { color: '#8d93a5', fontSize: 15, lineHeight: 22, marginBottom: 12 },
  pairing: { marginTop: 16 },
  code: {
    color: '#8d93a5',
    fontSize: 12,
    backgroundColor: '#12141a',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  empty: { color: '#8d93a5', textAlign: 'center', paddingVertical: 28 },
  nav: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: 'rgba(230,230,240,0.08)',
    backgroundColor: '#0d0e12',
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 16 },
  tabOn: { color: '#22d3ee', fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', fontSize: 13 },
  tabOff: { color: '#5e6474', fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', fontSize: 13 },
});

export default App;
