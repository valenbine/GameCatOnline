import type { Game } from '../types/game';

type ApiResponse<T> = {
  success: boolean;
  data: T;
  message?: string;
};

async function request<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init);
  const result = (await response.json()) as ApiResponse<T>;

  if (!response.ok || !result.success) {
    throw new Error(result.message ?? '请求失败');
  }

  return result.data;
}

export function fetchGames() {
  return request<Game[]>('/api/games');
}

export function fetchGameDetail(id: number) {
  return request<Game>(`/api/games/${id}`);
}

export function fetchAdminSession() {
  return request<{ authenticated: boolean }>('/api/admin/session', {
    credentials: 'include',
  });
}
