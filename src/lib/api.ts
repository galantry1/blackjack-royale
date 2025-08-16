const API = import.meta.env.VITE_API_URL!.replace(/\/$/, "");

async function j<T>(res: Response) {
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as T;
}

export async function initUser(userId: string) {
  return j<{ success: boolean; balance: number }>(
    fetch(`${API}/init`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId }) })
  );
}
export async function getBalance(userId: string) {
  return j<{ success: boolean; balance: number }>(fetch(`${API}/balance/${userId}`));
}
export async function getHistory(userId: string) {
  return j<{ success: boolean; history: any[] }>(fetch(`${API}/history/${userId}`));
}
export async function bet(userId: string, amount: number, roundId: string) {
  return j<{ success: boolean; balance: number; message?: string }>(
    fetch(`${API}/bet`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, amount, roundId }) })
  );
}
export async function win(userId: string, amount: number, roundId: string) {
  return j<{ success: boolean; balance: number }>(
    fetch(`${API}/win`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, amount, roundId }) })
  );
}
export async function getLeaderboard(metric: "wins"|"profit", limit=20) {
  return j<{ ok: boolean; metric: string; entries: LeaderboardRow[]; updatedAt: number }>(
    fetch(`${API}/leaderboard?metric=${metric}&limit=${limit}`)
  );
}
export type LeaderboardRow = {
  userId: string; wins: number; losses: number; pushes: number;
  profit: number; rounds: number; wagered: number;
};

export async function getRefLink(userId: string) {
  return j<{ success: boolean; code: string; web: string|null; telegram: string }>(
    fetch(`${API}/ref/link/${encodeURIComponent(userId)}?origin=${encodeURIComponent(location.origin)}`)
  );
}
export async function applyRef(userId: string, code: string) {
  return j<{ success: boolean; invitedBy: string }>(
    fetch(`${API}/ref/apply`, { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ userId, code }) })
  );
}
export async function topup(userId: string, amount: number) {
  return j<{ success: boolean; balance: number }>(
    fetch(`${API}/topup`, { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ userId, amount }) })
  );
}
