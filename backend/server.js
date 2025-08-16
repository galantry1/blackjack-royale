// backend/server.js (ESM)
import express from "express";
import cors from "cors";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const HOST = process.env.HOST || "0.0.0.0";

const DATA_DIR = path.join(__dirname, "data");
const FILES = {
  balances: path.join(DATA_DIR, "balances.json"),
  history: path.join(DATA_DIR, "history.json"),
  refs: path.join(DATA_DIR, "refs.json")
};

const START_BALANCE = 1000;
const REF_BONUS = 0.05;

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try { await fs.access(FILES.balances); } catch { await fs.writeFile(FILES.balances, JSON.stringify({}, null, 2)); }
  try { await fs.access(FILES.history); }  catch { await fs.writeFile(FILES.history,  JSON.stringify([], null, 2)); }
  try { await fs.access(FILES.refs); }     catch { await fs.writeFile(FILES.refs,     JSON.stringify({ codes:{}, refOf:{} }, null, 2)); }
}

async function readJSON(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, "utf8")); }
  catch (e) { if (e.code === "ENOENT") return fallback; throw e; }
}
async function writeJSON(file, obj) {
  await fs.writeFile(file, JSON.stringify(obj, null, 2));
}

function now() { return Date.now(); }
function isPosInt(n) { return Number.isFinite(n) && n > 0; }

function baseUrl(req) {
  const proto = req.headers["x-forwarded-proto"] || req.protocol;
  const host  = req.headers["x-forwarded-host"]  || req.get("host");
  return `${proto}://${host}`;
}

/* ---------- routes ---------- */

app.get("/health", (_req, res) => res.send("ok"));

app.get("/init", async (req, res) => {
  const userId = String(req.query.userId || "");
  if (!userId) return res.status(400).json({ message: "userId required" });

  await ensureDir();
  const balances = await readJSON(FILES.balances, {});
  let created = false;
  if (!(userId in balances)) { balances[userId] = START_BALANCE; created = true; await writeJSON(FILES.balances, balances); }
  res.json({ created });
});

app.get("/balance", async (req, res) => {
  const userId = String(req.query.userId || "");
  if (!userId) return res.status(400).json({ message: "userId required" });

  await ensureDir();
  const balances = await readJSON(FILES.balances, {});
  res.json({ balance: balances[userId] ?? 0 });
});

app.get("/history", async (req, res) => {
  const userId = String(req.query.userId || "");
  if (!userId) return res.status(400).json({ message: "userId required" });

  await ensureDir();
  const history = await readJSON(FILES.history, []);
  res.json({ history: history.filter(h => h.userId === userId) });
});

// идемпотентная ставка
app.post("/bet", async (req, res) => {
  const { userId, amount, roundId } = req.body || {};
  if (!userId || !isPosInt(Number(amount)) || !roundId)
    return res.status(400).json({ success:false, message:"userId, amount, roundId required" });

  await ensureDir();
  const balances = await readJSON(FILES.balances, {});
  const history  = await readJSON(FILES.history, []);

  if (history.find(h => h.userId===userId && h.roundId===roundId && h.type==="bet"))
    return res.json({ success:true, balance: balances[userId] ?? 0 });

  const bal = balances[userId] ?? 0;
  if (bal < amount) return res.status(400).json({ success:false, message:"Недостаточно средств" });

  balances[userId] = bal - Number(amount);
  history.push({ userId, roundId, type:"bet", amount:Number(amount), ts:now() });

  await writeJSON(FILES.balances, balances);
  await writeJSON(FILES.history, history);
  res.json({ success:true, balance: balances[userId] });
});

// идемпотентное начисление
app.post("/win", async (req, res) => {
  const { userId, amount, roundId } = req.body || {};
  if (!userId || !isPosInt(Number(amount)) || !roundId)
    return res.status(400).json({ success:false, message:"userId, amount, roundId required" });

  await ensureDir();
  const balances = await readJSON(FILES.balances, {});
  const history  = await readJSON(FILES.history, []);

  if (history.find(h => h.userId===userId && h.roundId===roundId && h.type==="win"))
    return res.json({ success:true, balance: balances[userId] ?? 0 });

  balances[userId] = (balances[userId] ?? 0) + Number(amount);
  history.push({ userId, roundId, type:"win", amount:Number(amount), ts:now() });

  await writeJSON(FILES.balances, balances);
  await writeJSON(FILES.history, history);
  res.json({ success:true, balance: balances[userId] });
});

// лидерборд
app.get("/leaderboard", async (req, res) => {
  const metric = req.query.metric === "profit" ? "profit" : "wins";
  const limit  = Math.max(1, Math.min(200, Number(req.query.limit) || 20));

  await ensureDir();
  const history = await readJSON(FILES.history, []);

  const byRound = new Map(); // key: userId|roundId -> {bet, win}
  for (const h of history) {
    const key = `${h.userId}|${h.roundId}`;
    const obj = byRound.get(key) || { bet:0, win:0 };
    if (h.type === "bet") obj.bet = h.amount;
    if (h.type === "win") obj.win = h.amount;
    byRound.set(key, obj);
  }

  const agg = new Map(); // userId -> {wins, profit}
  for (const [key, v] of byRound) {
    const userId = key.split("|")[0];
    const u = agg.get(userId) || { userId, wins:0, profit:0 };
    const diff = (v.win || 0) - (v.bet || 0);
    if ((v.win || 0) > (v.bet || 0)) u.wins += 1;
    u.profit += diff;
    agg.set(userId, u);
  }

  let arr = Array.from(agg.values());
  arr.sort((a,b) => metric === "wins" ? b.wins - a.wins : b.profit - a.profit);
  res.json({ entries: arr.slice(0, limit) });
});

// партнёрка
app.get("/ref-link", async (req, res) => {
  const userId = String(req.query.userId || "");
  if (!userId) return res.status(400).json({ message: "userId required" });

  await ensureDir();
  const refs = await readJSON(FILES.refs, { codes:{}, refOf:{} });

  let code = refs.codes[userId];
  if (!code) {
    code = Math.random().toString(36).slice(2, 10);
    refs.codes[userId] = code;
    await writeJSON(FILES.refs, refs);
  }
  const web = `${baseUrl(req)}?ref=${encodeURIComponent(code)}`;
  const telegram = `https://t.me/your_bot?startapp=${encodeURIComponent(code)}`;
  res.json({ web, telegram });
});

app.post("/apply-ref", async (req, res) => {
  const { userId, code } = req.body || {};
  if (!userId || !code) return res.status(400).json({ message:"userId, code required" });

  await ensureDir();
  const refs = await readJSON(FILES.refs, { codes:{}, refOf:{} });

  if (refs.refOf[userId]) return res.json({ applied:false });
  const owner = Object.keys(refs.codes).find(u => refs.codes[u] === code);
  if (!owner || owner === userId) return res.json({ applied:false });

  refs.refOf[userId] = owner;
  await writeJSON(FILES.refs, refs);
  res.json({ applied:true });
});

// тестовое пополнение + 5% реф
app.post("/topup", async (req, res) => {
  const { userId, amount } = req.body || {};
  if (!userId || !isPosInt(Number(amount)))
    return res.status(400).json({ success:false, message:"userId, amount required" });

  await ensureDir();
  const balances = await readJSON(FILES.balances, {});
  const refs = await readJSON(FILES.refs, { codes:{}, refOf:{} });

  balances[userId] = (balances[userId] ?? 0) + Number(amount);

  const referrer = refs.refOf[userId];
  if (referrer) {
    const bonus = Math.floor(Number(amount) * 0.05);
    if (bonus > 0) balances[referrer] = (balances[referrer] ?? 0) + bonus;
  }

  await writeJSON(FILES.balances, balances);
  res.json({ success:true, balance: balances[userId] });
});

/* ---------- start ---------- */
ensureDir().then(() => {
  app.listen(PORT, HOST, () => {
    console.log(`API listening on http://${HOST}:${PORT}`);
  });
});
