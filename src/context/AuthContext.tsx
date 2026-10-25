import React, { createContext, useContext, useEffect, useState } from 'react';
import { Company, User } from '../types';
import { api, clearStoredToken, getStoredToken, setStoredToken } from '../services/api';

interface AuthContextType {
  user: User | null;
  company: Company | null;
  isLoading: boolean;
  isSetupComplete: boolean;
  mustChangePasswordPrompt: boolean;
  setMustChangePasswordPrompt: (val: boolean) => void;
  login: (token: string, user: User, company: Company) => void;
  logout: () => void;
  refreshMe: () => Promise<void>;
  updateCompanyState: (company: Company) => void;
  checkSetupStatus: () => Promise<boolean>;
  completeSetup: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSetupComplete, setIsSetupComplete] = useState<boolean>(false);
  const [mustChangePasswordPrompt, setMustChangePasswordPrompt] = useState<boolean>(false);

  const checkSetupStatus = async () => {
    try {
      const res = await api.getSetupStatus();
      setIsSetupComplete(res.initialized);
      return res.initialized;
    } catch (err) {
      console.error('Failed to check setup status:', err);
      return false;
    }
  };

  const completeSetup = () => {
    setIsSetupComplete(true);
  };

  const refreshMe = async () => {
    const token = getStoredToken();
    if (!token) {
      setUser(null);
      return;
    }
    try {
      const res = await api.getMe();
      setUser(res.user);
      if (res.company) {
        setCompany(res.company);
      }
      if (res.user.mustChangePassword) {
        setMustChangePasswordPrompt(true);
      }
    } catch (err) {
      console.warn('Session expired or invalid:', err);
      clearStoredToken();
      setUser(null);
    }
  };

  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      const initialized = await checkSetupStatus();
      if (initialized) {
        await refreshMe();
      }
      setIsLoading(false);
    };

    init();
  }, []);

  const login = (token: string, newUser: User, newCompany: Company) => {
    setStoredToken(token);
    setUser(newUser);
    setCompany(newCompany);
    setIsSetupComplete(true);
    if (newUser.mustChangePassword) {
      setMustChangePasswordPrompt(true);
    } else {
      setMustChangePasswordPrompt(false);
    }
  };

  const logout = () => {
    clearStoredToken();
    setUser(null);
    setMustChangePasswordPrompt(false);
  };

  const updateCompanyState = (updatedCompany: Company) => {
    setCompany(updatedCompany);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        company,
        isLoading,
        isSetupComplete,
        mustChangePasswordPrompt,
        setMustChangePasswordPrompt,
        login,
        logout,
        refreshMe,
        updateCompanyState,
        checkSetupStatus,
        completeSetup,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
