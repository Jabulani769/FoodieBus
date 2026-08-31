import axios from 'axios';

export interface ApiError {
  code: string;
  message: string;
}

/**
 * Render a clear, human readable message for any API failure.
 * - "Network Error" is reported by axios when the request never reaches the
 *   server (offline, DNS, CORS, connection refused). We always translate it
 *   to something actionable instead of showing axios' bare message.
 * - Server errors (from the Fastify error handler) carry `{ error: { code, message } }`.
 */
export function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { error?: ApiError } | undefined;
    const serverCode = data?.error?.code;
    const serverMessage = data?.error?.message;

    if (!error.response) {
      return 'Network error. Please check your internet connection and try again.';
    }

    switch (serverCode) {
      case 'UNAUTHORIZED':
        return serverMessage ?? 'Your session has expired. Please log in again.';
      case 'FORBIDDEN':
        return serverMessage ?? 'You do not have permission to perform this action.';
      case 'NOT_FOUND':
        return serverMessage ?? 'The requested resource could not be found.';
      case 'CONFLICT':
        return serverMessage ?? 'That action conflicts with existing data.';
      case 'VALIDATION_ERROR':
        return serverMessage ?? 'Please check your input and try again.';
      case 'RATE_LIMITED':
        return serverMessage ?? 'Too many requests. Please try again shortly.';
      default:
        return serverMessage ?? `Request failed (${error.response.status}). Please try again.`;
    }
  }
  if (error instanceof Error && error.message) return error.message;
  return 'An unexpected error occurred. Please try again.';
}
