// backend/server.js (ESM)
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import path, { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// data рядом с файлом
const dataDir = __dirname;
const balancesFile = path.join(dataDir, "balances.json");
const historyFile  = path.join(dataDir, "history.json");

function ensureFiles() {
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
  if (!existsSync(balancesFile)) writeFileSync(balancesFile, "{}", "utf8");
  if (!existsSync(historyFile)) writeFileSync(historyFile, "[]", "utf8");
}
function loadBalances() { ensureFiles(); try { return JSON.parse(readFileSync(balancesFile, "utf8")); } catch { return {}; } }
function saveBalances(o) { writeFileSync(balancesFile, JSON.stringify(o, null, 2), "utf8"); }
function loadHistory() { ensureFiles(); try { return JSON.parse(readFileSync(historyFile, "utf8")); } catch { return []; } }
function saveHistory(a) { writeFileSync(historyFile, JSON.stringify(a, null, 2), "utf8"); }
const now = () => Date.now();

app.use(cors());
app.use(bodyParser.json());

app.get("/health", (_, res) => res.json({ ok: true }));

app.post("/init", (req, res) => {
  const { userId } = req.body || {};
  if (!userId) return res.status(400).json({ success: false, message: "userId required" });
  const balances = loadBalances();
  if (balances[userId] == null) { balances[userId] = 1000; saveBalances(balances); }
  res.json({ success: true, balance: balances[userId] });
});

app.get("/balance/:userId", (req, res) => {
  const { userId } = req.params;
  const balances = loadBalances();
  res.json({ success: true, balance: balances[userId] ?? 0 });
});

app.get("/history/:userId", (req, res) => {
  const { userId } = req.params;
  const history = loadHistory().filter(h => h.userId === userId).sort((a,b)=>b.ts-a.ts).slice(0,300);
  res.json({ success: true, history });
});

app.post("/bet", (req, res) => {
  const { userId, amount, roundId } = req.body || {};
  if (!userId || !Number.isFinite(amount) || amount <= 0 || !roundId)
    return res.status(400).json({ success: false, message: "userId, amount>0 and roundId required" });

  const balances = loadBalances();
  const history  = loadHistory();

  if (history.find(h => h.userId===userId && h.roundId===roundId && h.type==="bet"))
    return res.json({ success: true, balance: balances[userId] ?? 0, message: "already bet" });

  const bal = balances[userId] ?? 0;
  if (bal < amount) return res.status(400).json({ success:false, message:"not enough balance", balance: bal });

  balances[userId] = bal - amount;
  history.push({ userId, roundId, type:"bet", amount, ts: now() });
  saveBalances(balances); saveHistory(history);
  res.json({ success: true, balance: balances[userId] });
});

app.post("/win", (req, res) => {
  const { userId, amount, roundId } = req.body || {};
  if (!userId || !Number.isFinite(amount) || amount < 0 || !roundId)
    return res.status(400).json({ success: false, message: "userId, amount>=0 and roundId required" });

  const balances = loadBalances();
  const history  = loadHistory();

  if (history.find(h => h.userId===userId && h.roundId===roundId && h.type==="win"))
    return res.json({ success: true, balance: balances[userId] ?? 0, message: "already settled" });

  balances[userId] = (balances[userId] ?? 0) + amount;
  history.push({ userId, roundId, type:"win", amount, ts: now() });
  saveBalances(balances); saveHistory(history);
  res.json({ success: true, balance: balances[userId] });
});

// Лидерборд
function computeLeaderboard(metric = "wins", limit = 20) {
  const hist = loadHistory();
  const byRound = new Map();
  for (const h of hist) {
    const key = `${h.userId}::${h.roundId}`;
    const acc = byRound.get(key) || { userId: h.userId, bet: 0, win: 0 };
    if (h.type === "bet") acc.bet = h.amount;
    if (h.type === "win") acc.win = h.amount;
    byRound.set(key, acc);
  }
  const byUser = new Map();
  for (const r of byRound.values()) {
    const s = byUser.get(r.userId) || { userId:r.userId, wins:0, losses:0, pushes:0, profit:0, rounds:0, wagered:0 };
    s.rounds += 1;
    s.wagered += r.bet || 0;
    if (!r.win && r.bet) { s.losses += 1; s.profit -= r.bet; }
    else if (r.win === r.bet && r.bet > 0) { s.pushes += 1; }
    else if ((r.win ?? 0) > (r.bet ?? 0)) { s.wins += 1; s.profit += (r.win - r.bet); }
    byUser.set(r.userId, s);
  }
  let out = Array.from(byUser.values());
  if (metric === "profit") out.sort((a,b)=> b.profit - a.profit || b.wins - a.wins);
  else out.sort((a,b)=> b.wins - a.wins || b.profit - a.profit);
  return out.slice(0, limit);
}
app.get("/leaderboard", (req, res) => {
  const metric = req.query.metric === "profit" ? "profit" : "wins";
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || "20", 10)));
  res.json({ ok: true, metric, entries: computeLeaderboard(metric, limit), updatedAt: now() });
});

app.listen(PORT, () => console.log(`✅ Backend running on ${PORT}`));
