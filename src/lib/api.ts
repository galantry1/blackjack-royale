/* eslint-disable no-console */

export type LeaderboardRow = {
  userId: string;
  wins: number;
  profit: number;
  name?: string | null; // имя/ник
};

type Json = Record<string, any>;

const BASE = (() => {
  const env = (import.meta as any)?.env?.VITE_API_URL?.trim?.();
  const fallback =
    location.hostname === "localhost" ? "http://localhost:3001" : "https://blackjack-royale-backend.onrender.com";
  const url = (env || fallback).replace(/\/+$/, "");
  console.log("[API] BASE =", url);
  return url;
})();

async function j<T>(path: string, body?: Json): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`API ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}
async function jGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { method: "GET" });
  if (!res.ok) throw new Error(`API ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

// ===== PUBLIC =====
export const initUser = (payload:
  | string
  | { userId: string; username?: string|null; first_name?: string|null; last_name?: string|null; displayName?: string|null }
) => {
  const data = typeof payload === "string" ? { userId: payload } : payload;
  return j<{ ok: true }>("/init", data);
};

export const getBalance = (userId: string) => j<{ balance: number }>("/balance", { userId });
export const bet = (userId: string, amount: number, roundId: string) =>
  j<{ success: boolean; balance: number; message?: string }>("/bet", { userId, amount, roundId });
export const win = (userId: string, amount: number, roundId: string) =>
  j<{ success: boolean; balance: number }>("/win", { userId, amount, roundId });
export const topup = (userId: string, amount: number) =>
  j<{ success: boolean; balance: number }>("/topup", { userId, amount });

export const getLeaderboard = (metric: "wins" | "profit" = "wins", limit = 20) =>
  jGet<{ entries: LeaderboardRow[] }>(`/leaderboard?metric=${metric}&limit=${limit}`);

export const getRefLink = (userId: string) => j<{ web: string; telegram: string }>("/reflink", { userId });
export const applyRef = (userId: string, code: string) => j<{ success: boolean }>("/apply-ref", { userId, code });

// helper: Telegram user
export function getTelegramUser() {
  const tg = (window as any)?.Telegram?.WebApp;
  const u = tg?.initDataUnsafe?.user;
  if (!u) return null;
  return {
    id: u.id?.toString?.() ?? null,
    username: u.username ?? null,
    first_name: u.first_name ?? null,
    last_name: u.last_name ?? null,
    displayName: [u.first_name, u.last_name].filter(Boolean).join(" ") || u.username || null,
  };
}
