// Dev-only stand-in for GET /api/following and GET /api/resolve.
// Release builds keep USE_DUMMY_SUGGESTIONS false because __DEV__ is false.

export const USE_DUMMY_SUGGESTIONS = __DEV__ && true;

export type FollowingAccount = {
  id: string;
  username: string;
  avatar: string;
  topic: string;
};

export type FollowingTopic = {
  id: string;
  name: string;
};

export type FollowingResponse = {
  success: true;
  accounts: FollowingAccount[];
  topics: FollowingTopic[];
};

export type ResolveResponse =
  | {
      success: true;
      kind: 'account';
      accountId: string;
      topicId: string;
      username: string;
      profilePic: string;
    }
  | {
      success: true;
      kind: 'topic';
      topicId: string;
      domain: string;
    }
  | {
      success: false;
      kind: 'account';
      error: string;
    }
  | {
      success: false;
      error: string;
    };

const LONG_NAME = 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWX';

export const DUMMY_FOLLOWING: FollowingResponse = {
  success: true,
  accounts: [
    {
      id: '0.0.981180',
      username: 'alla.hbar',
      avatar: '',
      topic: '0.0.9912345',
    },
    {
      id: '0.0.4455667',
      username: 'alice_nft',
      avatar: 'https://picsum.photos/64?random=1',
      topic: '0.0.9876543',
    },
    {
      id: '0.0.1234567',
      username: 'hbar_whale',
      avatar: 'https://picsum.photos/64?random=2',
      topic: '0.0.9001122',
    },
    {
      id: '0.0.2223334',
      username: 'turtle.moon',
      avatar: '',
      topic: '0.0.9002233',
    },
    {
      id: '0.0.3334445',
      username: LONG_NAME,
      avatar: 'https://picsum.photos/64?random=3',
      topic: '0.0.9003344',
    },
    {
      id: '0.0.3334446',
      username: 'luna 🌙',
      avatar: 'https://picsum.photos/64?random=4',
      topic: '0.0.9004455',
    },
    {
      id: '0.0.1010101',
      username: 'no.topic',
      avatar: '',
      topic: '',
    },
    {
      id: '0.0.4819201',
      username: 'on.the.list',
      avatar: 'https://picsum.photos/64?random=5',
      topic: '0.0.4819200',
    },
    {
      id: '0.0.7788990',
      username: 'moss.garden',
      avatar: 'https://picsum.photos/64?random=6',
      topic: '0.0.9007788',
    },
    {
      id: '0.0.8899001',
      username: 'quiet.signal',
      avatar: '',
      topic: '0.0.9008899',
    },
  ],
  topics: [
    { id: '0.0.9601122', name: 'Alien Collectors chat' },
    { id: '0.0.9602233', name: 'HBAR Builders' },
    {
      id: '0.0.9603344',
      name: 'A very long topic name that should ellipsis when the suggestion row is narrow',
    },
    { id: '0.0.9604455', name: '' },
  ],
};

function abortError() {
  return Object.assign(new Error('Aborted'), { name: 'AbortError' });
}

function wait(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function resolveBody(id: string): ResolveResponse {
  if (id === '0.0.981180') {
    return {
      success: true,
      kind: 'account',
      accountId: '0.0.981180',
      topicId: '0.0.9912345',
      username: 'alla.hbar',
      profilePic: '',
    };
  }
  if (id === '0.0.9601122') {
    return {
      success: true,
      kind: 'topic',
      topicId: '0.0.9601122',
      domain: '',
    };
  }
  if (id === '0.0.5555555') {
    return {
      success: false,
      kind: 'account',
      error: '0.0.5555555 has no public topic connected',
    };
  }
  return { success: false, error: 'Not found' };
}

export async function dummyResolve(id: string, signal?: AbortSignal) {
  await wait(300, signal);
  return resolveBody(id);
}
