const $ = (s) => document.querySelector(s), app = $('#app');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const api = async (p, m = 'GET', b) => {
  const r = await fetch('/api' + p, { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(d.error || 'Có lỗi xảy ra'), { status: r.status });
  return d;
};
let user = null, pending = null; // pending: trang đang muốn vào trước khi đăng nhập (vd. liên kết chia sẻ)

// Khoá vùng `scope` trong lúc gọi API: chặn gửi lặp, hiện spinner. Thành công thì giữ khoá đến khi giao diện được vẽ lại
// (route() tự gỡ); `restore` dùng cho thao tác không vẽ lại. Lỗi thì mở khoá và báo lỗi.
const busy = async (scope, btn, fn, { restore = false, onError } = {}) => {
  if (scope.dataset.busy) return;
  scope.dataset.busy = '1';
  const els = [...scope.querySelectorAll('input,textarea,button')], was = els.map((e) => e.disabled);
  const unlock = () => { delete scope.dataset.busy; els.forEach((e, i) => (e.disabled = was[i])); btn?.classList.remove('busy'); scope.classList.remove('loading'); };
  els.forEach((e) => (e.disabled = true)); btn?.classList.add('busy'); scope.classList.add('loading');
  try { await fn(); if (restore) unlock(); }
  catch (err) {
    unlock();
    if (err.status === 401) { user = null; return route(); }
    (onError || ((x) => alert(x.message)))(err);
  }
};

const shell = (html) => {
  app.innerHTML = `<header><a class="logo" href="#/">🗂️ Flashcard</a><span>${user ? `${esc(user)} <button class="ghost" id="out">Đăng xuất</button>` : ''}</span></header><main>${html}</main>`;
  if ($('#out')) $('#out').onclick = () => busy(app, $('#out'), async () => { await api('/logout', 'POST'); user = null; location.hash = '#/login'; route(); });
};

function authView(reg) {
  app.innerHTML = `<header><a class="logo" href="#/">🗂️ Flashcard</a></header>
  <form class="auth" id="f"><h1>${reg ? 'Tạo tài khoản' : 'Đăng nhập'}</h1>
  <input name="username" placeholder="Tên đăng nhập" autocomplete="username" required>
  <input name="password" type="password" placeholder="Mật khẩu" autocomplete="${reg ? 'new-password' : 'current-password'}" required>
  ${reg ? '<input name="password2" type="password" placeholder="Nhập lại mật khẩu" autocomplete="new-password" required>' : ''}
  <p class="err" id="e"></p><button>${reg ? 'Đăng ký' : 'Đăng nhập'}</button>
  <p class="mu c">${reg ? 'Đã có tài khoản? <a href="#/login">Đăng nhập</a>' : 'Chưa có tài khoản? <a href="#/register">Đăng ký</a>'}</p></form>`;
  $('#f').onsubmit = async (e) => {
    e.preventDefault();
    $('#e').textContent = '';
    const data = Object.fromEntries(new FormData(e.target));
    busy(app, $('#f button'), async () => {
      const r = await api(reg ? '/register' : '/login', 'POST', data);
      user = r.username; location.hash = pending || '#/'; pending = null; route();
    }, { onError: (err) => { $('#e').textContent = err.message; } });
  };
}

async function decksView() {
  const decks = await api('/decks');
  shell(`<h1>Bộ thẻ của bạn</h1>
  <form id="f" class="row"><input name="title" placeholder="Tên bộ thẻ mới" required><input name="description" placeholder="Mô tả (không bắt buộc)"><button>Tạo bộ thẻ</button></form>
  ${decks.map((d) => `<a class="deck" href="#/deck/${d.id}"><b>${esc(d.title)}</b><br><span class="mu">${d.count} thẻ${d.description ? ' · ' + esc(d.description) : ''}</span></a>`).join('') || '<p class="mu">Chưa có bộ thẻ nào. Tạo bộ đầu tiên ở trên.</p>'}`);
  $('#f').onsubmit = async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    busy(app, $('#f button'), async () => { const r = await api('/decks', 'POST', data); location.hash = '#/deck/' + r.id; });
  };
}

async function deckView(id) {
  const { deck, cards } = await api('/decks/' + id);
  shell(`<p><a href="#/">← Tất cả bộ thẻ</a></p><h1>${esc(deck.title)}</h1><p class="mu">${esc(deck.description)}</p>
  <div class="row"><a class="btn" href="#/study/${id}">Học ${cards.length} thẻ</a><a class="btn ghost" href="#/quiz/${id}">Kiểm tra</a><button class="ghost" id="ren">Đổi tên</button><button class="ghost" id="shr">${deck.share_code ? 'Quản lý chia sẻ' : 'Chia sẻ'}</button><button class="danger" id="del">Xoá bộ thẻ</button></div>
  <h3>Thêm thẻ</h3>
  <form id="f" class="row"><input name="front" placeholder="Thuật ngữ" required><input name="back" placeholder="Định nghĩa" required><button>Thêm thẻ</button></form>
  <details><summary>Nhập nhiều thẻ cùng lúc</summary><textarea id="bulk" rows="5" placeholder="Mỗi dòng một thẻ: thuật ngữ | định nghĩa"></textarea><button id="imp">Nhập thẻ</button></details>
  <h3>Danh sách thẻ</h3>
  ${cards.map((c) => `<div class="row item" data-id="${c.id}"><input data-k="front" value="${esc(c.front)}"><input data-k="back" value="${esc(c.back)}"><button class="ghost x" title="Xoá thẻ">✕</button></div>`).join('') || '<p class="mu">Chưa có thẻ nào.</p>'}`);
  const again = route;
  $('#f').onsubmit = (e) => { e.preventDefault(); const data = Object.fromEntries(new FormData(e.target)); busy(app, $('#f button'), async () => { await api(`/decks/${id}/cards`, 'POST', data); again(); }); };
  $('#imp').onclick = () => {
    const list = $('#bulk').value.split('\n').map((l) => l.split('|')).filter((p) => p.length >= 2).map((p) => ({ front: p[0], back: p.slice(1).join('|') }));
    if (list.length) busy(app, $('#imp'), async () => { await api(`/decks/${id}/cards`, 'POST', { cards: list }); again(); });
  };
  $('#ren').onclick = () => { const t = prompt('Tên mới:', deck.title); if (t) busy(app, $('#ren'), async () => { await api('/decks/' + id, 'PUT', { title: t }); again(); }); };
  $('#shr').onclick = () => shareDialog(id, deck.share_code, again);
  $('#del').onclick = () => { if (confirm('Xoá bộ thẻ này và toàn bộ thẻ bên trong?')) busy(app, $('#del'), async () => { await api('/decks/' + id, 'DELETE'); location.hash = '#/'; }); };
  document.querySelectorAll('.item').forEach((row) => {
    const cid = row.dataset.id;
    row.querySelectorAll('input').forEach((i) => (i.onchange = () => busy(row, null, () => api('/cards/' + cid, 'PUT', { front: row.querySelector('[data-k=front]').value, back: row.querySelector('[data-k=back]').value }), { restore: true })));
    row.querySelector('.x').onclick = () => busy(app, row.querySelector('.x'), async () => { await api('/cards/' + cid, 'DELETE'); again(); });
  });
}

// Chiều học: 'fb' = nhìn thuật ngữ đoán định nghĩa, 'bf' = ngược lại, 'mix' = ngẫu nhiên từng thẻ. Nhớ lựa chọn trong trình duyệt.
const DIRS = { fb: 'Thuật ngữ → Định nghĩa', bf: 'Định nghĩa → Thuật ngữ', mix: 'Trộn hai chiều' };
const getDir = () => { try { const d = localStorage.getItem('dir'); return DIRS[d] ? d : 'fb'; } catch { return 'fb'; } };
const setDir = (d) => { try { localStorage.setItem('dir', d); } catch { /* bỏ qua */ } };
const dirSelect = (cur) => `<select id="dir" aria-label="Chiều học">${Object.entries(DIRS).map(([k, v]) => `<option value="${k}"${k === cur ? ' selected' : ''}>${v}</option>`).join('')}</select>`;
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
// Đổi thẻ thành cặp hỏi/đáp theo chiều học
const ask = (c, dir) => { const rev = dir === 'bf' || (dir === 'mix' && Math.random() < 0.5); return { id: c.id, rev, q: rev ? c.back : c.front, a: rev ? c.front : c.back }; };
const norm = (s) => String(s).normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ');

const shareUrl = (code) => `${location.origin}/#/shared/${code}`;
async function shareDialog(id, code, again) {
  if (!code) {
    if (!confirm('Tạo liên kết chia sẻ? Bất kỳ ai có liên kết và đã đăng nhập đều xem và sao chép được bộ thẻ này (họ không sửa được bản của bạn).')) return;
    return busy(app, $('#shr'), async () => { code = (await api(`/decks/${id}/share`, 'POST')).code; again(); setTimeout(() => prompt('Liên kết chia sẻ:', shareUrl(code)), 300); });
  }
  const act = prompt(`Liên kết chia sẻ (copy bên dưới). Gõ "thu hồi" rồi OK để ngừng chia sẻ:`, shareUrl(code));
  if (act && act.trim().toLowerCase() === 'thu hồi') busy(app, $('#shr'), async () => { await api(`/decks/${id}/share`, 'DELETE'); again(); });
}

async function sharedView(code) {
  const { deck, cards } = await api('/shared/' + code);
  shell(`<p><a href="#/">← Tất cả bộ thẻ</a></p><h1>${esc(deck.title)}</h1>
  <p class="mu">Chia sẻ bởi <b>${esc(deck.owner)}</b> · ${cards.length} thẻ${deck.description ? ' · ' + esc(deck.description) : ''}</p>
  <div class="row">${deck.mine ? `<a class="btn" href="#/deck/${deck.id}">Mở bộ thẻ của bạn</a>` : '<button id="cp">Sao chép về tài khoản của tôi</button>'}</div>
  ${cards.map((c) => `<div class="row item"><input value="${esc(c.front)}" readonly><input value="${esc(c.back)}" readonly></div>`).join('')}`);
  if ($('#cp')) $('#cp').onclick = () => busy(app, $('#cp'), async () => { const r = await api(`/shared/${code}/copy`, 'POST'); location.hash = '#/deck/' + r.id; });
}

async function studyView(id) {
  const { deck, cards } = await api('/decks/' + id);
  if (!cards.length) { location.hash = '#/deck/' + id; return; }
  let dir = getDir(), list, i, known;
  const start = (src) => { list = src.map((c) => ask(c, dir)); i = 0; known = new Set(); };
  const flip = () => $('#fc')?.classList.toggle('flip');
  const mark = (ok) => { if (ok) known.add(list[i].id); else known.delete(list[i].id); next(); };
  const next = () => { if (i + 1 >= list.length) return done(); i++; draw(); };
  const head = `<p><a href="#/deck/${id}">← ${esc(deck.title)}</a></p>`;
  const bindDir = () => { $('#dir').onchange = (e) => { dir = e.target.value; setDir(dir); start(cards); draw(); }; };
  const done = () => {
    const miss = list.filter((x) => !known.has(x.id));
    shell(`${head}<h1 class="c">Hoàn thành 🎉</h1><p class="c">Đã thuộc <b>${known.size}</b> / ${list.length} thẻ</p>
    <div class="row c">${miss.length ? `<button id="rv">Ôn ${miss.length} thẻ chưa thuộc</button>` : ''}<button class="ghost" id="ag">Học lại từ đầu</button><a class="btn ghost" href="#/quiz/${id}">Làm bài kiểm tra</a></div>`);
    if ($('#rv')) $('#rv').onclick = () => { const ids = new Set(miss.map((x) => x.id)); start(cards.filter((c) => ids.has(c.id))); draw(); };
    $('#ag').onclick = () => { start(cards); draw(); };
  };
  const draw = () => {
    const c = list[i];
    shell(`${head}<div class="row c">${dirSelect(dir)}<button id="sh" class="ghost">Trộn thẻ</button></div>
    <p class="mu c">${i + 1} / ${list.length} · đã thuộc ${known.size}</p>
    <div class="fc" id="fc" tabindex="0"><div class="in"><div class="face">${esc(c.q)}</div><div class="face back">${esc(c.a)}</div></div></div>
    <div class="row c"><button id="pv" class="ghost">← Trước</button><button id="no" class="danger">Chưa thuộc</button><button id="ok">Đã thuộc</button><button id="nx" class="ghost">Tiếp →</button></div>
    <p class="mu c">Nhấn vào thẻ hoặc Space để lật · ← → chuyển thẻ · 1 = chưa thuộc, 2 = đã thuộc.</p>`);
    $('#fc').onclick = flip; bindDir();
    $('#pv').onclick = () => { i = (i - 1 + list.length) % list.length; draw(); };
    $('#nx').onclick = next; $('#no').onclick = () => mark(false); $('#ok').onclick = () => mark(true);
    $('#sh').onclick = () => { shuffle(list); i = 0; draw(); };
  };
  document.onkeydown = (e) => {
    if (e.target.matches('select')) return;
    if (e.code === 'Space') { e.preventDefault(); flip(); }
    else if (e.key === 'ArrowRight') $('#nx')?.click();
    else if (e.key === 'ArrowLeft') $('#pv')?.click();
    else if (e.key === '1') $('#no')?.click();
    else if (e.key === '2') $('#ok')?.click();
  };
  start(cards); draw();
}

async function quizView(id) {
  const { deck, cards } = await api('/decks/' + id);
  if (!cards.length) { location.hash = '#/deck/' + id; return; }
  const head = `<p><a href="#/deck/${id}">← ${esc(deck.title)}</a></p>`;
  let dir = getDir(), mode = cards.length >= 2 ? 'choice' : 'type', qs, i, wrong;
  const setup = () => {
    shell(`${head}<h1>Kiểm tra</h1><p class="mu">${cards.length} thẻ</p>
    <div class="row"><label>Chiều: ${dirSelect(dir)}</label>
    <label>Kiểu: <select id="mode"><option value="choice"${mode === 'choice' ? ' selected' : ''}${cards.length < 2 ? ' disabled' : ''}>Trắc nghiệm</option><option value="type"${mode === 'type' ? ' selected' : ''}>Tự gõ đáp án</option></select></label></div>
    <button id="go">Bắt đầu</button>`);
    $('#dir').onchange = (e) => { dir = e.target.value; setDir(dir); };
    $('#mode').onchange = (e) => { mode = e.target.value; };
    $('#go').onclick = () => begin(cards);
  };
  const begin = (src) => { qs = shuffle(src.map((c) => ask(c, dir))); i = 0; wrong = []; show(); };
  const result = () => {
    const ok = qs.length - wrong.length;
    shell(`${head}<h1 class="c">Kết quả: ${ok} / ${qs.length}</h1><p class="c mu">${Math.round((ok / qs.length) * 100)}% đúng</p>
    ${wrong.length ? `<h3>Cần ôn lại</h3>${wrong.map((w) => `<div class="deck"><b>${esc(w.q)}</b><br><span class="mu">${esc(w.a)}</span></div>`).join('')}` : ''}
    <div class="row c">${wrong.length ? '<button id="rt">Làm lại câu sai</button>' : ''}<button class="ghost" id="ag">Làm bài mới</button></div>`);
    if ($('#rt')) $('#rt').onclick = () => begin(cards.filter((c) => wrong.some((w) => w.id === c.id)));
    $('#ag').onclick = setup;
  };
  const feedback = (q, ok, given) => {
    if (!ok) wrong.push(q);
    $('#fb').innerHTML = `<p class="${ok ? 'good' : 'err'}">${ok ? '✓ Chính xác!' : `✗ Sai${given ? ` (bạn chọn/gõ: ${esc(given)})` : ''}. Đáp án: <b>${esc(q.a)}</b>`}</p><button id="nx">${i + 1 >= qs.length ? 'Xem kết quả' : 'Câu tiếp →'}</button>`;
    app.querySelectorAll('.opt,#ans,#sub').forEach((e) => (e.disabled = true));
    $('#nx').focus(); $('#nx').onclick = () => { i++; i >= qs.length ? result() : show(); };
  };
  const show = () => {
    const q = qs[i];
    const pool = [...new Set(cards.filter((c) => c.id !== q.id).map((c) => (q.rev ? c.front : c.back)).filter((x) => x !== q.a))];
    const opts = mode === 'choice' ? shuffle([q.a, ...shuffle(pool).slice(0, 3)]) : null;
    shell(`${head}<p class="mu c">Câu ${i + 1} / ${qs.length}</p><div class="face qf">${esc(q.q)}</div>
    ${mode === 'choice' ? `<div class="opts">${opts.map((o, k) => `<button class="ghost opt" data-k="${k}">${esc(o)}</button>`).join('')}</div>`
      : `<form id="tf" class="row"><input id="ans" placeholder="Gõ đáp án" autocomplete="off" required><button id="sub">Kiểm tra</button></form>`}
    <div id="fb" class="c"></div>`);
    if (mode === 'choice') app.querySelectorAll('.opt').forEach((b) => (b.onclick = () => feedback(q, opts[b.dataset.k] === q.a, opts[b.dataset.k])));
    else { $('#ans').focus(); $('#tf').onsubmit = (e) => { e.preventDefault(); const v = $('#ans').value; feedback(q, norm(v) === norm(q.a), v); }; }
  };
  setup();
}

async function route() {
  document.onkeydown = null;
  const [, page, id] = location.hash.split('/');
  app.classList.add('loading');
  try {
    if (!user) { const m = await api('/me').catch(() => null); user = m && m.username; }
    if (!user) { if (page === 'shared') pending = location.hash; return authView(page === 'register'); }
    if (page === 'deck') return await deckView(id);
    if (page === 'study') return await studyView(id);
    if (page === 'shared') return await sharedView(id);
    if (page === 'quiz') return await quizView(id);
    return await decksView();
  } catch (e) {
    if (e.status === 401) { user = null; return authView(false); }
    shell(`<p class="err">${esc(e.message)}</p><a href="#/">Về trang chủ</a>`);
  } finally { app.classList.remove('loading'); delete app.dataset.busy; }
}
addEventListener('hashchange', route);
route();
