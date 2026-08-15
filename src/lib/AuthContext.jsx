import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { db, getToken, clearToken } from '@/lib/self-hosted-db';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  const checkUserAuth = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      setIsAuthenticated(false);
      setIsLoadingAuth(false);
      setAuthChecked(true);
      return null;
    }

    setIsLoadingAuth(true);
    try {
      const currentUser = await db.auth.me();
      setUser(currentUser);
      setIsAuthenticated(true);
      setAuthError(null);
      return currentUser;
    } catch (error) {
      setUser(null);
      setIsAuthenticated(false);
      if (error.status === 401) {
        clearToken();
      } else if (error.status === 403) {
        setAuthError({ type: 'auth_required', message: error.message || 'Доступ ограничен' });
      } else {
        setAuthError({ type: 'unknown', message: error.message || 'Не удалось проверить сессию' });
      }
      return null;
    } finally {
      setIsLoadingAuth(false);
      setAuthChecked(true);
    }
  }, []);

  useEffect(() => {
    checkUserAuth();
  }, [checkUserAuth]);

  const logout = (shouldRedirect = true) => {
    setUser(null);
    setIsAuthenticated(false);
    db.auth.logout(shouldRedirect ? '/login' : undefined);
  };

  const navigateToLogin = () => {
    db.auth.redirectToLogin(window.location.href);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isLoadingAuth,
        // совместимость с прежним интерфейсом: своих public settings больше нет
        isLoadingPublicSettings: false,
        appPublicSettings: { public_settings: {} },
        authError,
        authChecked,
        logout,
        navigateToLogin,
        checkUserAuth,
        checkAppState: checkUserAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
