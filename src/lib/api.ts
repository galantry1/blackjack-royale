// src/lib/api.ts
type Json = Record<string, any>;

const API = (
  (import.meta as any).env?.VITE_API_URL as string ||
  "https://blackjack-royale-backend.onrender.com"
).replace(/\/$/, ""); // без хвостового слэша

async function request<T = any>(
  path: string,
  opts: RequestInit & { body?: any } = {}
): Promise<T> {
  const url = `${API}${path.startsWith("/") ? path : `/${path}`}`;
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(opts.headers || {}),
  };
  const res = await fetch(url, {
    ...opts,
    headers,
    body: opts.body != null ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // не JSON — вернём как есть
    data = text;
  }
  if (!res.ok) {
    const msg =
      (data && (data.message || data.error)) ||
      `HTTP ${res.status} ${res.statusText}`;
    throw new Error(msg);
  }
  return data as T;
}

/* ==== API ==== */

export async function initUser(userId: string) {
  return request<{ ok: true }>("/init", { method: "POST", body: { userId } });
}

export async function getBalance(userId: string) {
  return request<{ balance: number }>("/balance", {
    method: "POST",
    body: { userId },
  });
}

export async function getHistory(userId: string) {
  return request<{ history: Array<{ roundId: string; userId: string; type: "bet" | "win"; amount: number; ts: number }>}>(
    "/history",
    { method: "POST", body: { userId } }
  );
}

export async function bet(userId: string, amount: number, roundId: string) {
  return request<{ success: boolean; balance: number; message?: string }>(
    "/bet",
    { method: "POST", body: { userId, amount, roundId } }
  );
}

export async function win(userId: string, amount: number, roundId: string) {
  return request<{ success: boolean; balance: number }>(
    "/win",
    { method: "POST", body: { userId, amount, roundId } }
  );
}

export type LeaderboardRow = {
  userId: string;
  wins: number;
  profit: number;
};
export async function getLeaderboard(metric: "wins" | "profit", limit = 20) {
  return request<{ entries: LeaderboardRow[] }>(
    "/leaderboard",
    { method: "POST", body: { metric, limit } }
  );
}

export async function getRefLink(userId: string) {
  return request<{ web: string; telegram: string }>(
    "/ref/link",
    { method: "POST", body: { userId } }
  );
}

export async function applyRef(userId: string, code: string) {
  return request<{ ok: true }>(
    "/ref/apply",
    { method: "POST", body: { userId, code } }
  );
}

export async function topup(userId: string, amount: number) {
  return request<{ balance: number }>(
    "/topup",
    { method: "POST", body: { userId, amount } }
  );
}
