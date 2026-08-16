export type Role =
  'SUPER_ADMIN' | 'ADMIN' | 'FINANCIAL' | 'VENDOR' | 'OPERATOR' | 'STUDENT' | 'DRIVER';

export interface User {
  id: string;
  email: string;
  phone: string;
  fullName: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
}

export interface Page<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
}
