import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, getToken, setToken } from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [farms, setFarms] = useState([]);
  const [activeFarmId, setActiveFarmId] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadSession = useCallback(async () => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    try {
      const [profile, farmList] = await Promise.all([api.get('/users/me'), api.get('/farms')]);
      setUser(profile);
      setFarms(farmList);
      setActiveFarmId((prev) => (prev && farmList.some((f) => f._id === prev) ? prev : farmList[0]?._id || null));
    } catch {
      setToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  const login = useCallback(async (email, password) => {
    const data = await api.post('/auth/login', { email, password });
    setToken(data.accessToken);
    await loadSession();
    return data;
  }, [loadSession]);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    setFarms([]);
    setActiveFarmId(null);
  }, []);

  const refreshFarms = useCallback(async () => {
    const farmList = await api.get('/farms');
    setFarms(farmList);
    setActiveFarmId((prev) => (prev && farmList.some((f) => f._id === prev) ? prev : farmList[0]?._id || null));
    return farmList;
  }, []);

  const createFarm = useCallback(async (payload) => {
    const farm = await api.post('/farms', payload);
    await refreshFarms();
    setActiveFarmId(farm._id);
    return farm;
  }, [refreshFarms]);

  const updateFarm = useCallback(async (farmId, updates) => {
    const farm = await api.patch(`/farms/${farmId}`, updates);
    await refreshFarms();
    return farm;
  }, [refreshFarms]);

  const deleteFarm = useCallback(async (farmId) => {
    await api.delete(`/farms/${farmId}`);
    if (activeFarmId === farmId) setActiveFarmId(null);
    await refreshFarms();
  }, [activeFarmId, refreshFarms]);

  const updateProfile = useCallback(async (updates) => {
    const profile = await api.patch('/users/me', updates);
    setUser(profile);
    return profile;
  }, []);

  const activeFarm = farms.find((f) => f._id === activeFarmId) || null;

  return (
    <AuthContext.Provider
      value={{
        user,
        farms,
        activeFarm,
        activeFarmId,
        setActiveFarmId,
        loading,
        login,
        logout,
        refreshFarms,
        createFarm,
        updateFarm,
        deleteFarm,
        updateProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
