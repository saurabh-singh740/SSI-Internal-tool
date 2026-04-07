import React, { createContext, useContext, useEffect, useRef, useReducer } from 'react';
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
        const res = await api.get('/auth/me');
        dispatch({ type: 'LOGIN', payload: res.data.user });
      } catch {
        // 401 = no valid session — expected when the user is not logged in.
        // 429 = rate limit hit — treat as "not authenticated" and stop retrying.
        // In both cases: clear loading and leave user as null.
        dispatch({ type: 'LOGOUT' });
      }
    };

    initAuth();
  }, []); // empty array — must never gain dependencies; state changes must not re-trigger this

  const login = async (email: string, password: string): Promise<User> => {
    const res = await api.post('/auth/login', { email, password });
    const user: User = res.data.user;
    dispatch({ type: 'LOGIN', payload: user });
    return user;
  };

  const logout = async () => {
    await api.post('/auth/logout').catch(() => {});
    dispatch({ type: 'LOGOUT' });
  };

  const registerAdmin = async (name: string, email: string, password: string): Promise<User> => {
    const res = await api.post('/auth/register-admin', { name, email, password });
    const user: User = res.data.user;
    dispatch({ type: 'LOGIN', payload: user });
    return user;
  };

  return (
    <AuthContext.Provider value={{ ...state, login, logout, registerAdmin }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};