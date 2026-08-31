import axios, {
  AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios';
import { getErrorMessage } from './errors.js';

export interface ApiError {
  code: string;
  message: string;
}

/** Dispatched when a 401 cannot be recovered — the session is gone. */
export const AUTH_EXPIRED_EVENT = 'foodiebus:auth-expired';

function notifyAuthExpired(): void {
  try {
    window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
  } catch {
    // SSR / non-browser environments — nothing to notify.
  }
}

export interface TokenStore {
  getAccessToken(): string | null;
  getRefreshToken(): string | null;
  setTokens(access: string, refresh: string): void;
  clear(): void;
}

export interface ClientOptions {
  baseURL: string;
  tokenStore: TokenStore;
}

export class ApiClientError extends Error {
  code: string;
  status?: number;

  constructor(message: string, code: string, status?: number) {
    super(message);
    this.name = 'ApiClientError';
    this.code = code;
    this.status = status;
  }
}

export function extractError(err: unknown): ApiClientError {
  if (err instanceof ApiClientError) return err;
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { error?: ApiError } | undefined;
    const code = data?.error?.code ?? (err.response ? 'HTTP_ERROR' : 'NETWORK_ERROR');
    const message = getErrorMessage(err);
    return new ApiClientError(message, code, err.response?.status);
  }
  if (err instanceof Error) return new ApiClientError(err.message, 'UNKNOWN');
  return new ApiClientError('Unknown error', 'UNKNOWN');
}

export function createHttpClient(options: ClientOptions): AxiosInstance {
  const client = axios.create({
    baseURL: options.baseURL,
    timeout: 30000,
    headers: { 'Content-Type': 'application/json' },
  });

  client.interceptors.request.use((config: InternalAxiosRequestConfig) => {
    const token = options.tokenStore.getAccessToken();
    if (token) {
      config.headers.set('Authorization', `Bearer ${token}`);
    }
    return config;
  });

  let refreshing: Promise<string | null> | null = null;

  async function refreshAccessToken(): Promise<string | null> {
    const refreshToken = options.tokenStore.getRefreshToken();
    if (!refreshToken) return null;
    try {
      const res = await axios.post(
        `${options.baseURL}/auth/refresh`,
        { refreshToken },
        { timeout: 10000 },
      );
      const data = res.data as { accessToken: string; refreshToken: string };
      options.tokenStore.setTokens(data.accessToken, data.refreshToken);
      return data.accessToken;
    } catch {
      options.tokenStore.clear();
      return null;
    }
  }

  client.interceptors.response.use(
    (res) => res,
    async (error: AxiosError) => {
      const original = error.config as
        (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
      if (error.response?.status === 401 && original && !original._retry) {
        original._retry = true;

        // Without a refresh token the session cannot be recovered.
        if (!options.tokenStore.getRefreshToken()) {
          options.tokenStore.clear();
          notifyAuthExpired();
          return Promise.reject(
            new ApiClientError(
              'Your session has expired. Please log in again.',
              'SESSION_EXPIRED',
              401,
            ),
          );
        }

        if (!refreshing) {
          refreshing = refreshAccessToken().finally(() => {
            refreshing = null;
          });
        }
        const token = await refreshing;
        if (token) {
          original.headers.set('Authorization', `Bearer ${token}`);
          return client(original);
        }

        // The refresh attempt failed — the session cannot be recovered either.
        options.tokenStore.clear();
        notifyAuthExpired();
        return Promise.reject(
          new ApiClientError(
            'Your session has expired. Please log in again.',
            'SESSION_EXPIRED',
            401,
          ),
        );
      }
      return Promise.reject(error);
    },
  );

  return client;
}

export function unwrap<T>(res: { data: T }): T {
  return res.data;
}

export async function getBlob(config: AxiosRequestConfig): Promise<Blob> {
  const res = await axios({ ...config, responseType: 'blob' });
  return res.data as Blob;
}
