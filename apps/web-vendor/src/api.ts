import { createHttpClient } from '@foodiebus/api-client';
import { tokenStore } from '@foodiebus/auth';

const baseURL = import.meta.env.VITE_API_URL ?? 'http://localhost:8080/api/v1';

export const http = createHttpClient({
  baseURL,
  tokenStore,
});

export const wsUrl = import.meta.env.VITE_WS_URL ?? 'http://localhost:8080';

export const apiBaseURL = baseURL;
