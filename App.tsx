import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  StatusBar,
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
  Animated,
  Easing,
  AccessibilityInfo,
} from 'react-native';
import {
  initialWindowMetrics,
  SafeAreaProvider,
  SafeAreaView,
} from 'react-native-safe-area-context';
import messaging from '@react-native-firebase/messaging';
import notifee, { AndroidImportance } from '@notifee/react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Path } from 'react-native-svg';
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
import {
  DUMMY_FOLLOWING,
  USE_DUMMY_SUGGESTIONS,
  dummyResolve,
  type FollowingResponse,
  type ResolveResponse,
} from './devDummySuggestions';

const BACKEND_URL = 'https://hedera-notifications-backend-production.up.railway.app';
const DEFAULT_AVATAR =
  'https://kiloscribe.com/api/inscription-cdn/0.0.4819119';

function PinMark({ on }: { on: boolean }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24">
      <Path
        d="M16 9V4h1a1 1 0 0 0 0-2H7a1 1 0 0 0 0 2h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1.03 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3z"
        fill={on ? '#22d3ee' : '#5e6474'}
      />
    </Svg>
  );
}

function PinButton({
  on,
  label,
  onPress,
}: {
  on: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={styles.pinBtn}
      accessibilityRole="button"
      accessibilityLabel={on ? `Unpin ${label}` : `Pin ${label}`}
      accessibilityState={{ selected: on }}
      hitSlop={6}
      onPress={onPress}>
      <PinMark on={on} />
    </Pressable>
  );
}

function floatPins<T>(rows: T[], pins: string[], idOf: (row: T) => string) {
  const rank = new Map(pins.map((id, index) => [id, index]));
  return rows
    .map((row, index) => ({
      row,
      index,
      pin: rank.has(idOf(row)) ? (rank.get(idOf(row)) as number) : Number.POSITIVE_INFINITY,
    }))
    .sort((a, b) => a.pin - b.pin || a.index - b.index)
    .map(item => item.row);
}

function rememberPins(key: string, next: string[]) {
  AsyncStorage.setItem(key, JSON.stringify(next)).catch(() => {});
}

function isAbort(error: unknown) {
  return error instanceof Error && error.name === 'AbortError';
}

function withSignal(signal: AbortSignal): RequestInit {
  return { signal } as RequestInit;
}

function waitFor(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function SuggestionRow({
  title,
  detail,
  avatar,
  onPress,
}: {
  title: string;
  detail: string;
  avatar: string;
  onPress: () => void;
}) {
  return (
    <View style={styles.topicRow}>
      <Pressable style={styles.topicHit} onPress={onPress}>
        <Avatar uri={avatar} />
        <View style={styles.topicCopy}>
          <Text style={styles.topicId} numberOfLines={1}>
            {title}
          </Text>
          {detail ? (
            <Text style={styles.preview} numberOfLines={1}>
              {detail}
            </Text>
          ) : null}
        </View>
      </Pressable>
    </View>
  );
}

function Avatar({ uri, size = 32 }: { uri?: string; size?: number }) {
  const source = uri && /^https?:\/\//i.test(uri) ? uri : DEFAULT_AVATAR;
  return (
    <Image
      source={{ uri: source }}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: '#12141a',
      }}
    />
  );
}

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

const FILTER_MODES = ['all', 'allowlist', 'blocklist'] as const;
const FILTER_LABELS = ['Everyone', 'Allow list', 'Block list'] as const;

function ModeSwitch({
  mode,
  onChange,
}: {
  mode: (typeof FILTER_MODES)[number];
  onChange: (mode: (typeof FILTER_MODES)[number]) => void;
}) {
  const index = mode === 'allowlist' ? 1 : mode === 'blocklist' ? 2 : 0;
  const slide = useRef(new Animated.Value(index)).current;
  const [track, setTrack] = useState(0);
  const reduce = useRef(false);

  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled().then(value => {
      if (live) reduce.current = value;
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    const anim = Animated.timing(slide, {
      toValue: index,
      duration: reduce.current ? 0 : 240,
      easing: Easing.bezier(0.16, 1, 0.3, 1),
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [index, slide]);

  const gap = 8;
  const cell = track > 0 ? (track - gap * 2) / 3 : 0;
  const x = slide.interpolate({
    inputRange: [0, 1, 2],
    outputRange: [0, cell + gap, (cell + gap) * 2],
  });

  return (
    <View
      style={styles.modes}
      onLayout={event => setTrack(event.nativeEvent.layout.width)}>
      {cell > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.modePill, { width: cell, transform: [{ translateX: x }] }]}
        />
      ) : null}
      {FILTER_MODES.map((item, i) => (
        <Pressable
          key={item}
          style={[styles.modeBtn, styles.modeHit, index === i && styles.modeHitOn]}
          onPress={() => onChange(item)}>
          <Text style={index === i ? styles.modeOnText : styles.modeOffText}>
            {FILTER_LABELS[i]}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function FilterReveal({
  mode,
  children,
}: {
  mode: string;
  children: React.ReactNode;
}) {
  const open = mode === 'allowlist' || mode === 'blocklist';
  const progress = useRef(new Animated.Value(open ? 1 : 0)).current;
  const fade = useRef(new Animated.Value(1)).current;
  const [height, setHeight] = useState(0);
  const held = useRef(children);
  const reduce = useRef(false);
  if (open) held.current = children;

  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled().then(value => {
      if (live) reduce.current = value;
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    const anim = Animated.timing(progress, {
      toValue: open ? 1 : 0,
      duration: reduce.current ? 0 : 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    anim.start();
    return () => anim.stop();
  }, [open, progress]);

  useEffect(() => {
    if (!open) return;
    fade.setValue(reduce.current ? 1 : 0);
    const anim = Animated.timing(fade, {
      toValue: 1,
      duration: reduce.current ? 0 : 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [mode, open, fade]);

  const shift = fade.interpolate({
    inputRange: [0, 1],
    outputRange: [8, 0],
  });
  const clip = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, Math.max(height, 1)],
  });

  if (!open && height === 0) return null;

  return (
    <Animated.View
      style={{
        height: height === 0 ? undefined : clip,
        opacity: progress,
        overflow: 'hidden',
      }}>
      <View
        onLayout={event => {
          const next = event.nativeEvent.layout.height;
          if (next > 0 && Math.abs(next - height) > 1) setHeight(next);
        }}>
        <Animated.View style={{ opacity: fade, transform: [{ translateY: shift }] }}>
          {open ? children : held.current}
        </Animated.View>
      </View>
    </Animated.View>
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
        <Text style={styles.kindLabel}>{label}</Text>
        <Text style={styles.chatBody}>{label} removed</Text>
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
  const label = view.shared
    ? view.kind === 'polygon'
      ? 'Shared polygon'
      : 'Shared marker'
    : view.kind === 'marker'
      ? 'Marker'
      : 'Polygon';
  const video = /\.(mp4|webm)(\?|#|$)/i.test(view.image);
  return (
    <View style={[styles.kindCard, styles.placeCard]}>
      <Text style={styles.kindLabel}>{label}</Text>
      {view.title.trim() ? (
        <Text style={styles.cardTitle}>{view.title}</Text>
      ) : null}
      {view.text.trim() ? (
        <Text style={styles.chatBody}>{view.text}</Text>
      ) : null}
      {view.image && !video ? (
        <Image source={{ uri: view.image }} style={styles.cardImage} />
      ) : null}
      {video ? <Text style={styles.cord}>Video attached</Text> : null}
      <Pressable
        style={styles.openBtn}
        onPress={() => {
          const url = placeUrl({
            kind: view.kind,
            topicId: view.placeTopic || topicId,
            payer: view.shared ? view.placePayer || '' : payer,
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

function screenDepth(name: string) {
  if (name === 'settings') return 2;
  if (name === 'thread' || name === 'person' || name === 'account') return 1;
  return 0;
}

function App(): React.JSX.Element {
  const [token, setToken] = useState('');
  const [status, setStatus] = useState('Starting...');
  const [topicId, setTopicId] = useState('');
  const [addingTopic, setAddingTopic] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteAsk, setDeleteAsk] = useState<{
    label: string;
    run: () => void;
    yes?: string;
    verb?: string;
  } | null>(null);
  const [walletAddress, setWalletAddress] = useState('');
  const [walletInput, setWalletInput] = useState('');
  const [pairingUri, setPairingUri] = useState('');
  const [notice, setNotice] = useState<{
    title: string;
    body?: string;
    tone: 'ok' | 'bad';
  } | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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
    username?: string;      // Meritocracy username from 0.0.9609904
    profilePic?: string;    // Meritocracy picture from 0.0.9609881
  }[]
>([]);
  const [screen, setScreen] = useState<
    'inbox' | 'thread' | 'person' | 'topics' | 'settings' | 'account'
  >('inbox');
  const [openTopic, setOpenTopic] = useState('');
  const [openUser, setOpenUser] = useState('');
  const [inboxBy, setInboxBy] = useState<'topic' | 'user'>('topic');
  const [pinnedTopics, setPinnedTopics] = useState<string[]>([]);
  const [pinnedUsers, setPinnedUsers] = useState<string[]>([]);
  const [topicQuery, setTopicQuery] = useState('');
  const [seenIds, setSeenIds] = useState<string[]>([]);
  const [picking, setPicking] = useState<'' | 'message' | 'chat'>('');
  const [picked, setPicked] = useState<string[]>([]);
  const [domainRows, setDomainRows] = useState<
    { domain: string; topicId: string; expiresAt: number }[]
  >([]);
  const [suggestions, setSuggestions] = useState<FollowingResponse | null>(null);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [resolved, setResolved] = useState<ResolveResponse | null>(null);
  const [resolveLoading, setResolveLoading] = useState(false);
  const menuProgress = useRef(new Animated.Value(0)).current;
  const [menuShown, setMenuShown] = useState(false);
  const enter = useRef(new Animated.Value(1)).current;
  const enterX = useRef(new Animated.Value(0)).current;
  const addProgress = useRef(new Animated.Value(0)).current;
  const [addShown, setAddShown] = useState(false);
  const askProgress = useRef(new Animated.Value(0)).current;
  const [askShown, setAskShown] = useState(false);
  const [askHold, setAskHold] = useState<typeof deleteAsk>(null);
  const motionKey = useRef(`${screen}|${inboxBy}`);
  const reduceMotionRef = useRef(false);
  const barTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [barOn, setBarOn] = useState(false);
  const menuOpenRef = useRef(menuOpen);
  menuOpenRef.current = menuOpen;

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(value => {
      reduceMotionRef.current = value;
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', value => {
      reduceMotionRef.current = value;
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const onList = screen === 'inbox' || screen === 'topics';
    const visible = menuOpen && onList && picking === '';
    if (visible) setMenuShown(true);
    if (!visible && !onList) {
      menuProgress.setValue(0);
      setMenuShown(false);
      return;
    }
    const anim = Animated.timing(menuProgress, {
      toValue: visible ? 1 : 0,
      duration: reduceMotionRef.current ? 0 : visible ? 340 : 200,
      easing: visible ? Easing.bezier(0.16, 1, 0.3, 1) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    });
    anim.start(({ finished }) => {
      if (finished && !menuOpenRef.current) setMenuShown(false);
    });
    return () => anim.stop();
  }, [menuOpen, screen, picking, menuProgress]);

  useEffect(() => {
    const key = `${screen}|${inboxBy}`;
    if (motionKey.current === key) return;
    const previous = motionKey.current.split('|')[0];
    motionKey.current = key;
    const sameScreen = previous === screen;
    const forward = sameScreen || screenDepth(screen) >= screenDepth(previous);
    enter.setValue(0);
    enterX.setValue(
      reduceMotionRef.current || sameScreen ? 0 : forward ? 28 : -28
    );
    Animated.parallel([
      Animated.timing(enter, {
        toValue: 1,
        duration: reduceMotionRef.current ? 0 : 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(enterX, {
        toValue: 0,
        duration: reduceMotionRef.current ? 0 : 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [screen, inboxBy, enter, enterX]);

  useEffect(() => {
    const open = addingTopic && screen === 'topics';
    if (open) setAddShown(true);
    const anim = Animated.timing(addProgress, {
      toValue: open ? 1 : 0,
      duration: reduceMotionRef.current ? 0 : 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    anim.start(({ finished }) => {
      if (finished && !open) setAddShown(false);
    });
    return () => anim.stop();
  }, [addingTopic, screen, addProgress]);

  useEffect(() => {
    const open = addingTopic && screen === 'topics';
    if (!open || (!USE_DUMMY_SUGGESTIONS && !/^0\.0\.\d+$/.test(walletAddress))) {
      setSuggestions(null);
      setSuggestLoading(false);
      return;
    }
    const controller = new AbortController();
    let alive = true;
    setSuggestLoading(true);
    (async () => {
      try {
        if (USE_DUMMY_SUGGESTIONS) {
          await waitFor(300, controller.signal);
          if (!alive) return;
          setSuggestions(DUMMY_FOLLOWING);
        } else {
          const response = await fetch(
            `${BACKEND_URL}/api/following/${encodeURIComponent(walletAddress)}`,
            withSignal(controller.signal),
          );
          const data = (await response.json()) as FollowingResponse & {
            success?: boolean;
          };
          if (!alive) return;
          setSuggestions(
            response.ok && data.success
              ? {
                  success: true,
                  accounts: Array.isArray(data.accounts) ? data.accounts : [],
                  topics: Array.isArray(data.topics) ? data.topics : [],
                }
              : { success: true, accounts: [], topics: [] },
          );
        }
      } catch (error) {
        if (!alive || isAbort(error)) return;
        setSuggestions({ success: true, accounts: [], topics: [] });
      } finally {
        if (alive) setSuggestLoading(false);
      }
    })();
    return () => {
      alive = false;
      controller.abort();
    };
  }, [addingTopic, screen, walletAddress]);

  useEffect(() => {
    const id = topicId.trim();
    const open = addingTopic && screen === 'topics' && /^0\.0\.\d+$/.test(id);
    if (!open) {
      setResolved(null);
      setResolveLoading(false);
      return;
    }
    const controller = new AbortController();
    let alive = true;
    setResolveLoading(true);
    setResolved(null);
    (async () => {
      try {
        let data: ResolveResponse;
        if (USE_DUMMY_SUGGESTIONS) {
          data = await dummyResolve(id, controller.signal);
        } else {
          const response = await fetch(
            `${BACKEND_URL}/api/resolve/${encodeURIComponent(id)}`,
            withSignal(controller.signal),
          );
          data = (await response.json()) as ResolveResponse;
        }
        if (!alive) return;
        setResolved(data);
      } catch (error) {
        if (!alive || isAbort(error)) return;
        setResolved({ success: false, error: 'Not found' });
      } finally {
        if (alive) setResolveLoading(false);
      }
    })();
    return () => {
      alive = false;
      controller.abort();
    };
  }, [addingTopic, screen, topicId]);

  const deleteAskRef = useRef(deleteAsk);
  deleteAskRef.current = deleteAsk;
  useEffect(() => {
    if (deleteAsk) {
      setAskHold(deleteAsk);
      setAskShown(true);
    }
    const anim = Animated.timing(askProgress, {
      toValue: deleteAsk ? 1 : 0,
      duration: reduceMotionRef.current ? 0 : deleteAsk ? 240 : 170,
      easing: deleteAsk ? Easing.bezier(0.16, 1, 0.3, 1) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    });
    anim.start(({ finished }) => {
      if (finished && !deleteAskRef.current) setAskShown(false);
    });
    return () => anim.stop();
  }, [deleteAsk, askProgress]);

  const stripeTop = useMemo(
    () => ({
      transform: [
        {
          translateY: menuProgress.interpolate({
            inputRange: [0, 1],
            outputRange: [0, 4],
          }),
        },
        {
          rotate: menuProgress.interpolate({
            inputRange: [0, 1],
            outputRange: ['0deg', '45deg'],
          }),
        },
      ],
    }),
    [menuProgress]
  );
  const stripeMid = useMemo(
    () => ({
      opacity: menuProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [1, 0],
      }),
    }),
    [menuProgress]
  );
  const stripeBot = useMemo(
    () => ({
      transform: [
        {
          translateY: menuProgress.interpolate({
            inputRange: [0, 1],
            outputRange: [0, -4],
          }),
        },
        {
          rotate: menuProgress.interpolate({
            inputRange: [0, 1],
            outputRange: ['0deg', '-45deg'],
          }),
        },
      ],
    }),
    [menuProgress]
  );
  const menuMotion = useMemo(
    () => ({
      opacity: menuProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 1],
      }),
    }),
    [menuProgress]
  );
  const scrimOpacity = useMemo(
    () =>
      menuProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 0.35],
      }),
    [menuProgress]
  );
  const titleShift = useMemo(
    () =>
      enter.interpolate({
        inputRange: [0, 1],
        outputRange: [6, 0],
      }),
    [enter]
  );
  const addHeight = useMemo(
    () =>
      addProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 76],
      }),
    [addProgress]
  );

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
    return domain ? `${id} (${domain})` : id;
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
    AsyncStorage.getItem('pinnedTopics')
      .then(raw => {
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setPinnedTopics(parsed.map(String));
      })
      .catch(() => {});
    AsyncStorage.getItem('pinnedUsers')
      .then(raw => {
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setPinnedUsers(parsed.map(String));
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
      profilePic: data.profilePic ? String(data.profilePic) : undefined,
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

  function markAllRead() {
    setSeenIds(prev => {
      const next = [...new Set([...prev, ...messages.map(message => message.id)])];
      AsyncStorage.setItem('seenMessageIds', JSON.stringify(next));
      return next;
    });
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

  function revealBar() {
    setBarOn(true);
    if (barTimer.current) clearTimeout(barTimer.current);
    barTimer.current = setTimeout(() => setBarOn(false), 700);
  }

  function showNotice(title: string, body?: string, tone: 'ok' | 'bad' = 'ok') {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    setNotice({ title, body, tone });
    noticeTimer.current = setTimeout(() => setNotice(null), 2800);
  }

  function confirmDelete(label: string, run: () => void) {
    setMenuOpen(false);
    setDeleteAsk({ label, run });
  }

  function confirmUnsubscribe(label: string, run: () => void) {
    setMenuOpen(false);
    setDeleteAsk({ label, run, yes: 'Unsubscribe', verb: 'Unsubscribe from' });
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

  function toggleTopicPin(id: string) {
    setPinnedTopics(prev => {
      const next = prev.includes(id) ? prev.filter(item => item !== id) : [id, ...prev];
      rememberPins('pinnedTopics', next);
      return next;
    });
  }

  function toggleUserPin(id: string) {
    setPinnedUsers(prev => {
      const next = prev.includes(id) ? prev.filter(item => item !== id) : [id, ...prev];
      rememberPins('pinnedUsers', next);
      return next;
    });
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
              payerId: m.payer || m.payer_account_id || undefined,
              username: m.username || m.sender || undefined,
              profilePic: m.profile_pic || m.profilePic || undefined,
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
      setStatus('Connect a wallet');

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
          showNotice('Connected', accountId);
          return;
        }
      }

      setStatus('Connection timed out');
    } catch (error) {
      console.error(error);
      setStatus('Wallet connection failed');
      showNotice('Could not connect', String(error), 'bad');
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

  async function subscribeToTopic(raw?: unknown) {
    if (!token || !walletAddress) {
      Alert.alert('Error', 'Connect your wallet first');
      return;
    }

    const cleaned = (typeof raw === 'string' ? raw : topicId).trim();
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
        setAddingTopic(false);
        setStatus('Ready ✅');
        if (subscribedDomain) loadDomains();
        showNotice(
          'Subscribed',
          subscribedDomain
            ? `${finalTopicId} · ${subscribedDomain}`
            : `Listening to ${finalTopicId}`
        );
      } else {
        setStatus('Ready ✅');
        showNotice('Not found', data.error || `"${cleaned}" does not exist`, 'bad');
      }
    } catch (error) {
      setStatus('Ready ✅');
      showNotice('Could not reach backend', 'Check the connection and try again.', 'bad');
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
        setScreen('topics');
      } else {
        showNotice('Could not unsubscribe', data.error || 'Try again.', 'bad');
      }
    } catch (error) {
      showNotice('Could not unsubscribe', 'Check the connection and try again.', 'bad');
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
  const openPerson = userGroups.find(group => group.id === openUser);
  const personName = openPerson?.name || openUser;
  const personPic = openPerson?.latest.profilePic;
  const personThread = messages.filter(
    message => (message.payerId || message.username || 'Unknown') === openUser
  );
  const orderedGroups = floatPins(visibleGroups, pinnedTopics, group => group.id);
  const orderedUsers = floatPins(
    [...visibleUsers].sort(
      (a, b) => messageTime(b.latest.time) - messageTime(a.latest.time)
    ),
    pinnedUsers,
    group => group.id
  );
  const orderedSubs = floatPins(visibleSubs, pinnedTopics, item => item.topicId);
  const takenTopics = new Set(subscribedTopics.map(item => item.topicId));
  const suggestionRows = (suggestions?.accounts || [])
    .filter(account => account.topic && !takenTopics.has(account.topic))
    .map(account => ({
      key: `account:${account.id}`,
      title: account.username || account.id,
      detail: account.id,
      avatar: account.avatar || '',
      topic: account.topic,
    }))
    .concat(
      (suggestions?.topics || [])
        .filter(topic => topic.id && !takenTopics.has(topic.id))
        .map(topic => ({
          key: `topic:${topic.id}`,
          title: topic.name || topic.id,
          detail: topic.name ? topic.id : '',
          avatar: '',
          topic: topic.id,
        })),
    );
  const resolveRow =
    resolved && resolved.success && resolved.topicId && !takenTopics.has(resolved.topicId)
      ? resolved.kind === 'account'
        ? {
            key: `resolve:${resolved.accountId}`,
            title: resolved.username || resolved.accountId,
            detail: resolved.accountId,
            avatar: resolved.profilePic || '',
            topic: resolved.topicId,
          }
        : {
            key: `resolve:${resolved.topicId}`,
            title: resolved.domain
              ? `${resolved.topicId} (${resolved.domain})`
              : resolved.topicId,
            detail: resolved.domain ? resolved.topicId : '',
            avatar: '',
            topic: resolved.topicId,
          }
      : null;
  const resolveError = resolved && !resolved.success ? resolved.error : '';

  function chooseSuggestion(topic: string) {
    if (USE_DUMMY_SUGGESTIONS) {
      setTopicId(topic);
      return;
    }
    setTopicId(topic);
    subscribeToTopic(topic).catch(() => {});
  }
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
    <SafeAreaProvider initialMetrics={initialWindowMetrics} style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" />
      <SafeAreaView style={styles.container} edges={['top', 'right', 'bottom', 'left']}>
      <View style={styles.header}>
        {picking || !browsing ? (
          <Pressable onPress={picking ? cancelPick : goBack} hitSlop={8}>
            <Text style={styles.back}>{picking ? 'Cancel' : 'Back'}</Text>
          </Pressable>
        ) : addingTopic && screen === 'topics' ? (
          <Pressable
            style={({ pressed }) => [styles.more, pressed && styles.morePressed]}
            accessibilityLabel="Close"
            hitSlop={8}
            onPress={() => {
              setMenuOpen(false);
              setAddingTopic(false);
            }}>
            <View style={styles.stripes}>
              <View style={[styles.stripe, styles.stripeTop, styles.xTop]} />
              <View style={[styles.stripe, styles.stripeMid, styles.xMid]} />
              <View style={[styles.stripe, styles.stripeBot, styles.xBot]} />
            </View>
          </Pressable>
        ) : (
          <Pressable
            style={({ pressed }) => [styles.more, pressed && styles.morePressed]}
            accessibilityLabel="More"
            accessibilityState={{ expanded: menuOpen }}
            hitSlop={8}
            onPress={() => {
              setMenuShown(true);
              setMenuOpen(open => !open);
            }}>
            <View style={styles.stripes}>
              <Animated.View style={[styles.stripe, styles.stripeTop, stripeTop]} />
              <Animated.View style={[styles.stripe, styles.stripeMid, stripeMid]} />
              <Animated.View style={[styles.stripe, styles.stripeBot, stripeBot]} />
            </View>
          </Pressable>
        )}
        <Animated.View
          style={[
            styles.headerCenter,
            { opacity: enter, transform: [{ translateY: titleShift }] },
          ]}>
          {screen === 'person' && !picking ? (
            <Avatar uri={personPic} size={28} />
          ) : null}
          <Text style={styles.headerTitle} numberOfLines={1}>
            {picking ? `${picked.length} selected` : headerTitle}
          </Text>
        </Animated.View>
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
      <View style={styles.body}>
      <View style={styles.stage} pointerEvents={menuOpen ? 'none' : 'auto'}>
      <Animated.View
        style={[styles.stage, { opacity: enter, transform: [{ translateX: enterX }] }]}>
      <Text style={styles.status}>
        {picking
          ? 'Tap more to select'
          : screen === 'thread' || screen === 'person'
          ? 'Hold a message to select'
          : browsing
          ? `${subscribedTopics.length} topics · ${status}`
          : status}
      </Text>
      {screen === 'topics' && !picking ? (
        <Animated.View
          style={[styles.composerClip, styles.composerAbove, { opacity: addProgress, maxHeight: addHeight }]}
          pointerEvents={addingTopic ? 'auto' : 'none'}>
          {addingTopic || addShown ? (
            <View style={styles.composer}>
              <TextInput
                style={styles.searchInline}
                placeholder="0.0.12345 or domain"
                placeholderTextColor="#5e6474"
                value={topicId}
                onChangeText={setTopicId}
                autoCapitalize="none"
                autoFocus={addingTopic}
              />
              <Pressable style={styles.goBtn} onPress={subscribeToTopic}>
                <Text style={styles.goText}>Add</Text>
              </Pressable>
            </View>
          ) : null}
        </Animated.View>
      ) : null}
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
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={barOn}
        persistentScrollbar={false}
        scrollEventThrottle={64}
        onScroll={revealBar}>
        {screen === 'inbox' && inboxBy === 'user' &&
          (visibleUsers.length === 0 ? (
            <Text style={styles.empty}>
              {messages.length === 0 ? 'No messages yet' : 'No user matches'}
            </Text>
          ) : (
            orderedUsers.map(group => {
                const topicName = group.latest.topicId
                  ? topicLabel(group.latest.topicId)
                  : 'Unknown topic';
                const preview = clipPreview(previewMeritocracy(group.latest.body));
                const unread = group.rows.filter(row => !seenIds.includes(row.id)).length;
                return (
                  <View
                    key={group.id}
                    style={[styles.topicRow, picked.includes(group.id) && styles.pickedRow]}>
                    <Pressable
                      style={styles.topicHit}
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
                      <Avatar uri={group.latest.profilePic} size={36} />
                      <View style={styles.topicCopy}>
                        <Text style={styles.topicId} numberOfLines={1}>
                          {group.name}
                          {group.name !== group.id ? (
                            <Text style={styles.payer}> {group.id}</Text>
                          ) : null}
                        </Text>
                        <Text style={styles.onTopic} numberOfLines={1}>
                          {topicName}
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
                    <PinButton
                      on={pinnedUsers.includes(group.id)}
                      label={group.name}
                      onPress={() => toggleUserPin(group.id)}
                    />
                  </View>
                );
              })
          ))}

        {screen === 'inbox' && inboxBy === 'topic' &&
          (visibleGroups.length === 0 ? (
            <Text style={styles.empty}>
              {messages.length === 0 ? 'No messages yet' : 'No topic matches'}
            </Text>
          ) : (
            orderedGroups.map(group => {
              const preview = clipPreview(
                `${group.latest.username || group.latest.payerId || 'Someone'}: ${previewMeritocracy(group.latest.body)}`
              );
              const unread = group.rows.filter(row => !seenIds.includes(row.id)).length;
              return (
                <View
                  key={group.id}
                  style={[styles.topicRow, picked.includes(group.id) && styles.pickedRow]}>
                  <Pressable
                    style={styles.topicHit}
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
                  <PinButton
                    on={pinnedTopics.includes(group.id)}
                    label={topicLabel(group.id)}
                    onPress={() => toggleTopicPin(group.id)}
                  />
                </View>
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
                style={styles.message}>
                {picked.includes(message.id) ? (
                  <View pointerEvents="none" style={styles.messageWash} />
                ) : null}
                <View style={styles.messageCopy}>
                  <View style={styles.senderRow}>
                    <Text style={[styles.where, styles.whereInRow]} numberOfLines={1}>
                      {topicLabel(message.topicId || message.title || '') ||
                        'Unknown topic'}
                    </Text>
                    {picking === 'message' ? (
                      <View style={[styles.tick, picked.includes(message.id) && styles.tickOn]} />
                    ) : null}
                  </View>
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
                style={styles.message}>
                {picked.includes(message.id) ? (
                  <View pointerEvents="none" style={styles.messageWash} />
                ) : null}
                <View style={styles.messageCopy}>
                  {message.username || message.payerId || picking === 'message' ? (
                    <View style={styles.senderRow}>
                      {message.username || message.payerId ? (
                        <Avatar uri={message.profilePic} size={28} />
                      ) : null}
                      {message.username || message.payerId ? (
                        <Text style={styles.sender} numberOfLines={1}>
                          {message.username || 'Someone'}
                          {message.payerId ? (
                            <Text style={styles.payer}> {message.payerId}</Text>
                          ) : null}
                        </Text>
                      ) : (
                        <View style={styles.sender} />
                      )}
                      {picking === 'message' ? (
                        <View style={[styles.tick, picked.includes(message.id) && styles.tickOn]} />
                      ) : null}
                    </View>
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

        {screen === 'topics' && addingTopic ? (
          <>
            {suggestLoading || resolveLoading ? (
              <Text style={styles.preview}>Loading...</Text>
            ) : null}
            {resolveError ? (
              <Text style={styles.preview}>{resolveError}</Text>
            ) : null}
            {resolveRow ? (
              <SuggestionRow
                key={resolveRow.key}
                title={resolveRow.title}
                detail={resolveRow.detail}
                avatar={resolveRow.avatar}
                onPress={() => chooseSuggestion(resolveRow.topic)}
              />
            ) : null}
            {suggestionRows.map(row => (
              <SuggestionRow
                key={row.key}
                title={row.title}
                detail={row.detail}
                avatar={row.avatar}
                onPress={() => chooseSuggestion(row.topic)}
              />
            ))}
          </>
        ) : null}

        {screen === 'topics' && (
          <>
            {visibleSubs.length === 0 ? (
              <Text style={styles.empty}>No topics yet</Text>
            ) : (
              orderedSubs.map(item => {
                const mode =
                  item.filterMode === 'allowlist'
                    ? 'Allow list'
                    : item.filterMode === 'blocklist'
                    ? 'Block list'
                    : 'Everyone';
                const detail = `${mode}${item.showFullMessage ? ' · full text' : ' · sender only'}`;
                return (
                <View key={item.topicId} style={styles.topicRow}>
                  <Pressable
                    style={styles.topicHit}
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
                  <PinButton
                    on={pinnedTopics.includes(item.topicId)}
                    label={topicLabel(item.topicId)}
                    onPress={() => toggleTopicPin(item.topicId)}
                  />
                </View>
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
              <ModeSwitch
                mode={
                  openSub.filterMode === 'allowlist' || openSub.filterMode === 'blocklist'
                    ? openSub.filterMode
                    : 'all'
                }
                onChange={mode => {
                  if (mode === openSub.filterMode) return;
                  updateFilter(
                    openSub.topicId,
                    mode,
                    openSub.allowedSenders || [],
                    openSub.blockedSenders || []
                  );
                }}
              />
              <FilterReveal mode={openSub.filterMode}>
                {openSub.filterMode === 'allowlist' ? (
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
                ) : openSub.filterMode === 'blocklist' ? (
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
                ) : null}
              </FilterReveal>
              <Pressable
                style={styles.stopWide}
                onPress={() => {
                  const topic = openSub.topicId;
                  confirmUnsubscribe(topicLabel(topic), () => {
                    unsubscribeFromTopic(topic);
                  });
                }}>
                <Text style={styles.stopText}>Unsubscribe</Text>
              </Pressable>
            </View>
          ))}

        {screen === 'account' && (
          <View style={styles.sheet}>
            {walletAddress ? (
              <View style={styles.connectCard}>
                <Text style={styles.connectKicker}>Wallet</Text>
                <Text style={styles.connectTitle}>{walletAddress}</Text>
                <Text style={styles.accountLine}>
                  This phone receives messages for this account.
                </Text>
                <Pressable style={styles.stopWide} onPress={handleDisconnectWallet}>
                  <Text style={styles.stopText}>Disconnect wallet</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.connectCard}>
                <Text style={styles.connectTitle}>Connect a wallet</Text>
                <Text style={styles.accountLine}>
                  Generate a code, paste it in your wallet, then come back.
                </Text>
                <Pressable style={styles.goBtn} onPress={handleConnectWallet}>
                  <Text style={styles.goText}>
                    {pairingUri ? 'New code' : 'Generate code'}
                  </Text>
                </Pressable>
                {pairingUri ? (
                  <View style={styles.codeBox}>
                    <Text style={styles.codeLabel}>Pairing code</Text>
                    <Text selectable style={styles.code}>
                      {pairingUri}
                    </Text>
                    <Pressable
                      style={styles.quietBtn}
                      onPress={() => {
                        Clipboard.setString(pairingUri);
                        showNotice('Copied', 'Paste this into your wallet.');
                      }}>
                      <Text style={styles.quietText}>Copy code</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            )}
          </View>
        )}
      </ScrollView>
      </Animated.View>

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
      </View>
      {menuShown ? (
        <View style={styles.menuLayer} pointerEvents="box-none">
          <Animated.View style={[styles.dim, { opacity: scrimOpacity }]}>
            <Pressable style={styles.dimPress} onPress={() => setMenuOpen(false)} />
          </Animated.View>
          <Animated.View style={[styles.menu, menuMotion]}>
            <Pressable
              style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemOn]}
              onPress={() => {
                setMenuOpen(false);
                if (screen === 'topics' && addingTopic) {
                  setAddingTopic(false);
                  return;
                }
                setScreen('topics');
                setAddingTopic(true);
              }}>
              <Text style={styles.menuText}>Add topic</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemOn]}
              onPress={() => {
                setMenuOpen(false);
                markAllRead();
              }}>
              <Text style={styles.menuText}>Mark all as read</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemOn]}
              onPress={() => {
                setMenuOpen(false);
                confirmDelete('all messages', clearAllMessages);
              }}>
              <Text style={styles.menuDanger}>Clear all messages</Text>
            </Pressable>
          </Animated.View>
        </View>
      ) : null}
      </View>
      {notice ? (
        <View pointerEvents="none" style={styles.toastWrap}>
          <View style={[styles.toast, notice.tone === 'bad' && styles.toastBad]}>
            <Text style={styles.toastTitle}>{notice.title}</Text>
            {notice.body ? <Text style={styles.toastBody}>{notice.body}</Text> : null}
          </View>
        </View>
      ) : null}
      {askShown && askHold ? (
        <View style={styles.askLayer} pointerEvents={deleteAsk ? 'auto' : 'none'}>
          <Animated.View style={[styles.askDim, { opacity: askProgress }]}>
            <Pressable style={styles.dimPress} onPress={() => setDeleteAsk(null)} />
          </Animated.View>
          <Animated.View
            style={[
              styles.askCard,
              {
                opacity: askProgress,
                transform: [
                  {
                    translateY: askProgress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [14, 0],
                    }),
                  },
                  {
                    scale: askProgress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.96, 1],
                    }),
                  },
                ],
              },
            ]}>
            <Text style={styles.askTitle}>{`${askHold.verb || 'Delete'} ${askHold.label}?`}</Text>
            <Text style={styles.askBody}>
              {askHold.verb
                ? `This will unsubscribe from ${askHold.label}.`
                : `This will delete ${askHold.label}.`}
            </Text>
            <View style={styles.askRow}>
              <Pressable style={styles.askCancel} onPress={() => setDeleteAsk(null)}>
                <Text style={styles.quietText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={styles.askYes}
                onPress={() => {
                  const run = askHold.run;
                  setDeleteAsk(null);
                  run();
                }}>
                <Text style={styles.askYesText}>{askHold.yes || 'Delete'}</Text>
              </Pressable>
            </View>
          </Animated.View>
        </View>
      ) : null}
      </SafeAreaView>
    </SafeAreaProvider>
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
  more: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#22d3ee',
    alignItems: 'center',
    justifyContent: 'center',
  },
  morePressed: { transform: [{ scale: 0.9 }] },
  stripes: { width: 13, height: 10 },
  stripe: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
    borderRadius: 1,
    backgroundColor: '#062226',
  },
  stripeTop: { top: 0 },
  stripeMid: { top: 4 },
  stripeBot: { top: 8 },
  xTop: { transform: [{ translateY: 4 }, { rotate: '45deg' }] },
  xMid: { opacity: 0 },
  xBot: { transform: [{ translateY: -4 }, { rotate: '-45deg' }] },
  body: { flex: 1 },
  stage: { flex: 1 },
  menuLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 20,
  },
  dim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000',
  },
  dimPress: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  menu: {
    position: 'absolute',
    top: 6,
    left: 12,
    minWidth: 220,
    backgroundColor: '#12141a',
    borderWidth: 1,
    borderColor: 'rgba(34,211,238,0.28)',
    borderRadius: 16,
    paddingVertical: 6,
    overflow: 'hidden',
    elevation: 12,
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    transformOrigin: '24px 0px',
  },
  menuItem: { paddingVertical: 12, paddingHorizontal: 14 },
  menuItemOn: { backgroundColor: 'rgba(34,211,238,0.1)' },
  menuText: { color: '#e6e6f0', fontSize: 15, fontWeight: '600' },
  menuDanger: { color: '#f07178', fontSize: 15, fontWeight: '600' },
  askLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 40,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  askDim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.62)',
  },
  askCard: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: '#12141a',
    borderWidth: 1,
    borderColor: 'rgba(240,113,120,0.45)',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 14,
  },
  askTitle: { color: '#e6e6f0', fontSize: 17, fontWeight: '700', marginBottom: 8 },
  askBody: { color: '#8d93a5', fontSize: 14, lineHeight: 20, marginBottom: 16 },
  askRow: { flexDirection: 'row', gap: 8 },
  askCancel: {
    flex: 1,
    backgroundColor: '#12141a',
    borderWidth: 1,
    borderColor: 'rgba(230,230,240,0.08)',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  askYes: {
    flex: 1,
    backgroundColor: '#f07178',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  askYesText: { color: '#2a0c0e', fontWeight: '700', fontSize: 14 },
  back: { minWidth: 72, color: '#22d3ee', fontSize: 15, fontWeight: '600' },
  danger: { color: '#f07178', fontSize: 15, fontWeight: '700' },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minWidth: 0,
  },
  headerTitle: {
    flexShrink: 1,
    color: '#e6e6f0',
    fontSize: 17,
    fontWeight: '700',
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
    gap: 2,
    paddingVertical: 0,
    paddingRight: 2,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(230,230,240,0.08)',
  },
  topicHit: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 6,
    minWidth: 0,
  },
  pinBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
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
  whereInRow: { flex: 1, marginBottom: 0 },
  onTopic: { color: '#22d3ee', fontSize: 12, fontWeight: '700', marginTop: 3 },
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
  message: { paddingVertical: 10, position: 'relative' },
  messageWash: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    left: 0,
    right: 0,
    borderRadius: 16,
    backgroundColor: 'rgba(34,211,238,0.1)',
  },
  messageCopy: { flex: 1 },
  tick: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#5e6474',
    marginLeft: 'auto',
  },
  tickOn: { backgroundColor: '#22d3ee', borderColor: '#22d3ee' },
  senderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  sender: { color: '#e6e6f0', fontWeight: '700', fontSize: 13, flexShrink: 1, flex: 1 },
  payer: { color: '#5e6474', fontWeight: '500' },
  time: { color: '#5e6474', fontSize: 11, marginTop: 6, textAlign: 'right' },
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
  composerClip: { overflow: 'hidden' },
  composerAbove: { marginHorizontal: 16 },
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
  modes: { flexDirection: 'row', gap: 8, marginBottom: 8, position: 'relative' },
  modeBtn: { flex: 1 },
  modePill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 12,
    backgroundColor: '#22d3ee',
  },
  modeHit: {
    borderWidth: 1,
    borderColor: 'rgba(230,230,240,0.08)',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 4,
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  modeHitOn: { borderColor: 'transparent' },
  modeOnText: { color: '#062226', fontWeight: '700', fontSize: 13 },
  modeOffText: { color: '#e6e6f0', fontWeight: '600', fontSize: 13 },
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
  accountLine: { color: '#8d93a5', fontSize: 15, lineHeight: 22, marginBottom: 14 },
  connectCard: {
    backgroundColor: '#12141a',
    borderWidth: 1,
    borderColor: 'rgba(34,211,238,0.28)',
    borderRadius: 16,
    padding: 16,
  },
  connectKicker: {
    color: '#22d3ee',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  connectTitle: {
    color: '#e6e6f0',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  codeBox: {
    marginTop: 14,
    backgroundColor: '#0a0a0a',
    borderWidth: 1,
    borderColor: 'rgba(230,230,240,0.08)',
    borderRadius: 12,
    padding: 12,
  },
  codeLabel: {
    color: '#5e6474',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  code: {
    color: '#e6e6f0',
    fontSize: 13,
    lineHeight: 18,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginBottom: 12,
  },
  toastWrap: {
    position: 'absolute',
    top: 52,
    left: 16,
    right: 16,
    zIndex: 35,
  },
  toast: {
    backgroundColor: '#12141a',
    borderWidth: 1,
    borderColor: 'rgba(34,211,238,0.45)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  toastBad: { borderColor: 'rgba(240,113,120,0.55)' },
  toastTitle: { color: '#e6e6f0', fontSize: 15, fontWeight: '700' },
  toastBody: { color: '#8d93a5', fontSize: 13, lineHeight: 18, marginTop: 4 },
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
