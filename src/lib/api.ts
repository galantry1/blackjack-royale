// src/lib/api.ts

// Базовый URL бэкенда: .env -> VITE_API_URL=https://blackjack-royale-backend.onrender.com
const BASE =
  (import.meta as any).env?.VITE_API_URL?.replace(/\/$/, "") ||
  ""; // если пусто — бьём по этому же домену

type OkRes = { success: boolean; message?: string; balance: number };
export type LeaderboardRow = { userId: string; wins: number; profit: number };
type LeaderboardRes = { entries: LeaderboardRow[] };
type BalanceRes = { balance: number };
type HistoryItem = {
  roundId: string;
  userId: string;
  type: "bet" | "win";
  amount: number;
  ts: number;
};
type HistoryRes = { history: HistoryItem[] };
type RefLinkRes = { web: string; telegram: string };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    ...init,
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(txt || res.statusText);
  }
  // 204/empty
  if (res.status === 204) return {} as T;
  return (await res.json()) as T;
}

/* ============ Public API used in App.tsx ============ */

export async function initUser(userId: string): Promise<OkRes> {
  return request<OkRes>(`/init`, {
    method: "POST",
    body: JSON.stringify({ userId }),
  });
}

export async function getBalance(userId: string): Promise<BalanceRes> {
  const q = new URLSearchParams({ userId });
  return request<BalanceRes>(`/balance?${q.toString()}`);
}

export async function getHistory(userId: string): Promise<HistoryRes> {
  const q = new URLSearchParams({ userId });
  return request<HistoryRes>(`/history?${q.toString()}`);
}

export async function bet(userId: string, amount: number, roundId: string): Promise<OkRes> {
  return request<OkRes>(`/bet`, {
    method: "POST",
    body: JSON.stringify({ userId, amount, roundId }),
  });
}

export async function win(userId: string, amount: number, roundId: string): Promise<OkRes> {
  return request<OkRes>(`/win`, {
    method: "POST",
    body: JSON.stringify({ userId, amount, roundId }),
  });
}

export async function getLeaderboard(
  metric: "wins" | "profit" = "wins",
  limit = 20
): Promise<LeaderboardRes> {
  const q = new URLSearchParams({ metric, limit: String(limit) });
  return request<LeaderboardRes>(`/leaderboard?${q.toString()}`);
}

// Партнёрка (демо)
export async function getRefLink(userId: string): Promise<RefLinkRes> {
  const q = new URLSearchParams({ userId });
  return request<RefLinkRes>(`/ref-link?${q.toString()}`);
}

export async function applyRef(userId: string, code: string): Promise<{ ok: true }> {
  return request<{ ok: true }>(`/apply-ref`, {
    method: "POST",
    body: JSON.stringify({ userId, code }),
  });
}

export async function topup(userId: string, amount: number): Promise<BalanceRes> {
  return request<BalanceRes>(`/topup`, {
    method: "POST",
    body: JSON.stringify({ userId, amount }),
  });
}
