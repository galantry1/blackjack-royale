// server.js
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(bodyParser.json());

const dataDir = __dirname;
const balancesFile = path.join(dataDir, "balances.json");
const historyFile  = path.join(dataDir, "history.json");
const profilesFile = path.join(dataDir, "profiles.json"); // ref: { [userId]: { refCode, invitedBy } }

function ensureFiles() {
  if (!fs.existsSync(balancesFile)) fs.writeFileSync(balancesFile, "{}", "utf8");
  if (!fs.existsSync(historyFile))  fs.writeFileSync(historyFile,  "[]", "utf8");
  if (!fs.existsSync(profilesFile)) fs.writeFileSync(profilesFile, "{}", "utf8");
}
function readJSON(p, fallback) {
  ensureFiles();
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return fallback; }
}
function writeJSON(p, x) { fs.writeFileSync(p, JSON.stringify(x, null, 2), "utf8"); }

const now = () => Date.now();
const rnd = (n) => Math.floor(Math.random() * n);
const makeRefCode = (userId) => (userId.replace(/[^a-z0-9_]/gi,"").slice(0,8) + rnd(1e6)).toLowerCase();

app.get("/health", (_, res) => res.json({ ok: true }));

// ---------- Auth/Init ----------
app.post("/init", (req, res) => {
  const { userId } = req.body || {};
  if (!userId) return res.status(400).json({ success: false, message: "userId required" });

  const balances = readJSON(balancesFile, {});
  const profiles = readJSON(profilesFile, {});

  if (balances[userId] == null) balances[userId] = 1000; // стартовый баланс
  if (!profiles[userId]) profiles[userId] = { refCode: makeRefCode(userId), invitedBy: null };

  writeJSON(balancesFile, balances);
  writeJSON(profilesFile, profiles);
  res.json({ success: true, balance: balances[userId] });
});

app.get("/balance/:userId", (req, res) => {
  const balances = readJSON(balancesFile, {});
  res.json({ success: true, balance: balances[req.params.userId] ?? 0 });
});

app.get("/history/:userId", (req, res) => {
  const all = readJSON(historyFile, []);
  const list = all.filter(x => x.userId === req.params.userId)
                  .sort((a,b) => b.ts - a.ts)
                  .slice(0, 300);
  res.json({ success: true, history: list });
});

// ---------- Gameplay: bet/win (идемпотентно по roundId+type) ----------
app.post("/bet", (req, res) => {
  const { userId, amount, roundId } = req.body || {};
  if (!userId || !Number.isFinite(amount) || amount <= 0 || !roundId)
    return res.status(400).json({ success: false, message: "userId, amount>0, roundId required" });

  const balances = readJSON(balancesFile, {});
  const history  = readJSON(historyFile, []);

  const exists = history.find(h => h.userId===userId && h.roundId===roundId && h.type==="bet");
  if (exists) return res.json({ success: true, message: "already bet", balance: balances[userId] ?? 0 });

  const bal = balances[userId] ?? 0;
  if (bal < amount) return res.status(400).json({ success: false, message: "Недостаточно средств", balance: bal });

  balances[userId] = bal - amount;
  history.push({ userId, roundId, type: "bet", amount, ts: now() });

  writeJSON(balancesFile, balances);
  writeJSON(historyFile, history);
  res.json({ success: true, balance: balances[userId] });
});

app.post("/win", (req, res) => {
  const { userId, amount, roundId } = req.body || {};
  if (!userId || !Number.isFinite(amount) || amount < 0 || !roundId)
    return res.status(400).json({ success: false, message: "userId, amount>=0, roundId required" });

  const balances = readJSON(balancesFile, {});
  const history  = readJSON(historyFile, []);

  const exists = history.find(h => h.userId===userId && h.roundId===roundId && h.type==="win");
  if (exists) return res.json({ success: true, message: "already settled", balance: balances[userId] ?? 0 });

  balances[userId] = (balances[userId] ?? 0) + amount;
  history.push({ userId, roundId, type: "win", amount, ts: now() });

  writeJSON(balancesFile, balances);
  writeJSON(historyFile, history);
  res.json({ success: true, balance: balances[userId] });
});

// ---------- Leaderboard ----------
function computeLeaderboard(metric="wins", limit=20) {
  const hist = readJSON(historyFile, []);
  const rounds = new Map(); // key = userId::roundId -> {bet, win}
  for (const h of hist) {
    const key = `${h.userId}::${h.roundId}`;
    const acc = rounds.get(key) || { userId: h.userId, bet: 0, win: 0 };
    if (h.type === "bet") acc.bet = h.amount;
    if (h.type === "win") acc.win = h.amount;
    rounds.set(key, acc);
  }
  const byUser = new Map();
  for (const r of rounds.values()) {
    const u = byUser.get(r.userId) || { userId: r.userId, wins:0, losses:0, pushes:0, profit:0, rounds:0, wagered:0 };
    u.rounds += 1;
    u.wagered += r.bet || 0;
    if (!r.win && r.bet) { u.losses++; u.profit -= r.bet; }
    else if (r.win === r.bet && r.bet>0) { u.pushes++; }
    else if (r.win > r.bet) { u.wins++; u.profit += (r.win - r.bet); }
    byUser.set(r.userId, u);
  }
  let arr = Array.from(byUser.values());
  if (metric === "profit") arr.sort((a,b) => b.profit - a.profit || b.wins - a.wins);
  else arr.sort((a,b) => b.wins - a.wins || b.profit - a.profit);
  return arr.slice(0, limit);
}

app.get("/leaderboard", (req, res) => {
  const metric = (req.query.metric === "profit") ? "profit" : "wins";
  const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit || "20", 10)));
  res.json({ ok: true, metric, entries: computeLeaderboard(metric, limit), updatedAt: now() });
});

// ---------- Referrals MVP ----------
app.get("/ref/link/:userId", (req, res) => {
  const { userId } = req.params;
  const origin = (req.query.origin || "").toString(); // для веб-версии
  const profiles = readJSON(profilesFile, {});
  const p = profiles[userId] || { refCode: makeRefCode(userId), invitedBy: null };
  profiles[userId] = p;
  writeJSON(profilesFile, profiles);

  // веб-ссылка (для Vercel сайта)
  const web = origin ? `${origin}/?ref=${encodeURIComponent(p.refCode)}` : null;
  // телега (подставь своего бота)
  const bot = process.env.TG_BOT || "your_bot_name";
  const tg = `https://t.me/${bot}?startapp=${encodeURIComponent(p.refCode)}`;
  res.json({ success: true, code: p.refCode, web, telegram: tg });
});

// связать реферала вручную (если пришёл с ref=?)
app.post("/ref/apply", (req, res) => {
  const { userId, code } = req.body || {};
  if (!userId || !code) return res.status(400).json({ success:false, message:"userId & code required" });
  const profiles = readJSON(profilesFile, {});
  const inviter = Object.entries(profiles).find(([_, v]) => v.refCode === code);
  if (!inviter) return res.status(404).json({ success:false, message:"ref code not found" });
  if (!profiles[userId]) profiles[userId] = { refCode: makeRefCode(userId), invitedBy: null };
  profiles[userId].invitedBy = inviter[0];
  writeJSON(profilesFile, profiles);
  res.json({ success:true, invitedBy: inviter[0] });
});

// пополнение (для тестов/демо). Начисляет 5% рефереру.
app.post("/topup", (req, res) => {
  const { userId, amount } = req.body || {};
  if (!userId || !Number.isFinite(amount) || amount <= 0)
    return res.status(400).json({ success:false, message:"userId & amount>0 required" });

  const balances = readJSON(balancesFile, {});
  const profiles = readJSON(profilesFile, {});
  const history  = readJSON(historyFile, []);

  balances[userId] = (balances[userId] ?? 0) + amount;
  history.push({ userId, roundId: `topup_${now()}`, type:"win", amount, ts: now(), meta:"topup" });

  const invitedBy = profiles[userId]?.invitedBy;
  if (invitedBy) {
    const bonus = Math.floor(amount * 0.05);
    balances[invitedBy] = (balances[invitedBy] ?? 0) + bonus;
    history.push({ userId: invitedBy, roundId:`ref_${userId}_${now()}`, type:"win", amount: bonus, ts: now(), meta:"ref_bonus" });
  }

  writeJSON(balancesFile, balances);
  writeJSON(historyFile, history);
  res.json({ success:true, balance: balances[userId] });
});

app.listen(PORT, () => console.log(`✅ Backend running on ${PORT}`));
