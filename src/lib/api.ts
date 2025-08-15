// src/lib/api.ts
export const API_URL = import.meta.env.VITE_API_URL?.replace(/\/$/, "");

export type BalanceResp = { success: boolean; balance: number; message?: string };
export type HistoryItem = {
  roundId: string;
  userId: string;
  type: "bet" | "win";
  amount: number;
  ts: number;
};

async function jfetch<T>(path: string, init?: RequestInit): Promise<T> {
  if (!API_URL) throw new Error("VITE_API_URL не задан");
  const res = await fetch(`${API_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) throw new Error(`API ${path} ${res.status}`);
  return res.json();
}

export function initUser(userId: string): Promise<BalanceResp> {
  return jfetch<BalanceResp>("/init", { method: "POST", body: JSON.stringify({ userId }) });
}
export function getBalance(userId: string): Promise<BalanceResp> {
  return jfetch<BalanceResp>(`/balance/${encodeURIComponent(userId)}`);
}
export function bet(userId: string, amount: number, roundId: string): Promise<BalanceResp> {
  return jfetch<BalanceResp>("/bet", { method: "POST", body: JSON.stringify({ userId, amount, roundId }) });
}
export function win(userId: string, amount: number, roundId: string): Promise<BalanceResp> {
  return jfetch<BalanceResp>("/win", { method: "POST", body: JSON.stringify({ userId, amount, roundId }) });
}
export function getHistory(userId: string): Promise<{ success: boolean; history: HistoryItem[] }> {
  return jfetch(`/history/${encodeURIComponent(userId)}`);
}
