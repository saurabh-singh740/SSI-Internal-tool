import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useReducer,
  useCallback,
  useMemo,
} from 'react';
import { User } from '../types';
import api from '../api/axios';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  loading: boolean;
}

type AuthAction =
  | { type: 'LOGIN'; payload: User }
  | { type: 'LOGOUT' }
  | { type: 'SET_LOADING'; payload: boolean };

const initialState: AuthState = {
  user: null,
  isAuthenticated: false,
  loading: true,  // true until the /auth/me probe completes
};

const authReducer = (state: AuthState, action: AuthAction): AuthState => {
  switch (action.type) {
    case 'LOGIN':
      return { ...state, user: action.payload, isAuthenticated: true, loading: false };
    case 'LOGOUT':
      return { user: null, isAuthenticated: false, loading: false };
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    default:
      return state;
  }
};

interface AuthContextType extends AuthState {
  login: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  registerAdmin: (name: string, email: string, password: string) => Promise<User>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(authReducer, initialState);

  // Ref guard: ensures the /auth/me probe runs exactly once per mount even
  // when React StrictMode double-invokes effects in development.
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const initAuth = async () => {
      try {
        // /auth/session always returns 200 ({ authenticated, user? }) so the
        // browser never logs a red 401 network error in DevTools on page load.
        const res = await api.get('/auth/session');
        if (res.data.authenticated) {
          dispatch({ type: 'LOGIN', payload: res.data.user });
        } else {
          dispatch({ type: 'LOGOUT' });
        }
      } catch {
        // Network failure or server down — treat as unauthenticated.
        dispatch({ type: 'LOGOUT' });
      }
    };

    initAuth();
  }, []); // empty array — must never gain dependencies; state changes must not re-trigger this

  // useCallback ensures these functions have stable references across renders.
  // Without this, every AuthContext state update (e.g. login sets user) creates
  // new function objects, causing every consumer (Topbar, Sidebar, ProtectedRoute)
  // to re-render even though the functions themselves haven't changed.
  // dispatch from useReducer is guaranteed stable — safe as the only dep.

  const login = useCallback(async (email: string, password: string): Promise<User> => {
    const res = await api.post('/auth/login', { email, password });
    const user: User = res.data.user;
    dispatch({ type: 'LOGIN', payload: user });
    return user;
  }, []); // dispatch is stable — no deps needed

  const logout = useCallback(async (): Promise<void> => {
    await api.post('/auth/logout').catch(() => {});
    dispatch({ type: 'LOGOUT' });
  }, []);

  const registerAdmin = useCallback(
    async (name: string, email: string, password: string): Promise<User> => {
      const res = await api.post('/auth/register-admin', { name, email, password });
      const user: User = res.data.user;
      dispatch({ type: 'LOGIN', payload: user });
      return user;
    },
    [],
  );

  // useMemo on the context value so the object reference only changes when
  // state actually changes — not on every parent render.
  const value = useMemo<AuthContextType>(
    () => ({ ...state, login, logout, registerAdmin }),
    [state, login, logout, registerAdmin],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
