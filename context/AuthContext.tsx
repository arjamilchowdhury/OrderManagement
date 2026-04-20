import React, { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../src/services/api';
import type { User, UserProfile } from '../types';

interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  login: (email: string, password?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  authError: string | null;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  userProfile: null,
  loading: true,
  login: async () => {},
  logout: async () => {},
  refreshProfile: async () => {},
  authError: null,
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const fetchUserProfile = async (uid: string) => {
    try {
      const profile = await api.getUserProfile(uid);
      if (!profile) {
        setUser(null);
        setUserProfile(null);
        localStorage.removeItem('user');
      } else {
        setUserProfile(profile);
      }
    } catch (error) {
      console.error("Error fetching user profile:", error);
      setUserProfile(null);
    }
  };

  useEffect(() => {
    const isViewRoute = window.location.pathname.startsWith('/view/');
    if (isViewRoute) {
      const token = window.location.pathname.split('/view/')[1];
      if (token) {
        api.validateShareToken(token).then((data) => {
          const mockUser: User = { uid: data.user.uid, email: data.user.email, displayName: data.user.name };
          setUser(mockUser);
          setUserProfile(data.user);
          setLoading(false);
        }).catch((err) => {
          setAuthError(err.message || "Invalid or expired share link.");
          setLoading(false);
        });
        return;
      }
    }

    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      const parsedUser = JSON.parse(storedUser);
      setUser(parsedUser);
      fetchUserProfile(parsedUser.uid).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email: string, password?: string) => {
    setLoading(true);
    try {
      const { user: profile } = await api.login(email, password);
      const userObj: User = { uid: profile.uid, email: profile.email, displayName: profile.name };
      setUser(userObj);
      setUserProfile(profile);
      localStorage.setItem('user', JSON.stringify(userObj));
    } catch (error) {
      console.error("Login failed:", error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    if (window.location.pathname.startsWith('/view/')) {
       // if viewer logs out, send them to home
       window.location.href = '/';
       return;
    }
    setUser(null);
    setUserProfile(null);
    localStorage.removeItem('user');
  };

  const refreshProfile = async () => {
    if (user && user.uid !== 'viewer') {
      await fetchUserProfile(user.uid);
    }
  };

  return (
    <AuthContext.Provider value={{ user, userProfile, loading, login, logout, refreshProfile, authError }}>
      {children}
    </AuthContext.Provider>
  );
};
