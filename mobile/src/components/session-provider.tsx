import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Platform } from 'react-native';
import { createContext, useCallback, useContext, useEffect, useState, type Context, type PropsWithChildren } from 'react';

import {
  ApiError,
  getCurrentUser,
  register as registerUser,
  registerAuthExpiredHandler,
  signIn as signInUser,
  signOut as signOutUser,
  type SessionUser,
} from '@/lib/api';

const SESSION_HINT_KEY = 'agrimarket-last-role';
const SESSION_BLOCKED_KEY = 'agrimarket-sign-in-required';
type SessionStatus = 'loading' | 'signedOut' | 'signedIn';

type SessionContextValue = {
  status: SessionStatus;
  user: SessionUser | null;
  loading: boolean;
  offline: boolean;
  error: string;
  signIn: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, role: 'buyer' | 'seller') => Promise<void>;
  signOut: () => Promise<void>;
};

const sessionContextRegistry = globalThis as typeof globalThis & {
  __AGRIMARKET_SESSION_CONTEXT__?: Context<SessionContextValue | null>;
};

const SessionContext = sessionContextRegistry.__AGRIMARKET_SESSION_CONTEXT__ ??=
  createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState('');

  const clearLocalSession = useCallback(async () => {
    await AsyncStorage.removeItem(SESSION_HINT_KEY);
    if (typeof caches !== 'undefined') {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.filter((name) => name.startsWith('agrimarket-private-')).map((name) => caches.delete(name)));
    }
    setUser(null);
    setStatus('signedOut');
  }, []);

  const restoreSession = useCallback(async () => {
    setStatus((current) => current === 'signedIn' ? current : 'loading');
    setOffline(typeof navigator !== 'undefined' && !navigator.onLine);
    let knownRole: string | null = null;
    try {
      if (await AsyncStorage.getItem(SESSION_BLOCKED_KEY) === 'true') {
        setUser(null);
        setStatus('signedOut');
        setOffline(false);
        setError('Please sign in again.');
        return;
      }
      knownRole = await AsyncStorage.getItem(SESSION_HINT_KEY);
      const currentUser = await getCurrentUser();
      await AsyncStorage.setItem(SESSION_HINT_KEY, currentUser.role);
      setUser(currentUser);
      setStatus('signedIn');
      setOffline(false);
      setError('');
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === undefined) {
        if (knownRole === 'buyer' || knownRole === 'seller' || knownRole === 'admin') {
          setUser({ id: 'offline-session', email: '', role: knownRole });
          setStatus('signedIn');
          setOffline(true);
          setError('');
          return;
        }
      }

      if (cause instanceof ApiError && cause.status !== undefined && cause.status >= 500) {
        if (knownRole === 'buyer' || knownRole === 'seller' || knownRole === 'admin') {
          setUser({ id: 'offline-session', email: '', role: knownRole });
          setStatus('signedIn');
          setOffline(true);
          setError('Could not verify your session. Showing the limited offline app.');
          return;
        }
        setStatus('signedOut');
        setError('AgriMarket could not check your account. Try again shortly.');
        return;
      }

      if (cause instanceof ApiError && cause.status === 401 && knownRole) {
        await AsyncStorage.setItem(SESSION_BLOCKED_KEY, 'true');
      }
      await clearLocalSession();
      setOffline(false);
      setError(cause instanceof ApiError && cause.status === 401 && knownRole ? 'Please sign in again.' : '');
    }
  }, [clearLocalSession]);

  useEffect(() => {
    void Promise.resolve().then(restoreSession);
    const unsubscribeExpired = registerAuthExpiredHandler(() => {
      void AsyncStorage.getItem(SESSION_HINT_KEY).then(async (lastRole) => {
        if (lastRole) await AsyncStorage.setItem(SESSION_BLOCKED_KEY, 'true');
        await clearLocalSession();
        if (lastRole) setError('Please sign in again.');
      });
    });

    if (Platform.OS === 'web') {
      const onOnline = () => { void restoreSession(); };
      const onOffline = () => setOffline(true);
      window.addEventListener('online', onOnline);
      window.addEventListener('offline', onOffline);
      return () => {
        unsubscribeExpired();
        window.removeEventListener('online', onOnline);
        window.removeEventListener('offline', onOffline);
      };
    }

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void restoreSession();
    });
    return () => {
      unsubscribeExpired();
      subscription.remove();
    };
  }, [clearLocalSession, restoreSession]);

  async function signIn(email: string, password: string) {
    setError('');
    await AsyncStorage.removeItem(SESSION_BLOCKED_KEY);
    const signedInUser = await signInUser(email, password);
    await AsyncStorage.setItem(SESSION_HINT_KEY, signedInUser.role);
    setUser(signedInUser);
    setStatus('signedIn');
    setOffline(false);
  }

  async function register(email: string, password: string, role: 'buyer' | 'seller') {
    setError('');
    const registeredUser = await registerUser(email, password, role);
    await AsyncStorage.removeItem(SESSION_BLOCKED_KEY);
    await AsyncStorage.setItem(SESSION_HINT_KEY, registeredUser.role);
    setUser(registeredUser);
    setStatus('signedIn');
    setOffline(false);
  }

  async function signOut() {
    try {
      await signOutUser();
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        await clearLocalSession();
        setError('Please sign in again.');
        return;
      }
      setError('Could not securely sign out. Check your connection and try again.');
      throw cause;
    }
    await clearLocalSession();
    await AsyncStorage.removeItem(SESSION_BLOCKED_KEY);
    setError('');
  }

  const value = { status, user, loading: status === 'loading', offline, error, signIn, register, signOut };
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession must be used within SessionProvider.');
  return context;
}
