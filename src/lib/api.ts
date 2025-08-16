// src/lib/api.ts
export type LeaderboardRow = { userId: string; wins: number; profit: number };

// Базовый URL бэка из .env (VITE_API_URL=https://blackjack-royale-backend.onrender.com)
const BASE = (import.meta.env.VITE_API_URL || "").replace(/\/+$/, "");
const url = (p: string) => `${BASE}${p}`;

// Универсальный JSON-фетчер
async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}${text ? ` – ${text}` : ""}`);
  }
  return res.json() as Promise<T>;
}

// Удобный POST с JSON
function post<T>(path: string, body: unknown): Promise<T> {
  return fetchJson<T>(url(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/* ======= API ======= */

// Создать/инициализировать пользователя
export function initUser(userId: string) {
  return post<{ ok: boolean }>("/init", { userId });
}

// Баланс пользователя
export function getBalance(userId: string) {
  return post<{ balance: number }>("/balance", { userId });
}

// История (сырая серверная, если нужна для агрегации)
export function getHistory(userId: string) {
  return post<{
    history: Array<{ roundId: string; userId: string; type: "bet" | "win"; amount: number; ts: number }>;
  }>("/history", { userId });
}

// Ставка
export function bet(userId: string, amount: number, roundId: string) {
  return post<{ success: boolean; balance: number; message?: string }>("/bet", { userId, amount, roundId });
}

// Начисление выигрыша/возврата
export function win(userId: string, amount: number, roundId: string) {
  return post<{ success: boolean; balance: number }>("/win", { userId, amount, roundId });
}

// Лидерборд
export function getLeaderboard(metric: "wins" | "profit" = "wins", limit = 20) {
  const qs = new URLSearchParams({ metric, limit: String(limit) });
  return fetchJson<{ entries: LeaderboardRow[] }>(url(`/leaderboard?${qs.toString()}`));
}

// Партнёрка — получить персональную ссылку
export function getRefLink(userId: string) {
  return post<{ web: string; telegram: string }>("/ref/link", { userId });
}

// Партнёрка — применить реф-код
export function applyRef(userId: string, code: string) {
  return post<{ ok: boolean }>("/ref/apply", { userId, code });
}

// DEV пополнение (для теста)
export function topup(userId: string, amount: number) {
  return post<{ balance: number }>("/topup", { userId, amount });
}
