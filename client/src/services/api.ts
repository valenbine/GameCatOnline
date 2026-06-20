import type { Game } from '../types/game';

type ApiResponse<T> = {
  success: boolean;
  data: T;
  message?: string;
};

export type PaginatedResult<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type GameListParams = {
  page: number;
  pageSize: number;
  featured?: boolean;
  search?: string;
  sort?: 'updated-desc' | 'sort-desc' | 'title-asc';
};

async function request<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init);
  const result = (await response.json()) as ApiResponse<T>;

  if (!response.ok || !result.success) {
    throw new Error(result.message ?? '请求失败');
  }

  return result.data;
}

export function toSearchParams(params: Record<string, string | number | boolean | undefined>) {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && String(value).trim()) {
      searchParams.set(key, String(value));
    }
  }

  return searchParams.toString();
}

export function fetchGames(params: GameListParams) {
  const query = toSearchParams(params);
  return request<PaginatedResult<Game>>(`/api/games?${query}`);
}

export function fetchGameDetail(id: number) {
  return request<Game>(`/api/games/${id}`);
}

export function fetchAdminSession() {
  return request<{ authenticated: boolean }>('/api/admin/session', {
    credentials: 'include',
  });
}
