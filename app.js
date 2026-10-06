const express = require('express');
const { createClient } = require('@libsql/client');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Trên Vercel không có file local.db và không được dùng secret mặc định → báo lỗi rõ ràng thay vì chạy sai
if (process.env.VERCEL && (!process.env.TURSO_DATABASE_URL || (process.env.JWT_SECRET || '').length < 16))
  throw new Error('Thiếu biến môi trường trên Vercel: cần TURSO_DATABASE_URL, TURSO_AUTH_TOKEN và JWT_SECRET (>= 16 ký tự)');

const SECRET = process.env.JWT_SECRET || 'dev-secret-nho-doi-khi-deploy';
const db = createClient({
  url: process.env.TURSO_DATABASE_URL || 'file:local.db',
  authToken: process.env.TURSO_AUTH_TOKEN,
});

let ready;
const init = () => (ready ||= db.batch([
  `CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE COLLATE NOCASE, password_hash TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS decks(id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, title TEXT NOT NULL, description TEXT DEFAULT '')`,
  `CREATE TABLE IF NOT EXISTS cards(id INTEGER PRIMARY KEY AUTOINCREMENT, deck_id INTEGER NOT NULL, front TEXT NOT NULL, back TEXT NOT NULL)`,
]));
const q = async (sql, args = []) => (await db.execute({ sql, args })).rows.map((r) => ({ ...r }));

const app = express();
app.use(express.json({ limit: '1mb' }));

const h = (fn) => (req, res) =>
  init().then(() => fn(req, res)).catch((e) => {
    console.error(e);
    // Chẩn đoán kết nối DB (không in giá trị bí mật)
    const u = process.env.TURSO_DATABASE_URL || '';
    const t = process.env.TURSO_AUTH_TOKEN || '';
    console.error('DB diag:', JSON.stringify({ url: u.replace(/\/\/[^@/]*@/, '//***@'), urlLen: u.length, tokenLen: t.length, tokenEdgeSpace: t !== t.trim(), node: process.version, status: e.cause?.status, body: String(e.cause?.message || '').slice(0, 300) }));
    res.status(500).json({ error: 'Lỗi máy chủ' });
  });
const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });
const str = (v, max) => String(v ?? '').trim().slice(0, max);

const login = (res, id) =>
  res.setHeader('Set-Cookie', `token=${jwt.sign({ uid: id }, SECRET, { expiresIn: '30d' })}; HttpOnly; Path=/; Max-Age=2592000; SameSite=Lax${process.env.VERCEL ? '; Secure' : ''}`);
const auth = (req, res, next) => {
  const m = (req.headers.cookie || '').match(/(?:^|; )token=([^;]+)/);
  try { req.uid = jwt.verify(m && m[1], SECRET).uid; next(); } catch { bad(res, 'Chưa đăng nhập', 401); }
};
const ownDeck = async (req, id) => (await q('SELECT * FROM decks WHERE id=? AND user_id=?', [id, req.uid]))[0];
const ownCard = async (req, id) =>
  (await q('SELECT c.* FROM cards c JOIN decks d ON d.id=c.deck_id WHERE c.id=? AND d.user_id=?', [id, req.uid]))[0];

// ---- Tài khoản ----
app.post('/api/register', h(async (req, res) => {
  const username = str(req.body.username, 30);
  const { password, password2 } = req.body;
  if (username.length < 3) return bad(res, 'Tên đăng nhập cần ít nhất 3 ký tự');
  if (!password || password.length < 6) return bad(res, 'Mật khẩu cần ít nhất 6 ký tự');
  if (password !== password2) return bad(res, 'Mật khẩu nhập lại không khớp');
  if ((await q('SELECT id FROM users WHERE username=?', [username]))[0]) return bad(res, 'Tên đăng nhập đã tồn tại', 409);
  const r = await db.execute({ sql: 'INSERT INTO users(username,password_hash) VALUES(?,?)', args: [username, await bcrypt.hash(password, 10)] });
  login(res, Number(r.lastInsertRowid));
  res.json({ username });
}));

app.post('/api/login', h(async (req, res) => {
  const u = (await q('SELECT * FROM users WHERE username=?', [str(req.body.username, 30)]))[0];
  if (!u || !(await bcrypt.compare(String(req.body.password || ''), u.password_hash))) return bad(res, 'Sai tên đăng nhập hoặc mật khẩu', 401);
  login(res, u.id);
  res.json({ username: u.username });
}));

app.post('/api/logout', (req, res) => { res.setHeader('Set-Cookie', 'token=; HttpOnly; Path=/; Max-Age=0'); res.json({ ok: true }); });
app.get('/api/me', auth, h(async (req, res) => {
  const u = (await q('SELECT username FROM users WHERE id=?', [req.uid]))[0];
  u ? res.json(u) : bad(res, 'Chưa đăng nhập', 401);
}));

// ---- Bộ thẻ ----
app.get('/api/decks', auth, h(async (req, res) =>
  res.json(await q('SELECT d.*, (SELECT COUNT(*) FROM cards WHERE deck_id=d.id) AS count FROM decks d WHERE user_id=? ORDER BY id DESC', [req.uid]))));

app.post('/api/decks', auth, h(async (req, res) => {
  const title = str(req.body.title, 100);
  if (!title) return bad(res, 'Cần nhập tên bộ thẻ');
  const r = await db.execute({ sql: 'INSERT INTO decks(user_id,title,description) VALUES(?,?,?)', args: [req.uid, title, str(req.body.description, 300)] });
  res.json({ id: Number(r.lastInsertRowid) });
}));

app.get('/api/decks/:id', auth, h(async (req, res) => {
  const deck = await ownDeck(req, req.params.id);
  if (!deck) return bad(res, 'Không tìm thấy bộ thẻ', 404);
  res.json({ deck, cards: await q('SELECT * FROM cards WHERE deck_id=? ORDER BY id', [deck.id]) });
}));

app.put('/api/decks/:id', auth, h(async (req, res) => {
  const deck = await ownDeck(req, req.params.id);
  if (!deck) return bad(res, 'Không tìm thấy bộ thẻ', 404);
  await q('UPDATE decks SET title=?, description=? WHERE id=?', [str(req.body.title, 100) || deck.title, str(req.body.description ?? deck.description, 300), deck.id]);
  res.json({ ok: true });
}));

app.delete('/api/decks/:id', auth, h(async (req, res) => {
  const deck = await ownDeck(req, req.params.id);
  if (!deck) return bad(res, 'Không tìm thấy bộ thẻ', 404);
  await db.batch([{ sql: 'DELETE FROM cards WHERE deck_id=?', args: [deck.id] }, { sql: 'DELETE FROM decks WHERE id=?', args: [deck.id] }]);
  res.json({ ok: true });
}));

// ---- Thẻ (nhận 1 thẻ hoặc mảng `cards`) ----
app.post('/api/decks/:id/cards', auth, h(async (req, res) => {
  const deck = await ownDeck(req, req.params.id);
  if (!deck) return bad(res, 'Không tìm thấy bộ thẻ', 404);
  const list = (Array.isArray(req.body.cards) ? req.body.cards : [req.body])
    .map((c) => ({ front: str(c.front, 500), back: str(c.back, 1000) })).filter((c) => c.front && c.back).slice(0, 500);
  if (!list.length) return bad(res, 'Thẻ cần có cả mặt trước và mặt sau');
  await db.batch(list.map((c) => ({ sql: 'INSERT INTO cards(deck_id,front,back) VALUES(?,?,?)', args: [deck.id, c.front, c.back] })));
  res.json({ added: list.length });
}));

app.put('/api/cards/:id', auth, h(async (req, res) => {
  const c = await ownCard(req, req.params.id);
  if (!c) return bad(res, 'Không tìm thấy thẻ', 404);
  await q('UPDATE cards SET front=?, back=? WHERE id=?', [str(req.body.front, 500) || c.front, str(req.body.back, 1000) || c.back, c.id]);
  res.json({ ok: true });
}));

app.delete('/api/cards/:id', auth, h(async (req, res) => {
  const c = await ownCard(req, req.params.id);
  if (!c) return bad(res, 'Không tìm thấy thẻ', 404);
  await q('DELETE FROM cards WHERE id=?', [c.id]);
  res.json({ ok: true });
}));

module.exports = app;
