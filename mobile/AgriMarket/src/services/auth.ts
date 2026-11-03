import apiClient from './api';

export type UserRole = 'buyer' | 'seller';

export interface User {
  id: string;
  email: string;
  role: UserRole;
  businessProfile?: any;
}

export const authService = {
  async login(email: string, password: string) {
    const response = await apiClient.post('/auth/login', { email, password });
    return response.data;
  },

  async register(email: string, password: string, role: UserRole) {
    const response = await apiClient.post('/auth/register', { email, password, role });
    return response.data;
  },

  async getMe(): Promise<User | null> {
    try {
      const response = await apiClient.get('/auth/me');
      return response.data;
    } catch (error) {
      return null;
    }
  },

  async logout() {
    await apiClient.post('/auth/logout');
  },
};
