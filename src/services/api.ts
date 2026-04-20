import { OrderRecord, UserProfile } from '../../types';

const API_BASE = import.meta.env.VITE_API_BASE || '/api';

const getHeaders = () => {
  const isView = window.location.pathname.startsWith('/view/');
  return {
    'Content-Type': 'application/json',
    ...(isView ? { 'x-viewer-mode': 'true' } : {})
  };
};

export const api = {
  async getOrders(params: { 
    page?: number; 
    limit?: number; 
    searchField?: string; 
    searchText?: string; 
    statusFilters?: string[];
  } = {}): Promise<{ orders: OrderRecord[], total: number, hasNextPage: boolean }> {
    const query = new URLSearchParams();
    if (params.page) query.append('page', params.page.toString());
    if (params.limit) query.append('limit', params.limit.toString());
    if (params.searchField) query.append('searchField', params.searchField);
    if (params.searchText) query.append('searchText', params.searchText);
    if (params.statusFilters?.length) query.append('statusFilters', params.statusFilters.join(','));

    const res = await fetch(`${API_BASE}/orders?${query.toString()}`);
    if (!res.ok) throw new Error('Failed to fetch orders');
    return res.json();
  },

  async createOrder(order: Partial<OrderRecord>): Promise<any> {
    const res = await fetch(`${API_BASE}/orders`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(order),
    });
    if (!res.ok) throw new Error('Failed to create order');
    return res.json();
  },

  async updateOrder(id: string, update: Partial<OrderRecord>): Promise<any> {
    const res = await fetch(`${API_BASE}/orders/${id}`, {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify(update),
    });
    if (!res.ok) throw new Error('Failed to update order');
    return res.json();
  },

  async getOrder(id: string): Promise<OrderRecord> {
    const res = await fetch(`${API_BASE}/orders/${id}`);
    if (!res.ok) throw new Error('Failed to fetch order');
    return res.json();
  },

  async getClubCollection(): Promise<any> {
    const res = await fetch(`${API_BASE}/club-collection`);
    if (!res.ok) throw new Error('Failed to fetch club collection');
    return res.json();
  },

  async syncBatch(data: { sessionId: string; batchKey: string; batchData: any; rows: any[] }): Promise<void> {
    const res = await fetch(`${API_BASE}/club-collection/sync`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to sync batch');
  },

  async updateClubRecord(data: { sessionId: string; batchKey: string; fileName: string; updateData: any }): Promise<void> {
    const res = await fetch(`${API_BASE}/club-collection/update-record`, {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to update club record');
  },

  async getUsers(): Promise<any[]> {
    const res = await fetch(`${API_BASE}/users`);
    if (!res.ok) throw new Error('Failed to fetch users');
    return res.json();
  },

  async getMasterReconKeys(): Promise<Record<string, boolean>> {
    const res = await fetch(`${API_BASE}/master-recon-keys`);
    if (!res.ok) throw new Error('Failed to fetch master recon keys');
    return res.json();
  },

  async getUserProfile(uid: string): Promise<UserProfile | null> {
    const res = await fetch(`${API_BASE}/users/${uid}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error('Failed to fetch user profile');
    return res.json();
  },

  async saveUserProfile(profile: UserProfile): Promise<any> {
    const res = await fetch(`${API_BASE}/users`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(profile),
    });
    if (!res.ok) throw new Error('Failed to save user profile');
    return res.json();
  },

  async login(email: string, password?: string): Promise<{ user: UserProfile }> {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) throw new Error('Login failed');
    return res.json();
  },
  async deleteUser(uid: string): Promise<any> {
    const response = await fetch(`${API_BASE}/users/${uid}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    return response.json();
  },
  async updateMasterReconStatus(updates: Record<string, string>): Promise<any> {
    const response = await fetch(`${API_BASE}/master-recon-status`, {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify({ updates }),
    });
    return response.json();
  },

  async generateShareToken(userId: string): Promise<string> {
    const res = await fetch(`${API_BASE}/share-token`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ userId }),
    });
    if (!res.ok) throw new Error('Failed to generate token');
    const data = await res.json();
    return data.token;
  },

  async validateShareToken(token: string): Promise<any> {
    const res = await fetch(`${API_BASE}/share-token/validate/${token}`);
    if (!res.ok) throw new Error(res.status === 404 ? 'Token not found' : 'Invalid token');
    return res.json();
  },

  async revokeShareToken(userId: string): Promise<void> {
    const res = await fetch(`${API_BASE}/share-token/${userId}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    if (!res.ok) throw new Error('Failed to revoke token');
  },
  
  async getShareToken(userId: string): Promise<string | null> {
    const res = await fetch(`${API_BASE}/share-token/${userId}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error('Failed to fetch token');
    const data = await res.json();
    return data.token;
  }
};
