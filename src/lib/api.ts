// Унифицированный клиент API с фоллбэком на Render
const BASE =
  (typeof import.meta !== "undefined" &&
    (import.meta as any).env?.VITE_API_URL &&
    String((import.meta as any).env.VITE_API_URL).trim()) ||
  "https://blackjack-royale-backend.onrender.com";

type Json = Record<string, any>;

async function j<T = any>(path: string, init?: RequestInit & { body?: any }): Promise<T> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { ...headers, ...(init?.headers as any) },
    body: init?.body != null ? JSON.stringify(init.body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} — ${text || res.statusText}`);
  }
  return (await res.json()) as T;
}

// GET helper
async function jGet<T = any>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} — ${text || res.statusText}`);
  }
  return (await res.json()) as T;
}

/* ============== API ============== */

export async function initUser(userId: string): Promise<{ success: boolean; balance: number }> {
  return j("/init", { method: "POST", body: { userId } });
}

export async function getBalance(userId: string): Promise<{ balance: number }> {
  return j("/balance", { method: "POST", body: { userId } });
}

export async function bet(
  userId: string,
  amount: number,
  roundId: string
): Promise<{ success: boolean; balance: number; message?: string }> {
  return j("/bet", { method: "POST", body: { userId, amount, roundId } });
}

export async function win(
  userId: string,
  winAmount: number,
  roundId: string
): Promise<{ success: boolean; balance: number; message?: string }> {
  return j("/win", { method: "POST", body: { userId, winAmount, roundId } });
}

export type LeaderboardRow = { userId: string; wins: number; profit: number };
export async function getLeaderboard(
  metric: "wins" | "profit",
  limit = 20
): Promise<{ entries: LeaderboardRow[] }> {
  return jGet(`/leaderboard?metric=${encodeURIComponent(metric)}&limit=${limit}`);
}

// на бэке маршрут называется /reflink — сделаем совместимость и с /ref-link
export async function getRefLink(
  userId: string
): Promise<{ web: string; telegram: string }> {
  try {
    return await j("/reflink", { method: "POST", body: { userId } });
  } catch {
    return await j("/ref-link", { method: "POST", body: { userId } });
  }
}

export async function applyRef(userId: string, code: string): Promise<{ success: boolean }> {
  try {
    return await j("/apply-ref", { method: "POST", body: { userId, code } });
  } catch {
    // не критично — просто молча игнорируем
    return { success: false };
  }
}

export async function topup(userId: string, amount: number): Promise<{ success: boolean; balance: number }> {
  return j("/topup", { method: "POST", body: { userId, amount } });
}
