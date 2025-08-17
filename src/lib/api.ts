// src/lib/api.ts
const BASE =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") || "";

// универсальный POST JSON
async function postJSON<T>(path: string, body: any): Promise<T> {
  const url = `${BASE}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}${txt ? ` — ${txt.slice(0, 180)}` : ""}`);
  }
  return res.json();
}

export type LeaderboardRow = { userId: string; wins: number; profit: number };

export async function initUser(userId: string) {
  return postJSON<{ success: true; balance: number }>("/init", { userId });
}

export async function getBalance(userId: string) {
  return postJSON<{ balance: number }>("/balance", { userId });
}

export async function bet(userId: string, amount: number, roundId: string) {
  return postJSON<{ success: boolean; balance: number; message?: string }>("/bet", {
    userId,
    amount,
    roundId,
  });
}

export async function win(userId: string, winAmount: number, roundId: string) {
  return postJSON<{ success: boolean; balance: number }>("/win", {
    userId,
    winAmount,
    roundId,
  });
}

export async function topup(userId: string, amount: number) {
  return postJSON<{ success: boolean; balance: number }>("/topup", {
    userId,
    amount,
  });
}

export async function getLeaderboard(metric: "wins" | "profit" = "wins", limit = 20) {
  const url = `${BASE}/leaderboard?metric=${metric}&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<{ entries: LeaderboardRow[] }>;
}

export async function getRefLink(userId: string) {
  return postJSON<{ web: string; telegram: string }>("/reflink", { userId });
}

export async function applyRef(userId: string, code: string) {
  return postJSON<{ success: boolean }>("/apply-ref", { userId, code });
}
