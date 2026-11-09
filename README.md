# 🔔 Hedera Notifier

A phone app for Hedera consensus topics. Subscribe to a topic, and a new message arrives as a push.

The inbox reads the same public topics as the [globe](https://onlyonhbar.com). Meritocracy posts show up as cards. Encrypted chat stays sealed and is only labeled. The phone never talks to the mirror itself: a small backend caches the topics you follow and sends the push.

**Play package:** `com.hedera.notificationapp` (closed testing)
**Backend:** [hedera-notifications-backend-production.up.railway.app](https://hedera-notifications-backend-production.up.railway.app)

---

## 🚀 Getting started

### Install a test build (Android)

Every push to `main` builds an APK in GitHub Actions (`.github/workflows/android-apk.yml`), opens it on an emulator, and publishes it as the `android-latest` pre-release only if it stays open. On the phone, open:

https://github.com/1ksn1ks/hedera-notifications-frontend/releases/download/android-latest/hedera-notifier-test.apk

Then open the file and allow installs from that source.

Test builds use `./gradlew assembleRelease -PtestBuild`. The id is `com.hederanotifierapp` and the name is “HederaNotifier (test)”, so they install **next to** the Play app. `google-services.json` lists that id, so push still works. They are signed with the committed `debug.keystore`, and each build installs over the last.

Play bundles are unchanged. Without `-PtestBuild` the id, version, and upload key stay as they are. `android/keystore.properties` is never committed.

### Phone

Node `>= 22.11.0`. Android and iOS also need the [React Native environment](https://reactnative.dev/docs/set-up-your-environment).

```bash
npm install
npm start          # Metro
npm run android    # a second terminal, device or emulator
```

iOS needs CocoaPods on a Mac (`bundle exec pod install` inside `ios/`), then `npm run ios`. The iOS target is still the React Native template: remote push needs an APNs key, a real bundle id, and a `GoogleService-Info.plist` before it can match Android.

### Browser preview

```bash
npm run start:web
```

Vite binds `0.0.0.0` on port **5174**. If that port is taken it moves to the next free one and prints `Local: http://localhost:NNNN/` — use that port.

The preview has no FCM token. Subscribing shows “Push alerts only work in the phone app, this is the browser preview.” `/api` is proxied to the production backend, so the inbox is the live one. `server.fs.deny` refuses to serve `android/`, `ios/`, keystores, `google-services.json`, and `.env` files.

---

## ✨ Features

- **📬 Topic push** — a new consensus message on a subscribed topic becomes a phone notification. The inbox keeps the raw consensus string.
- **🪪 Wallet connect** — an external wallet signs a one-time register challenge (WalletConnect, HIP-820). No custodial key. The session dies if a re-register stays unauthorized.
- **🏷️ Topics and domains** — subscribe with a topic id (`0.0.x`) or a domain name. Domains follow the same 28-day window rules as the globe.
- **👤 Inbox** — open grouped by person or by topic. Pin rows, mark chats seen, and delete messages with one confirmation. Deleting does not unsubscribe.
- **🛡️ Filters** — everyone, an allow list, a block list, or “only holders of these NFTs” (up to 20 token ids).
- **📍 Meritocracy cards** — markers, polygons, and shares render as cards, with **Open on the map** back to the globe. Drawing numbers stay off the card.
- **🔒 Sealed stays sealed** — encrypted chat and sealed marker or polygon payloads are labeled. This app has no topic key, so it does not decrypt them.
- **📱 Dark cyan UI** — the same black and `#22d3ee` look as the globe, with a stripe menu for add topic, mark all read, and clear all.

---

## 🏗️ Architecture

```
phone app (React Native)
        │  wallet signs the register challenge
        │  subscribes to topic ids and domain names
        │  inbox, filters, deletes
        ▼
notifier backend (Express + SQLite)   ← cache and push fan-out, not source of truth
        │  poller reads subscribed topics
        │  Firebase Cloud Messaging sends the push
        ▼
Hedera mirror node                    ← source of truth
```

- The backend is a separate repo, [hedera-notifications-backend](https://github.com/1ksn1ks/hedera-notifications-backend). This repo is only the phone app.
- Long Hedera messages are reassembled from chunks before anyone is notified. A partial chunk group never pushes.
- The globe writes the messages. This app only watches them.

---

## 🧰 Tech stack

| Layer | Stack |
| --- | --- |
| **App** | React Native 0.86, TypeScript, React Native Web |
| **Wallet** | `@hashgraph/hedera-wallet-connect`, `@hashgraph/sdk` |
| **Push** | Firebase Cloud Messaging, Notifee |
| **Browser preview** | Vite on port 5174, `/api` proxied to the Railway backend |
| **Backend** | Node.js, Express, SQLite, Firebase Admin — other repo, deployed on Railway |

---

## 📁 Project structure

```
App.tsx                 phone UI: inbox, topics, filters, wallet
meritocracyFormat.ts    display-only cards for globe posts (twin of the backend formatter)
walletConnect.ts        WalletConnect pairing and topic submit
devDummySuggestions.ts  dev-only follower rows while adding a topic
index.js                React Native entry
vite.config.js          browser preview, port 5174, /api → Railway
web/                    browser entry
web-shims/, web-stubs/  browser stand-ins (no FCM, no Notifee)
android/, ios/          native shells
```

---

## 📝 Notes

- The mirror node is the source of truth. The SQLite inbox is a cache. A fresh database stays empty until each phone registers and subscribes again.
- Encrypted globe chat is a different app: [hedera-e2ee-chat-app](https://github.com/1ksn1ks/hedera-e2ee-chat-app). This one does not hold topic keys.
- Usernames and profile pictures come from the same public topics the globe uses. A missing picture falls back to the shared default inscription.
- **Open on the map** uses `https://onlyonhbar.com/{topicId}` plus the place query. The browser preview rewrites that host to `https://localhost:5173` for local globe work. The phone build keeps the live host.
