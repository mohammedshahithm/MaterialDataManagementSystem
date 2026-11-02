import React, { createContext, useContext } from 'react';
import type { User as AppUser } from '../types';

export const SHARED_TERMINAL_USER: AppUser = {
  id: '00000000-0000-0000-0000-000000000001',
  email: 'terminal@internal.mdms',
  fullName: 'Shared Factory Terminal',
  role: 'admin', // Full operational access for all connected terminal users
  createdAt: '2026-11-01T00:00:00.000Z',
};

interface AuthState {
  user: AppUser;
  isAdmin: boolean;
  loading: boolean;
}

const AuthContext = createContext<AuthState>({
  user: SHARED_TERMINAL_USER,
  isAdmin: true,
  loading: false,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <AuthContext.Provider
      value={{
        user: SHARED_TERMINAL_USER,
        isAdmin: true,
        loading: false,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
