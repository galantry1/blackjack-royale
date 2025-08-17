// backend/server.cjs (CommonJS)
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// ==== storage (файлы только в ./data) ====
const DATA_DIR = path.join(__dirname, "data");
const BAL_PATH = path.join(DATA_DIR, "balances.json");
const HIS_PATH = path.join(DATA_DIR, "history.json");
const REF_PATH = path.join(DATA_DIR, "refs.json");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(BAL_PATH)) fs.writeFileSync(BAL_PATH, "{}");
if (!fs.existsSync(HIS_PATH)) fs.writeFileSync(HIS_PATH, "[]");
if (!fs.existsSync(REF_PATH)) fs.writeFileSync(REF_PATH, "{}");

const readJSON = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const writeJSON = (p, v) => fs.writeFileSync(p, JSON.stringify(v, null, 2));

const balances = readJSON(BAL_PATH); // { userId: number }
const history = readJSON(HIS_PATH);  // [{ roundId, userId, type: 'bet'|'win', amount, ts }]
const refs = readJSON(REF_PATH);     // { code: inviterUserId }

// helper
function ensureUser(userId) {
  if (balances[userId] == null) balances[userId] = 1000; // старт для новых
}
function saveBalances() { writeJSON(BAL_PATH, balances); }
function saveHistory() { writeJSON(HIS_PATH, history); }
function saveRefs() { writeJSON(REF_PATH, refs); }

// idемпотентность: есть ли запись про этот раунд/тип
function hasHistory(userId, roundId, type) {
  return history.some(h => h.userId === userId && h.roundId === roundId && h.type === type);
}

app.get("/health", (_, res) => res.send("ok"));

app.post("/init", (req, res) => {
  const { userId } = req.body || {};
  if (!userId) return res.status(400).json({ success: false, message: "no userId" });
  if (balances[userId] == null) {
    balances[userId] = 1000;
    saveBalances();
  }
  return res.json({ success: true, balance: balances[userId] });
});

app.post("/balance", (req, res) => {
  const { userId } = req.body || {};
  if (!userId) return res.status(400).json({ message: "no userId" });
  ensureUser(userId);
  return res.json({ balance: balances[userId] });
});

app.post("/bet", (req, res) => {
  const { userId, amount, roundId } = req.body || {};
  const a = Math.floor(Number(amount));
  if (!userId || !roundId || !Number.isFinite(a) || a <= 0)
    return res.status(400).json({ success: false, message: "bad args" });

  ensureUser(userId);

  // если уже списано по этому раунду — возвращаем текущий баланс (идемпотентность)
  if (hasHistory(userId, roundId, "bet")) {
    return res.json({ success: true, balance: balances[userId] });
  }

  if (balances[userId] < a) {
    return res.json({ success: false, message: "Недостаточно средств", balance: balances[userId] });
  }

  balances[userId] -= a;
  history.push({ roundId, userId, type: "bet", amount: a, ts: Date.now() });
  saveBalances();
  saveHistory();
  return res.json({ success: true, balance: balances[userId] });
});

app.post("/win", (req, res) => {
  const { userId, winAmount, roundId } = req.body || {};
  const w = Math.floor(Number(winAmount));
  if (!userId || !roundId || !Number.isFinite(w) || w < 0)
    return res.status(400).json({ success: false, message: "bad args" });

  ensureUser(userId);

  // если уже начисляли — идемпотентно
  if (hasHistory(userId, roundId, "win")) {
    return res.json({ success: true, balance: balances[userId] });
  }

  balances[userId] += w;
  history.push({ roundId, userId, type: "win", amount: w, ts: Date.now() });
  saveBalances();
  saveHistory();
  return res.json({ success: true, balance: balances[userId] });
});

app.post("/topup", (req, res) => {
  const { userId, amount } = req.body || {};
  const a = Math.floor(Number(amount));
  if (!userId || !Number.isFinite(a) || a <= 0)
    return res.status(400).json({ success: false, message: "bad args" });

  ensureUser(userId);
  balances[userId] += a;
  saveBalances();
  return res.json({ success: true, balance: balances[userId] });
});

// простая партнёрка-заглушка (линки)
app.post("/reflink", (req, res) => {
  const { userId } = req.body || {};
  const base = process.env.WEB_BASE || "https://example.com";
  const code = Buffer.from(String(userId || "")).toString("base64").slice(0, 12);
  refs[code] = String(userId || "");
  saveRefs();
  res.json({
    web: `${base}/?ref=${code}`,
    telegram: `https://t.me/your_bot?startapp=${code}`,
  });
});
// совместимость с /ref-link
app.post("/ref-link", (req, res) => {
  const { userId } = req.body || {};
  const base = process.env.WEB_BASE || "https://example.com";
  const code = Buffer.from(String(userId || "")).toString("base64").slice(0, 12);
  refs[code] = String(userId || "");
  saveRefs();
  res.json({
    web: `${base}/?ref=${code}`,
    telegram: `https://t.me/your_bot?startapp=${code}`,
  });
});

app.post("/apply-ref", (req, res) => {
  // можно сохранять связку "приглашённый -> код", для MVP просто ok
  res.json({ success: true });
});

// агрегация лидерборда
app.get("/leaderboard", (req, res) => {
  const metric = (req.query.metric === "profit" ? "profit" : "wins");
  const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 20));

  const byUser = new Map(); // userId -> { wins, profit }
  for (const h of history) {
    const row = byUser.get(h.userId) || { wins: 0, profit: 0 };
    if (h.type === "win") {
      row.wins += 1;
      row.profit += h.amount;
    } else if (h.type === "bet") {
      row.profit -= h.amount;
    }
    byUser.set(h.userId, row);
  }

  let entries = Array.from(byUser.entries()).map(([userId, v]) => ({
    userId,
    wins: v.wins,
    profit: v.profit,
  }));

  entries.sort((a, b) =>
    metric === "wins" ? b.wins - a.wins || b.profit - a.profit : b.profit - a.profit || b.wins - a.wins
  );

  res.json({ entries: entries.slice(0, limit) });
});

app.listen(PORT, () => {
  console.log("Backend listening on", PORT);
});
