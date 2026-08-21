import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setAuthTokenGetter } from '@workspace/api-client-react';
import type { User } from '@workspace/api-client-react';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  setSession: (user: User, token: string) => Promise<void>;
  clearSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

const TOKEN_KEY = '@gsi/token';
const USER_KEY = '@gsi/user';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Restore session from storage on mount
  useEffect(() => {
    async function restore() {
      try {
        const [t, u] = await Promise.all([
          AsyncStorage.getItem(TOKEN_KEY),
          AsyncStorage.getItem(USER_KEY),
        ]);
        if (t && u) {
          const parsed = JSON.parse(u) as User;
          setToken(t);
          setUser(parsed);
          // Wire the bearer token into every API call
          setAuthTokenGetter(() => t);
        }
      } catch {
        // Ignore parse errors — user will need to log in again
      } finally {
        setIsLoading(false);
      }
    }
    restore();
  }, []);

  const setSession = useCallback(async (newUser: User, newToken: string) => {
    await Promise.all([
      AsyncStorage.setItem(TOKEN_KEY, newToken),
      AsyncStorage.setItem(USER_KEY, JSON.stringify(newUser)),
    ]);
    setToken(newToken);
    setUser(newUser);
    setAuthTokenGetter(() => newToken);
  }, []);

  const clearSession = useCallback(async () => {
    await Promise.all([
      AsyncStorage.removeItem(TOKEN_KEY),
      AsyncStorage.removeItem(USER_KEY),
    ]);
    setToken(null);
    setUser(null);
    setAuthTokenGetter(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, isLoading, setSession, clearSession }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
