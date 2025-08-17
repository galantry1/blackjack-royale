// src/lib/api.ts
/* eslint-disable no-console */

type Json = Record<string, any>;

export type LeaderboardRow = { userId: string; wins: number; profit: number };

const BASE = (() => {
  const env = (import.meta as any)?.env?.VITE_API_URL?.trim();
  const fallback =
    location.hostname === "localhost" ? "http://localhost:3001" : "https://blackjack-royale-backend.onrender.com";
  const url = (env || fallback).replace(/\/+$/, "");
  console.log("[API] BASE =", url);
  return url;
})();

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} — ${text || res.statusText}`);
  }
  return (await res.json()) as T;
}

async function j<T>(path: string, data: Json): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(data),
  });
  return handle<T>(res);
}

async function jGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  return handle<T>(res);
}

/* ========= API ========= */

export const initUser = (userId: string) =>
  j<{ success: boolean; balance: number }>("/init", { userId });

export const getBalance = (userId: string) =>
  j<{ balance: number }>("/balance", { userId });

export const bet = (userId: string, amount: number, roundId: string) =>
  j<{ success: boolean; balance: number; message?: string }>("/bet", {
    userId,
    amount,
    roundId,
  });

export const win = (userId: string, winAmount: number, roundId: string) =>
  j<{ success: boolean; balance: number; message?: string }>("/win", {
    userId,
    winAmount,
    roundId,
  });

export const topup = (userId: string, amount: number) =>
  j<{ success: boolean; balance: number }>("/topup", { userId, amount });

export const getLeaderboard = (metric: "wins" | "profit" = "wins", limit = 20) =>
  jGet<{ entries: LeaderboardRow[] }>(`/leaderboard?metric=${metric}&limit=${limit}`);

export const getRefLink = (userId: string) =>
  j<{ web: string; telegram: string }>("/reflink", { userId });

export const applyRef = (userId: string, code: string) =>
  j<{ success: boolean }>("/apply-ref", { userId, code });
