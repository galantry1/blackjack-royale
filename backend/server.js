import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { promises as fs } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// === файлы хранения (простая JSON-база) ===
const DATA_DIR = path.join(__dirname, "data");
const BAL_FILE = path.join(DATA_DIR, "balances.json");
const HIST_FILE = path.join(DATA_DIR, "history.json");   // список событий: bet/win/topup
const REF_FILE = path.join(DATA_DIR, "ref.json");        // { codes:{code:userId}, invitedBy:{userId:referrerId} }

await fs.mkdir(DATA_DIR, { recursive: true });

async function readJson(file, fallback) {
  try {
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}
async function writeJson(file, data) {
  await fs.writeFile(file, JSON.stringify(data, null, 2), "utf8");
}

// начальные структуры
let balances = await readJson(BAL_FILE, {});     // { userId: number }
let history = await readJson(HIST_FILE, []);     // [{ userId, roundId, type:"bet"|"win"|"topup", amount, ts }]
let refData  = await readJson(REF_FILE, { codes: {}, invitedBy: {} });

const app = express();
app.use(cors());
app.use(express.json());

const START_BALANCE = 1000;
const REF_PERCENT = 0.05;

// utils
const now = () => Date.now();
const saveAll = async () => {
  await Promise.all([
    writeJson(BAL_FILE, balances),
    writeJson(HIST_FILE, history),
    writeJson(REF_FILE, refData),
  ]);
};
const getBal = (id) => +balances[id] || 0;
const setBal = (id, v) => (balances[id] = Math.max(0, Math.floor(v)));

const ensureUser = (id) => {
  if (!(id in balances)) {
    setBal(id, START_BALANCE);
  }
};

// idемпотентность по раундам
function hasEvent(userId, roundId, type) {
  return history.some((e) => e.userId === userId && e.roundId === roundId && e.type === type);
}
function addEvent(e) {
  history.push({ ...e, ts: now() });
}

// ========== HEALTH ==========
app.get("/health", (_, res) => res.json({ ok: true }));

// ========== INIT/BALANCE ==========
app.post("/init", async (req, res) => {
  const { userId } = req.body || {};
  if (!userId) return res.status(400).json({ ok: false, message: "userId required" });
  ensureUser(userId);
  await saveAll();
  res.json({ ok: true });
});

app.post("/balance", async (req, res) => {
  const { userId } = req.body || {};
  if (!userId) return res.status(400).json({ message: "userId required" });
  ensureUser(userId);
  await saveAll();
  res.json({ balance: getBal(userId) });
});

// ========== HISTORY (сырая) ==========
app.post("/history", (req, res) => {
  const { userId } = req.body || {};
  if (!userId) return res.status(400).json({ message: "userId required" });
  res.json({ history: history.filter((e) => e.userId === userId) });
});

// ========== BET/WIN ==========
app.post("/bet", async (req, res) => {
  const { userId, amount, roundId } = req.body || {};
  if (!userId || !roundId || !Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ success: false, message: "bad params" });
  }
  ensureUser(userId);

  // если уже ставил этот раунд — считаем успехом (идемпотентность)
  if (hasEvent(userId, roundId, "bet")) {
    return res.json({ success: true, balance: getBal(userId) });
  }

  const bal = getBal(userId);
  if (bal < amount) {
    return res.json({ success: false, message: "Недостаточно средств", balance: bal });
  }

  setBal(userId, bal - amount);
  addEvent({ userId, roundId, type: "bet", amount });
  await saveAll();

  res.json({ success: true, balance: getBal(userId) });
});

app.post("/win", async (req, res) => {
  const { userId, amount, roundId } = req.body || {};
  if (!userId || !roundId || !Number.isFinite(amount) || amount < 0) {
    return res.status(400).json({ success: false, message: "bad params" });
  }
  ensureUser(userId);

  // не даём повторно начислять
  if (hasEvent(userId, roundId, "win")) {
    return res.json({ success: true, balance: getBal(userId) });
  }

  // допускаем win и без bet (например push) — просто начисляем
  setBal(userId, getBal(userId) + amount);
  addEvent({ userId, roundId, type: "win", amount });
  await saveAll();

  res.json({ success: true, balance: getBal(userId) });
});

// ========== LEADERBOARD ==========
app.get("/leaderboard", (req, res) => {
  const metric = (req.query.metric === "profit") ? "profit" : "wins";
  const limit = Math.max(1, Math.min(100, parseInt(req.query.limit || "20", 10)));

  // считаем по всей history
  const roundsByUser = new Map(); // userId -> Map(roundId -> { bet?:number, win?:number })
  for (const e of history) {
    if (e.type !== "bet" && e.type !== "win") continue;
    const m = roundsByUser.get(e.userId) || new Map();
    const r = m.get(e.roundId) || {};
    if (e.type === "bet") r.bet = (r.bet || 0) + e.amount;
    if (e.type === "win") r.win = (r.win || 0) + e.amount;
    m.set(e.roundId, r);
    roundsByUser.set(e.userId, m);
  }

  const rows = [];
  for (const [userId, rounds] of roundsByUser) {
    let wins = 0;
    let profit = 0;
    for (const { bet = 0, win = 0 } of rounds.values()) {
      if (win > bet) wins += 1;
      profit += (win - bet);
    }
    rows.push({ userId, wins, profit });
  }

  rows.sort((a, b) => metric === "wins"
    ? (b.wins - a.wins) || (b.profit - a.profit)
    : (b.profit - a.profit) || (b.wins - a.wins));

  res.json({ entries: rows.slice(0, limit) });
});

// ========== REF-LINKS ==========
function originFromReq(req) {
  const host = req.get("x-forwarded-host") || req.get("host");
  const proto = (req.get("x-forwarded-proto") || "http").split(",")[0];
  return `${proto}://${host}`;
}

app.post("/ref/link", (req, res) => {
  const { userId } = req.body || {};
  if (!userId) return res.status(400).json({ message: "userId required" });
  // код = userId закодированный
  const code = Buffer.from(String(userId)).toString("base64url");
  refData.codes[code] = userId;
  // web ссылка
  const base = originFromReq(req);
  const web = `${base}/?ref=${code}`;
  // tg deep link — твой username бота подставь, если надо
  const telegram = `https://t.me/your_bot?start=${code}`;
  res.json({ web, telegram, code });
});

// применить код
app.post("/ref/apply", async (req, res) => {
  const { userId, code } = req.body || {};
  if (!userId || !code) return res.status(400).json({ ok: false });

  const owner = refData.codes[code];
  if (!owner || owner === userId) return res.json({ ok: false });

  // один раз
  if (refData.invitedBy[userId]) return res.json({ ok: true });

  refData.invitedBy[userId] = owner;
  await saveAll();
  res.json({ ok: true });
});

// ========== DEV TOPUP ==========
app.post("/topup", async (req, res) => {
  const { userId, amount } = req.body || {};
  if (!userId || !Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ message: "bad params" });
  }
  ensureUser(userId);

  setBal(userId, getBal(userId) + Math.floor(amount));
  addEvent({ userId, roundId: `topup_${Date.now()}`, type: "topup", amount: Math.floor(amount) });

  // реф-бонус 5%
  const ref = refData.invitedBy[userId];
  if (ref) {
    const bonus = Math.floor(amount * REF_PERCENT);
    if (bonus > 0) {
      setBal(ref, getBal(ref) + bonus);
      addEvent({ userId: ref, roundId: `refbonus_${Date.now()}`, type: "topup", amount: bonus });
    }
  }

  await saveAll();
  res.json({ balance: getBal(userId) });
});

// ====== старт ======
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log("Backend listening on", PORT);
});
