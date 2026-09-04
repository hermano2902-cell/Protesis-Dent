require("dotenv").config({ path: ".env.local" });
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const { Pool } = require("pg");

const app = express();
const isProduction = process.env.NODE_ENV === "production";
const port = Number(process.env.PORT) || 3000;
const sessionDurationMs = 7 * 24 * 60 * 60 * 1000;
const cookieName = "pd_session";
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10, ssl: { rejectUnauthorized: false } });
const catalogSource = require("fs").readFileSync(require("path").join(__dirname, "public", "app.js"), "utf8");
const catalog = new Map([...catalogSource.matchAll(/\[\s*(["'`])(.+?)\1\s*,\s*(\d+(?:\.\d+)?)\s*\]/g)].map(([, , name, price], id) => [id, { name, price: Number(price) }]));

app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors({ origin: process.env.FRONTEND_ORIGIN || false, credentials: true }));
app.use(express.json({ limit: "32kb" }));
app.use(cookieParser());
app.get("/", (req, res) => {
  res.json({
    ok: true,
    service: "Protesis Dent API"
  });
});
app.get("/api/health", async (req, res, next) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true, database: "connected" });
  } catch (error) {
    next(error);
  }
});

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false, message: { error: "Demasiados intentos. Intenta de nuevo más tarde." } });
const apiLimiter = rateLimit({ windowMs: 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false });
app.use("/api", apiLimiter);
app.use("/api/auth", authLimiter);

function validEmail(email) { return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254; }
function validText(value, max) { return typeof value === "string" && value.trim().length > 0 && value.trim().length <= max; }
function newSessionToken() { return crypto.randomBytes(32).toString("base64url"); }
function hashToken(token) { return crypto.createHash("sha256").update(token).digest("hex"); }
function setSessionCookie(res, token) { res.cookie(cookieName, token, { httpOnly: true, secure: isProduction, sameSite: isProduction ? "none" : "lax", maxAge: sessionDurationMs, path: "/" }); }
function clearSessionCookie(res) { res.clearCookie(cookieName, { httpOnly: true, secure: isProduction, sameSite: isProduction ? "none" : "lax", path: "/" }); }

async function createSession(userId, res) {
  const token = newSessionToken();
  await pool.query("insert into sessions (user_id, token_hash, expires_at) values ($1, $2, $3)", [userId, hashToken(token), new Date(Date.now() + sessionDurationMs)]);
  setSessionCookie(res, token);
}

async function authenticate(req, res, next) {
  const token = req.cookies?.[cookieName];
  if (!token) return res.status(401).json({ error: "No autenticado" });
  const result = await pool.query("select u.id, u.name, u.email, u.phone from sessions s join users u on u.id = s.user_id where s.token_hash = $1 and s.expires_at > now() and u.active = true", [hashToken(token)]);
  if (!result.rowCount) { clearSessionCookie(res); return res.status(401).json({ error: "Sesión inválida o expirada" }); }
  req.user = result.rows[0];
  await pool.query("update sessions set last_used_at = now() where token_hash = $1", [hashToken(token)]);
  next();
}

app.post("/api/auth/register", async (req, res, next) => {
  try {
    const { name, email, password, phone = null } = req.body || {};
    if (!validText(name, 120) || !validEmail(email) || typeof password !== "string" || password.length < 10 || password.length > 128 || (phone !== null && !validText(phone, 30))) return res.status(400).json({ error: "Datos de registro inválidos" });
    const passwordHash = await bcrypt.hash(password, 12);
    const result = await pool.query("insert into users (name, email, phone, password_hash) values ($1, lower($2), $3, $4) returning id, name, email, phone", [name.trim(), email.trim(), phone ? phone.trim() : null, passwordHash]);
    await createSession(result.rows[0].id, res);
    res.status(201).json({ user: result.rows[0] });
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ error: "Ese correo ya está registrado" });
    next(error);
  }
});

app.post("/api/auth/login", async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!validEmail(email) || typeof password !== "string" || password.length > 128) return res.status(400).json({ error: "Correo o contraseña inválidos" });
    const result = await pool.query("select id, name, email, phone, password_hash from users where email = lower($1) and active = true", [email.trim()]);
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ error: "Correo o contraseña incorrectos" });
    await createSession(user.id, res);
    delete user.password_hash;
    res.json({ user });
  } catch (error) { next(error); }
});

app.post("/api/auth/logout", authenticate, async (req, res, next) => {
  try { await pool.query("delete from sessions where user_id = $1", [req.user.id]); clearSessionCookie(res); res.status(204).end(); } catch (error) { next(error); }
});
app.delete("/api/auth/me", authenticate, async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("delete from quote_items where quote_id in (select id from quotes where user_id = $1)", [req.user.id]);
    await client.query("delete from quotes where user_id = $1", [req.user.id]);
    await client.query("delete from sessions where user_id = $1", [req.user.id]);
    await client.query("delete from users where id = $1", [req.user.id]);
    await client.query("commit");
    clearSessionCookie(res);
    res.status(204).end();
  } catch (error) { await client.query("rollback"); next(error); } finally { client.release(); }
});
app.get("/api/auth/me", authenticate, (req, res) => res.json({ user: req.user }));

app.get("/api/quotes", authenticate, async (req, res, next) => {
  try {
    const result = await pool.query("select id, folio, total, status, notes, created_at, (select coalesce(json_agg(json_build_object('id', qi.id, 'product_id', qi.product_id, 'name', qi.product_name, 'price', qi.unit_price, 'quantity', qi.quantity, 'subtotal', qi.subtotal) order by qi.created_at), '[]'::json) from quote_items qi where qi.quote_id = q.id) as items from quotes q where q.user_id = $1 order by q.created_at desc", [req.user.id]);
    res.json({ quotes: result.rows });
  } catch (error) { next(error); }
});

app.post("/api/quotes", authenticate, async (req, res, next) => {
  const { items, notes = null } = req.body || {};
  if (!Array.isArray(items) || !items.length || items.length > 100 || (notes !== null && !validText(notes, 1000))) return res.status(400).json({ error: "Cotización inválida" });
  const normalized = items.map(item => ({ productId: Number(item.productId), quantity: Number(item.quantity) }));
  if (normalized.some(item => !Number.isInteger(item.productId) || !catalog.has(item.productId) || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 999)) return res.status(400).json({ error: "Productos inválidos" });
  normalized.forEach(item => { const product = catalog.get(item.productId); item.name = product.name; item.price = product.price; });
  const subtotal = normalized.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const client = await pool.connect();
  try {
    await client.query("begin");
    const quote = await client.query("insert into quotes (user_id, folio, total, status, notes) values ($1, $2, $3, 'pending', $4) returning id, folio, total, status, notes, created_at", [req.user.id, `PD-${Date.now().toString(36).toUpperCase()}`, subtotal, notes ? notes.trim() : null]);
    for (const item of normalized) await client.query("insert into quote_items (quote_id, product_id, product_name, unit_price, quantity) values ($1, $2, $3, $4, $5)", [quote.rows[0].id, item.productId, item.name, item.price, item.quantity]);
    await client.query("commit");
    res.status(201).json({ quote: { ...quote.rows[0], items: normalized } });
  } catch (error) { await client.query("rollback"); next(error); } finally { client.release(); }
});

app.use((error, req, res, next) => { console.error(error); res.status(500).json({ error: "Error interno del servidor" }); });
app.listen(port, () => console.log(`API escuchando en puerto ${port}`));
