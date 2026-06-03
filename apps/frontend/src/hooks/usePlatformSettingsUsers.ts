import { useState, useEffect, useCallback } from 'react';

export interface PlatformUser {
  id:        number;
  email:     string;
  username:  string;
  role:      string;
  status:    string;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformUserInput {
  email:     string;
  username:  string;
  password:  string;
  role:      'superadmin' | 'admin_saas';
}

interface UsePlatformUsersResult {
  users:        PlatformUser[];
  loading:      boolean;
  error:        string | null;
  refetch:      () => void;
  createUser:   (input: PlatformUserInput) => Promise<PlatformUser>;
  updateUser:   (id: number, input: Partial<PlatformUserInput>) => Promise<PlatformUser>;
  deleteUser:   (id: number) => Promise<void>;
}

export function usePlatformUsers(): UsePlatformUsersResult {
  const [users,   setUsers]   = useState<PlatformUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/platform/platform-users', { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: { data: PlatformUser[] } = await res.json();
      setUsers(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchUsers(); }, [fetchUsers]);

  const createUser = useCallback(async (input: PlatformUserInput): Promise<PlatformUser> => {
    const res = await fetch('/api/platform/platform-users', {
      method:      'POST',
      credentials: 'include',
      headers:     { 'Content-Type': 'application/json' },
      body:        JSON.stringify(input),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message ?? `HTTP ${res.status}`);
    }
    const created: PlatformUser = await res.json();
    setUsers(prev => [created, ...prev]);
    return created;
  }, []);

  const updateUser = useCallback(async (id: number, input: Partial<PlatformUserInput>): Promise<PlatformUser> => {
    const res = await fetch(`/api/platform/platform-users/${id}`, {
      method:      'PUT',
      credentials: 'include',
      headers:     { 'Content-Type': 'application/json' },
      body:        JSON.stringify(input),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message ?? `HTTP ${res.status}`);
    }
    const updated: PlatformUser = await res.json();
    setUsers(prev => prev.map(u => u.id === id ? updated : u));
    return updated;
  }, []);

  const deleteUser = useCallback(async (id: number): Promise<void> => {
    const res = await fetch(`/api/platform/platform-users/${id}`, {
      method:      'DELETE',
      credentials: 'include',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message ?? `HTTP ${res.status}`);
    }
    setUsers(prev => prev.filter(u => u.id !== id));
  }, []);

  return { users, loading, error, refetch: fetchUsers, createUser, updateUser, deleteUser };
}