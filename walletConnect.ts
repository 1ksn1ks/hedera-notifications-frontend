import UniversalProvider from '@walletconnect/universal-provider';

const PROJECT_ID = '4bb3a1d4a8c30b0e3b1bd4c7285330b6';

let provider: any = null;

export async function getPairingUri(): Promise<string> {
  if (!provider) {
    provider = await UniversalProvider.init({
      projectId: PROJECT_ID,
      metadata: {
        name: 'Hedera Notifier',
        description: 'Push notifications for Hedera topics',
        url: 'https://hedera.com',
        icons: ['https://hedera.com/logo.png'],
      },
    });
  }

  return new Promise((resolve, reject) => {
    const onUri = (uri: string) => {
      provider.off?.('display_uri', onUri);
      resolve(uri);
    };

    provider.on('display_uri', onUri);

    provider
      .connect({
        optionalNamespaces: {
          hedera: {
            methods: [
              'hedera_signMessage',
              'hedera_signTransaction',
              'hedera_signAndExecuteTransaction',
            ],
            chains: ['hedera:mainnet'],
            events: ['chainChanged', 'accountsChanged'],
          },
        },
      })
      .catch((err: any) => {
        // Connection waits for wallet approval; ignore hang
        console.log('connect pending:', err?.message || err);
      });

    // Safety timeout
    setTimeout(() => {
      reject(new Error('Timed out waiting for pairing URI'));
    }, 15000);
  });
}

export async function getConnectedAccount(): Promise<string | null> {
  if (!provider?.session) return null;

  const accounts =
    provider.session.namespaces?.hedera?.accounts ||
    provider.session.namespaces?.hip820?.accounts ||
    [];

  if (!accounts.length) return null;

  const parts = accounts[0].split(':');
  return parts[parts.length - 1] || null;
}

export async function disconnectWallet() {
  if (provider) {
    try {
      await provider.disconnect();
    } catch (e) {}
    provider = null;
  }
}