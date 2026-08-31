import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Role, User } from '@foodiebus/types';
import { AuthContext, type AuthContextValue } from './context.js';
import { loadUser, persistUser, tokenStore, isRoleAllowed } from './storage.js';

const AUTH_EXPIRED_EVENT = 'foodiebus:auth-expired';

export interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(() => loadUser());

  const login = useCallback((nextUser: User, accessToken: string, refreshToken: string) => {
    persistUser(nextUser);
    tokenStore.setTokens(accessToken, refreshToken);
    setUser(nextUser);
  }, []);

  const logout = useCallback(() => {
    tokenStore.clear();
    setUser(null);
  }, []);

  useEffect(() => {
    const handleAuthExpired = () => {
      tokenStore.clear();
      setUser(null);
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
  }, []);

  const hasRole = useCallback((roles: Role[]) => isRoleAllowed(user, roles), [user]);

  const value = useMemo<AuthContextValue>(
    () => ({ user, isAuthenticated: !!user, login, logout, hasRole }),
    [user, login, logout, hasRole],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
