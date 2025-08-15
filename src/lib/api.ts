export const API_URL = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

export type BalanceResp = { success: boolean; balance: number; message?: string };
export type HistoryItem = { roundId: string; userId: string; type: "bet" | "win"; amount: number; ts: number };

async function jfetch<T>(path: string, init?: RequestInit): Promise<T> {
  if (!API_URL) throw new Error("VITE_API_URL не задан");
  const res = await fetch(`${API_URL}${path}`, {
    ...(init || {}),
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText} ${txt}`);
  }
  return res.json() as Promise<T>;
}

export function initUser(userId: string) {
  return jfetch<BalanceResp>("/init", { method: "POST", body: JSON.stringify({ userId }) });
}
export function getBalance(userId: string) {
  return jfetch<BalanceResp>(`/balance/${encodeURIComponent(userId)}`);
}
export function bet(userId: string, amount: number, roundId: string) {
  return jfetch<BalanceResp>("/bet", { method: "POST", body: JSON.stringify({ userId, amount, roundId }) });
}
export function win(userId: string, amount: number, roundId: string) {
  return jfetch<BalanceResp>("/win", { method: "POST", body: JSON.stringify({ userId, amount, roundId }) });
}
export function getHistory(userId: string) {
  return jfetch<{ success: boolean; history: HistoryItem[] }>(`/history/${encodeURIComponent(userId)}`);
}
export function getLeaderboard(metric: "wins"|"profit"="wins", limit=20) {
  return jfetch<{ ok: boolean; metric: "wins"|"profit"; entries: { userId: string; wins: number; losses: number; pushes: number; profit: number; rounds: number; wagered: number }[] }>(`/leaderboard?metric=${metric}&limit=${limit}`);
}
